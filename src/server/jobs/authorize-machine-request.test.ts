import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertMachineRequestAuthorized } from "@/server/jobs/authorize-machine-request";

beforeEach(() => {
  // CRON_SECRET is accepted alongside the named secret, so a value leaking in
  // from .env.local would make the fails-closed test pass for the wrong reason.
  vi.stubEnv("CRON_SECRET", "");
  vi.stubEnv("MONITORING_SECRET", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function requestWith(token: string) {
  return new Request("https://ruvo.example/api/monitoring/absence", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("assertMachineRequestAuthorized", () => {
  it("refuses every request when no secret is configured", () => {
    // An unconfigured secret must never mean an open endpoint: that turns a
    // deployment mistake into a publicly invokable privileged route.
    expect(() =>
      assertMachineRequestAuthorized(requestWith("anything"), "MONITORING_SECRET"),
    ).toThrow(/not configured/i);
  });

  it("accepts the named secret", () => {
    vi.stubEnv("MONITORING_SECRET", "s3cret-value-long-enough");

    expect(() =>
      assertMachineRequestAuthorized(
        requestWith("s3cret-value-long-enough"),
        "MONITORING_SECRET",
      ),
    ).not.toThrow();
  });

  it("accepts CRON_SECRET, which is what a platform scheduler injects", () => {
    vi.stubEnv("CRON_SECRET", "vercel-injected-value");

    expect(() =>
      assertMachineRequestAuthorized(
        requestWith("vercel-injected-value"),
        "MONITORING_SECRET",
      ),
    ).not.toThrow();
  });

  it("rejects a wrong token", () => {
    vi.stubEnv("MONITORING_SECRET", "s3cret-value-long-enough");

    expect(() =>
      assertMachineRequestAuthorized(requestWith("wrong"), "MONITORING_SECRET"),
    ).toThrow(/bearer token/i);
  });

  it("rejects a missing Authorization header", () => {
    vi.stubEnv("MONITORING_SECRET", "s3cret-value-long-enough");

    expect(() =>
      assertMachineRequestAuthorized(
        new Request("https://ruvo.example/x"),
        "MONITORING_SECRET",
      ),
    ).toThrow(/bearer token/i);
  });

  it("rejects a token that is a prefix of the secret", () => {
    // The comparison hashes both sides to a fixed width first, so it is
    // length-independent as well as constant-time.
    vi.stubEnv("MONITORING_SECRET", "s3cret-value-long-enough");

    expect(() =>
      assertMachineRequestAuthorized(requestWith("s3cret"), "MONITORING_SECRET"),
    ).toThrow();
  });

  it("keeps each route's secret distinct", () => {
    // The drain's secret must not open the monitoring route.
    vi.stubEnv("JOBS_DRAIN_SECRET", "drain-only-value");

    expect(() =>
      assertMachineRequestAuthorized(requestWith("drain-only-value"), "MONITORING_SECRET"),
    ).toThrow(/not configured/i);
  });
});
