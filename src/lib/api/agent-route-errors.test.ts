import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every agent API route must delegate error mapping to routeErrorResponse.
 *
 * This exists because a hand-rolled catch block silently swallowed an AppError:
 * registerCurrentAgentListingImages correctly rejected a forged storage path
 * with a 422 AppError, but the route's own status mapping did not know about
 * AppError and returned 500 INTERNAL_ERROR. The rejection worked; the contract
 * did not. Service-level tests could not see it because they assert on the
 * thrown error, not the response.
 */
function collectRouteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      return collectRouteFiles(full);
    }

    return entry === "route.ts" ? [full] : [];
  });
}

describe("agent API routes", () => {
  const routeFiles = collectRouteFiles(join(process.cwd(), "src/app/api/agent"));

  it("finds the agent routes", () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it.each(routeFiles)("%s delegates errors to routeErrorResponse", (file) => {
    const source = readFileSync(file, "utf8");

    expect(source).toContain("routeErrorResponse(error, requestId)");
  });

  it.each(routeFiles)("%s does not hand-roll status mapping", (file) => {
    const source = readFileSync(file, "utf8");

    // The tell-tale of the old pattern: deriving an HTTP status by string
    // matching the error message inside the route.
    expect(source).not.toMatch(/const status =\s*\n?\s*message ===/);
  });
});
