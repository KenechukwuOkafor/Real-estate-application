import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runWithContext } from "@/lib/observability/context";
import { log } from "@/lib/observability/logger";

const ORIGINAL = { ...process.env };
let written: string[] = [];

beforeEach(() => {
  written = [];
  // Production mode, so the emitted line is the machine-readable JSON an
  // operator actually greps rather than the human-readable development form.
  process.env.NEXT_PUBLIC_APP_ENV = "production";
  vi.spyOn(console, "log").mockImplementation((line: string) => {
    written.push(line);
  });
  vi.spyOn(console, "warn").mockImplementation((line: string) => {
    written.push(line);
  });
  vi.spyOn(console, "error").mockImplementation((line: string) => {
    written.push(line);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL };
});

describe("structured logging", () => {
  it("emits every field REB-ENG-005 requires", async () => {
    await runWithContext(
      { requestId: "req-abcdef12", service: "listing-api" },
      async () => {
        log.error({
          duration: 42,
          errorCode: "NOT_FOUND",
          event: "ListingApprovalFailed",
        });
      },
    );

    const record = JSON.parse(written[0]);

    expect(record).toMatchObject({
      duration: 42,
      environment: "production",
      errorCode: "NOT_FOUND",
      event: "ListingApprovalFailed",
      level: "ERROR",
      requestId: "req-abcdef12",
      service: "listing-api",
    });
    expect(Date.parse(record.timestamp)).not.toBeNaN();
  });

  it("includes the user id once identity is attached", async () => {
    await runWithContext(
      { requestId: "req-1", service: "api", userId: "user-123" },
      async () => {
        log.info({ event: "ListingPublished" });
      },
    );

    expect(JSON.parse(written[0]).userId).toBe("user-123");
  });

  it("carries the enqueuing request id so a job's lines trace back", async () => {
    await runWithContext(
      {
        enqueuedByRequestId: "req-origin",
        jobId: "job-1",
        requestId: "req-origin",
        service: "job:diagnostics.echo",
      },
      async () => {
        log.info({ event: "JobCompleted" });
      },
    );

    const record = JSON.parse(written[0]);

    expect(record.enqueuedByRequestId).toBe("req-origin");
    expect(record.service).toBe("job:diagnostics.echo");
  });

  it("emits one JSON object per line, so a log pipeline can parse it", async () => {
    await runWithContext({ requestId: "req-1", service: "api" }, async () => {
      log.info({ event: "RequestReceived" });
    });

    expect(written[0]).not.toContain("\n");
    expect(() => JSON.parse(written[0])).not.toThrow();
  });

  it("sanitises what a caller logs, because the logger is not a trusted caller", async () => {
    // The realistic accident: logging a whole request object without looking
    // at what is inside it.
    await runWithContext({ requestId: "req-1", service: "api" }, async () => {
      log.info({
        authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl",
        event: "RequestReceived",
      });
    });

    expect(written[0]).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  it("survives having no context at all", () => {
    // Scripts and tests have no middleware. A missing id is a degraded line,
    // never a thrown error.
    expect(() => log.info({ event: "ScriptStarted" })).not.toThrow();
  });

  it("drops DEBUG in production and keeps it below that", () => {
    log.debug({ event: "Noisy" });
    expect(written).toHaveLength(0);

    process.env.NEXT_PUBLIC_APP_ENV = "preview";
    log.debug({ event: "Noisy" });
    expect(written).toHaveLength(1);
  });
});
