import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Nothing may assume a listing is annual.
 *
 * "per year" was hardcoded in one module, imported by the card, duplicated as
 * the literal "Annual price" on the detail page, and pinned by a test that
 * asserted the constant equalled "per year". Four places, one assumption, and
 * the test made it harder to fix rather than easier.
 *
 * A grep is a blunt instrument, but the failure it guards is exactly the kind a
 * grep catches: someone writing the label directly instead of reading the
 * column, in a component far from this one, where no unit test would look. The
 * scan is over source rather than rendered output for the same reason — the
 * point is that the string is not written down, anywhere, outside the one
 * module allowed to produce it.
 */

const SOURCE_ROOT = join(process.cwd(), "src");

/**
 * The single module permitted to name a duration, plus the tests that assert on
 * what it produces. Everything else must derive.
 *
 * Listed by exact path so joining this list is a visible decision in review
 * rather than a silent omission.
 */
const ALLOWED: ReadonlySet<string> = new Set([
  "src/features/listings/rental-duration.ts",
  "src/features/listings/rental-duration.test.ts",
  "src/features/listings/components/listing-card.test.tsx",
  "src/features/listings/no-hardcoded-duration.test.ts",
]);

/**
 * Phrases that only make sense if the writer assumed the duration.
 *
 * "annual" and "yearly" as user-facing prose are the tell. The enum value
 * 'yearly' is deliberately not matched on its own — it is the correct thing to
 * write in a fixture, a filter or a migration — so the patterns target the
 * rendered wording instead.
 */
const FORBIDDEN: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: '"per year" written as a literal', pattern: /["'`]per year["'`]/i },
  { label: '"Annual price" written as a literal', pattern: /annual price/i },
  { label: "RENT_PERIOD_LABEL, the removed constant", pattern: /RENT_PERIOD_LABEL/ },
  { label: "an import of the removed rent-period module", pattern: /listings\/rent-period/ },
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

describe("no listing assumes an annual duration", () => {
  const files = collectSourceFiles(SOURCE_ROOT);

  it("finds source files to scan", () => {
    // Without this the suite passes vacuously if the walk ever breaks, which is
    // the failure mode of every guard test that greps.
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(FORBIDDEN)("nothing contains $label", ({ pattern }) => {
    const offenders = files
      .map((file) => ({
        contents: readFileSync(file, "utf8"),
        path: relative(process.cwd(), file).split(sep).join("/"),
      }))
      .filter(({ contents, path }) => !ALLOWED.has(path) && pattern.test(contents))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("the removed rent-period module is gone", () => {
    const paths = files.map((file) =>
      relative(process.cwd(), file).split(sep).join("/"),
    );

    expect(paths).not.toContain("src/features/listings/rent-period.ts");
    expect(paths).not.toContain("src/features/listings/rent-period.test.ts");
  });
});
