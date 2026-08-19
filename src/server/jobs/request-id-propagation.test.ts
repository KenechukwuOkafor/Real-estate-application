import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn<(fn: string, args?: Record<string, unknown>) => Promise<unknown>>(),
}));

vi.mock("@/lib/db/supabase", () => ({
  getSupabaseAdminClient: vi.fn(() => ({ rpc })),
}));

import { currentContext, runWithContext } from "@/lib/observability/context";
import { drainQueue } from "@/server/jobs/drain";
import { enqueueJob } from "@/server/jobs/enqueue";
import { JOB_HANDLERS } from "@/server/jobs/registry";

type Ctx = ReturnType<typeof currentContext>;

/**
 * A claimed job row, shaped as claim_jobs returns it.
 *
 * Built from the real column set rather than the two fields the drain happens
 * to read, so a fixture cannot pass while representing a row the database
 * would never produce.
 */
function claimedJob(overrides: Record<string, unknown> = {}) {
  return {
    attempts: 1,
    completed_at: null,
    created_at: new Date().toISOString(),
    enqueued_by_request_id: null,
    id: "job-1",
    last_error: null,
    max_attempts: 5,
    payload: { message: "hi" },
    queue: "default",
    result: null,
    scheduled_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    status: "running",
    type: "diagnostics.echo",
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function claimReturns(jobs: Array<Record<string, unknown>>) {
  rpc.mockImplementation(async (fn: string) => {
    if (fn === "claim_jobs") {
      return { data: jobs, error: null };
    }

    return { data: null, error: null };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a request id reaches the job it enqueued", () => {
  it("travels request -> enqueue_job -> claim -> handler context", async () => {
    const REQUEST_ID = "req-0f1e2d3c";
    let seen: Ctx;

    // 1. A request enqueues work. The id is ambient, never a parameter.
    rpc.mockResolvedValueOnce({ data: "job-1", error: null });

    await runWithContext({ requestId: REQUEST_ID, service: "api" }, async () => {
      await enqueueJob({ payload: { message: "hi" }, type: "diagnostics.echo" });
    });

    expect(
      (rpc.mock.calls[0]?.[1] as Record<string, unknown>)?.request_id,
    ).toBe(REQUEST_ID);

    // 2. Minutes later, a drain claims that row.
    vi.spyOn(JOB_HANDLERS["diagnostics.echo"], "handle").mockImplementation(
      async (payload) => {
        seen = currentContext();
        return { echoed: (payload as { message: string }).message };
      },
    );

    claimReturns([claimedJob({ enqueued_by_request_id: REQUEST_ID })]);

    await drainQueue("default");

    // 3. The handler ran under the id of the request that queued it.
    expect(seen?.requestId).toBe(REQUEST_ID);
    expect(seen?.enqueuedByRequestId).toBe(REQUEST_ID);
    expect(seen?.jobId).toBe("job-1");
    expect(seen?.service).toBe("job:diagnostics.echo");
  });

  it("does not let one job inherit another's request id", async () => {
    // The reason the drain uses runWithContext and not enterWith.
    const seen: Array<string | undefined> = [];

    vi.spyOn(JOB_HANDLERS["diagnostics.echo"], "handle").mockImplementation(
      async () => {
        seen.push(currentContext()?.requestId);
        return { echoed: "hi" };
      },
    );

    claimReturns([
      claimedJob({ enqueued_by_request_id: "req-aaaaaaaa", id: "job-0" }),
      claimedJob({ enqueued_by_request_id: "req-bbbbbbbb", id: "job-1" }),
    ]);

    await drainQueue("default");

    expect(seen).toEqual(["req-aaaaaaaa", "req-bbbbbbbb"]);
  });

  it("falls back to the drain's own id for a job with no correlation", async () => {
    let seen: Ctx;

    vi.spyOn(JOB_HANDLERS["diagnostics.echo"], "handle").mockImplementation(
      async () => {
        seen = currentContext();
        return { echoed: "hi" };
      },
    );

    claimReturns([claimedJob({ enqueued_by_request_id: null })]);

    await drainQueue("default");

    // A job enqueued before this column existed still gets an id, so its lines
    // are correlated with each other even though they lead nowhere further.
    expect(seen?.requestId).toBeTruthy();
    expect(seen?.enqueuedByRequestId).toBeUndefined();
    expect(seen?.jobId).toBe("job-1");
  });

  it("does not leak a job's context back into the drain", async () => {
    vi.spyOn(JOB_HANDLERS["diagnostics.echo"], "handle").mockImplementation(
      async () => ({ echoed: "hi" }),
    );

    claimReturns([claimedJob({ enqueued_by_request_id: "req-aaaaaaaa" })]);

    await runWithContext({ requestId: "req-drain", service: "api" }, async () => {
      await drainQueue("default");

      // If the drain used enterWith, this would now read "req-aaaaaaaa".
      expect(currentContext()?.requestId).toBe("req-drain");
    });
  });
});
