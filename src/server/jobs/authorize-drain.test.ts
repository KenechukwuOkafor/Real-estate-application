import { afterEach, describe, expect, it, vi } from "vitest";

import { assertDrainRequestAuthorized } from "@/server/jobs/authorize-drain";

function requestWith(authorization?: string) {
  return new Request("http://localhost/api/jobs/drain", {
    headers: authorization ? { authorization } : {},
    method: "POST",
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("drain authorization", () => {
  it("accepts a matching bearer token", () => {
    vi.stubEnv("JOBS_DRAIN_SECRET", "correct-horse-battery-staple");

    expect(() =>
      assertDrainRequestAuthorized(requestWith("Bearer correct-horse-battery-staple")),
    ).not.toThrow();
  });

  it("refuses an anonymous caller", () => {
    vi.stubEnv("JOBS_DRAIN_SECRET", "correct-horse-battery-staple");

    expect(() => assertDrainRequestAuthorized(requestWith())).toThrow(
      /bearer token/i,
    );
  });

  it("refuses a wrong token", () => {
    vi.stubEnv("JOBS_DRAIN_SECRET", "correct-horse-battery-staple");

    expect(() =>
      assertDrainRequestAuthorized(requestWith("Bearer wrong")),
    ).toThrow(/bearer token/i);
  });

  it("refuses a token without the Bearer scheme", () => {
    vi.stubEnv("JOBS_DRAIN_SECRET", "correct-horse-battery-staple");

    expect(() =>
      assertDrainRequestAuthorized(requestWith("correct-horse-battery-staple")),
    ).toThrow();
  });

  it("fails closed when the secret is not configured", () => {
    vi.stubEnv("JOBS_DRAIN_SECRET", "");

    // An unset secret must never mean an open endpoint: the drain runs with the
    // service-role key, so a deployment mistake would expose a privileged path.
    expect(() =>
      assertDrainRequestAuthorized(requestWith("Bearer anything")),
    ).toThrow(/not configured/i);
  });

  it("does not leak secret length by rejecting differently", () => {
    vi.stubEnv("JOBS_DRAIN_SECRET", "correct-horse-battery-staple");

    // Both comparisons run over equal-length digests, so neither the error nor
    // the path taken differs with the presented token's length.
    for (const attempt of ["Bearer a", "Bearer " + "a".repeat(500)]) {
      expect(() => assertDrainRequestAuthorized(requestWith(attempt))).toThrow(
        /bearer token/i,
      );
    }
  });
});
