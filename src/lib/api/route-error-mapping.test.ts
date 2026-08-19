import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every API route must delegate error mapping to routeErrorResponse.
 *
 * This exists because a hand-rolled catch block silently swallowed an AppError:
 * registerCurrentAgentListingImages correctly rejected a forged storage path
 * with a 422 AppError, but the route's own status mapping did not know about
 * AppError and returned 500 INTERNAL_ERROR. The rejection worked; the contract
 * did not. Service-level tests could not see it because they assert on the
 * thrown error, not the response.
 *
 * It matters more once RLS lands. Denials surface as errors, and a denial that
 * returns 500 instead of 403 is both a broken contract and an information leak:
 * the status difference tells a caller whether a row exists that they are not
 * allowed to read. Uniform mapping has to be in place before the database
 * starts refusing things.
 */

/**
 * Routes that deliberately do not surface errors as error responses.
 *
 * Keyed by repo-relative path so a new route cannot join by accident — adding
 * an entry is a visible decision in review, not a silent omission.
 */
const INTENTIONAL_EXEMPTIONS: Record<string, string> = {
  "src/app/api/listings/[slugOrPublicId]/views/route.ts":
    "BR-ANA-003 (Critical): analytics collection must not block user actions. " +
    "This is a fire-and-forget beacon that reports failures as { tracked: false } " +
    "with a 200 rather than surfacing them. Mapping its errors would break the rule.",
  "src/app/api/monitoring/absence/route.ts":
    "An absence check reports a verdict, it does not raise one. It answers 200 " +
    "even when a threshold is breached, because a non-200 would make a stopped " +
    "drain and a broken monitoring route indistinguishable — which is the class " +
    "of failure the route exists to detect. Its only error response is a 401 for " +
    "an unauthorized caller, written by hand so that an authorization failure " +
    "cannot be confused with a check result. A failed check is reported to " +
    "Sentry and returned as status 'errored' in the body.",
};

function collectRouteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      return collectRouteFiles(full);
    }

    return entry === "route.ts" ? [full] : [];
  });
}

const apiRoot = join(process.cwd(), "src/app/api");
const routeFiles = collectRouteFiles(apiRoot).map((file) =>
  relative(process.cwd(), file).split(sep).join("/"),
);

const mappedRoutes = routeFiles.filter(
  (file) => !(file in INTENTIONAL_EXEMPTIONS),
);

describe("API route error mapping", () => {
  it("finds the API routes", () => {
    expect(routeFiles.length).toBeGreaterThan(20);
  });

  it("every exemption still points at a real route", () => {
    for (const exempt of Object.keys(INTENTIONAL_EXEMPTIONS)) {
      expect(routeFiles).toContain(exempt);
    }
  });

  it.each(mappedRoutes)("%s delegates errors to routeErrorResponse", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");

    expect(source).toContain("routeErrorResponse(error, requestId)");
  });

  it.each(mappedRoutes)("%s does not hand-roll status mapping", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");

    // The tell-tale of the old pattern: deriving an HTTP status by string
    // matching the error message inside the route.
    expect(source).not.toMatch(/const status =\s*\n?\s*message ===/);
  });

  it.each(mappedRoutes)("%s does not hard-code a 500 response", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");

    // A literal 500 in a route means something decided the status locally
    // instead of letting resolveRouteError classify the error.
    expect(source).not.toMatch(/status:\s*500/);
  });
});
