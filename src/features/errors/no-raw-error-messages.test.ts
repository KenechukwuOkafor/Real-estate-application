import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * No component renders an API error message as user-facing copy.
 *
 * Fourteen of them did, which is how an agent came to read AGENT_NOT_VERIFIED
 * in a red box. The fix is a code-to-copy map; this is what stops the next
 * component from skipping it, because `payload?.error?.message ?? "..."` is the
 * obvious thing to write and it works — it just produces developer vocabulary
 * on a user's screen.
 *
 * It also guards the other half: branching on message TEXT. That coupling is
 * what forced the observability slice to preserve thrown messages byte for
 * byte, since rewording one would have silently changed control flow.
 */

const SOURCE_ROOT = join(process.cwd(), "src");

/**
 * Paths permitted to touch an error message, with the reason.
 *
 * Listed exactly so joining the list is a visible decision in review.
 */
const ALLOWED: ReadonlyMap<string, string> = new Map([
  [
    "src/features/errors/error-copy.ts",
    "The map itself. It accepts the payload and deliberately ignores the message.",
  ],
  [
    "src/features/errors/error-copy.test.ts",
    "Asserts that the message is ignored, so it has to mention it.",
  ],
  [
    "src/features/errors/no-raw-error-messages.test.ts",
    "This file.",
  ],
  [
    "src/features/auth/components/dev-login-panel.tsx",
    "Local-only developer harness, never shipped to an agent or a seeker. The " +
      "raw message from Clerk is the useful thing there, and translating it " +
      "into reassuring copy would hide exactly what a developer is debugging.",
  ],
]);

const FORBIDDEN: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  {
    label: "rendering an API error message as copy",
    pattern: /error\?\.\s*message\s*\?\?|error\.message\s*\?\?/,
  },
  {
    label: "branching on error message text",
    pattern: /error\?\.\s*message\s*===|error\.message\s*===/,
  },
];

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      return collectSourceFiles(full);
    }

    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

describe("no component reads an error message", () => {
  const files = collectSourceFiles(SOURCE_ROOT);

  it("finds source files to scan", () => {
    // Without this the suite passes vacuously if the walk ever breaks, which is
    // how every grep-shaped guard eventually fails.
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(FORBIDDEN)("nothing is $label", ({ pattern }) => {
    const offenders = files
      .map((file) => ({
        contents: readFileSync(file, "utf8"),
        path: relative(process.cwd(), file).split(sep).join("/"),
      }))
      .filter(({ contents, path }) => !ALLOWED.has(path) && pattern.test(contents))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  /**
   * Server code may still THROW messages — they are developer notes and they
   * reach logs and Sentry, which is where they belong. The rule is only that
   * nothing renders one or decides anything from one.
   */
  it("still allows the server to attach a message to an error", () => {
    const appError = readFileSync(
      join(SOURCE_ROOT, "lib", "api", "app-error.ts"),
      "utf8",
    );

    expect(appError).toContain("message");
  });
});
