import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureMessage, getJobQueueHealth } = vi.hoisted(() => ({
  captureMessage: vi.fn<(message: string, context?: unknown) => boolean>(() => true),
  getJobQueueHealth: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@/lib/observability/sentry", () => ({
  captureMessage,
  captureUnconditionally: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("@/server/jobs/drain", () => ({ getJobQueueHealth }));
vi.mock("@/lib/api/request-id", () => ({
  getRequestId: vi.fn(async () => "req-abcdef12"),
}));

import { GET } from "@/app/api/monitoring/absence/route";

function authorized() {
  return new Request("https://ruvo.example/api/monitoring/absence", {
    headers: { authorization: "Bearer test-secret-value" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  captureMessage.mockReturnValue(true);
  vi.stubEnv("MONITORING_SECRET", "test-secret-value");
  vi.stubEnv("CRON_SECRET", "");
  vi.stubEnv("JOB_QUEUE_MAX_AGE_SECONDS", "900");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/monitoring/absence", () => {
  it("reports when a lane's oldest queued job is older than the threshold", async () => {
    // ADR-032: alert on age, not depth. Depth reads zero both when everything
    // is healthy and when the drain has stopped.
    getJobQueueHealth.mockResolvedValue([
      { oldest_queued_age_seconds: 1800, queue: "default", queued_count: 4 },
      { oldest_queued_age_seconds: 0, queue: "media", queued_count: 0 },
    ]);

    const response = await GET(authorized());
    const body = await response.json();

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("default"),
      expect.objectContaining({ alertKind: "absence" }),
    );
    expect(body.data.breached).toEqual(["job-queue-age:default"]);
  });

  it("returns 200 on a breach, because a breach is a finding not a route failure", async () => {
    getJobQueueHealth.mockResolvedValue([
      { oldest_queued_age_seconds: 99_999, queue: "default", queued_count: 1 },
    ]);

    // Returning non-200 would make a stopped drain and a broken monitoring
    // route indistinguishable — the class of bug this route exists to end.
    expect((await GET(authorized())).status).toBe(200);
  });

  it("reports nothing when every lane is inside the threshold", async () => {
    getJobQueueHealth.mockResolvedValue([
      { oldest_queued_age_seconds: 12, queue: "default", queued_count: 2 },
      { oldest_queued_age_seconds: 0, queue: "media", queued_count: 0 },
    ]);

    const response = await GET(authorized());

    expect(captureMessage).not.toHaveBeenCalled();
    expect((await response.json()).data.breached).toEqual([]);
  });

  it("does not treat an empty healthy queue as a breach", async () => {
    // Depth zero with age zero is the healthy case, and the stopped case looks
    // nothing like it. That is the whole reason age is the signal.
    getJobQueueHealth.mockResolvedValue([
      { oldest_queued_age_seconds: 0, queue: "default", queued_count: 0 },
    ]);

    await GET(authorized());

    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("reports each breached lane separately", async () => {
    getJobQueueHealth.mockResolvedValue([
      { oldest_queued_age_seconds: 1800, queue: "default", queued_count: 4 },
      { oldest_queued_age_seconds: 5000, queue: "media", queued_count: 1 },
    ]);

    const body = await (await GET(authorized())).json();

    expect(captureMessage).toHaveBeenCalledTimes(2);
    expect(body.data.breached).toEqual([
      "job-queue-age:default",
      "job-queue-age:media",
    ]);
  });

  it("honours a configured threshold", async () => {
    vi.stubEnv("JOB_QUEUE_MAX_AGE_SECONDS", "60");
    getJobQueueHealth.mockResolvedValue([
      { oldest_queued_age_seconds: 120, queue: "default", queued_count: 1 },
    ]);

    await GET(authorized());

    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it("returns 200 and reports when the health query itself fails", async () => {
    getJobQueueHealth.mockRejectedValue(new Error("permission denied"));

    const response = await GET(authorized());
    const body = await response.json();

    // A monitoring route that 500s is a monitoring route that gets ignored.
    expect(response.status).toBe(200);
    expect(body.data.checks[0].status).toBe("errored");
    expect(captureMessage).toHaveBeenCalled();
  });

  it("refuses an unauthorized caller", async () => {
    const response = await GET(
      new Request("https://ruvo.example/api/monitoring/absence"),
    );

    expect(response.status).toBe(401);
    expect(getJobQueueHealth).not.toHaveBeenCalled();
  });
});
