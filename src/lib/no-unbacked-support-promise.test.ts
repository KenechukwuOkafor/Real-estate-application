import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { ERROR_COPY, ERROR_SUPPORT_TOPICS } from "@/features/errors/error-copy";

/**
 * No sentence promises a person the product cannot connect you to.
 *
 * Six strings told an agent to "contact support" while nothing in the product
 * said how — a suspended agent read it, looked for support, and found none.
 * Every one now renders a WhatsApp link with the context prefilled
 * (src/lib/support-contact.ts). This keeps a seventh from arriving: the phrase
 * that sends someone to a person is "Message us on WhatsApp", and it is only
 * ever written next to the link that backs it.
 */

const SOURCE_ROOT = join(process.cwd(), "src");

const SELF = `src${sep}lib${sep}no-unbacked-support-promise.test.ts`;

// "Let us know" is the same promise in other words. The generic fallback said it
// on every unmapped error, agent and seeker alike, with no way to reach anyone.
const FORBIDDEN = /contact\s+(support|us)\b|let\s+us\s+know/i;

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      return collectSourceFiles(full);
    }

    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

describe("no unbacked promise of support", () => {
  const files = collectSourceFiles(SOURCE_ROOT);

  it("finds source files to scan", () => {
    // Without this the suite passes vacuously if the walk ever breaks.
    expect(files.length).toBeGreaterThan(100);
  });

  it('never tells anyone to "contact support", "contact us" or "let us know"', () => {
    const offenders = files
      .map((file) => relative(process.cwd(), file))
      .filter((file) => file !== SELF)
      .filter((file) => FORBIDDEN.test(readFileSync(join(process.cwd(), file), "utf8")));

    expect(offenders).toEqual([]);
  });

  it("detects the phrase it forbids", () => {
    // A guard that cannot fail is not a guard. The pattern must catch the
    // exact strings this slice removed.
    expect(FORBIDDEN.test("Your account cannot submit listings. Contact support.")).toBe(true);
    expect(FORBIDDEN.test("Contact us and we will sort it out.")).toBe(true);
    expect(FORBIDDEN.test("Please try again — if it keeps happening, let us know.")).toBe(true);
    // Not the same thing: a promise we make, not one we ask them to keep.
    expect(FORBIDDEN.test("We will let you know as soon as it is reviewed.")).toBe(false);
    expect(FORBIDDEN.test("Message us on WhatsApp")).toBe(false);
  });

  it("only routes an error to a person when its copy says so", () => {
    // ERROR_SUPPORT_TOPICS is what makes a component render the link. A code
    // listed there whose copy never mentions WhatsApp would render a link the
    // sentence above it does not explain; the reverse would be a promise with
    // no link.
    for (const code of Object.keys(ERROR_SUPPORT_TOPICS)) {
      expect(ERROR_COPY[code], code).toMatch(/WhatsApp/);
    }

    for (const [code, copy] of Object.entries(ERROR_COPY)) {
      if (/WhatsApp/.test(copy)) {
        expect(ERROR_SUPPORT_TOPICS[code], code).toBeDefined();
      }
    }
  });
});
