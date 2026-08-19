import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn<(fn: string, args: Record<string, unknown>) => Promise<unknown>>(),
}));

vi.mock("@/lib/db/supabase", () => ({
  getSupabaseAdminClient: vi.fn(() => ({ rpc })),
}));

import { runWithContext } from "@/lib/observability/context";
import { enqueueJob } from "@/server/jobs/enqueue";

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: "job-uuid-1", error: null });
});

describe("enqueueJob", () => {
  it("passes the ambient request id to the SQL function", async () => {
    await runWithContext({ requestId: "req-abcdef12", service: "api" }, async () => {
      await enqueueJob({ payload: { message: "hi" }, type: "diagnostics.echo" });
    });

    expect(rpc).toHaveBeenCalledWith(
      "enqueue_job",
      expect.objectContaining({ request_id: "req-abcdef12" }),
    );
  });

  it("enqueues without a context rather than throwing", async () => {
    // Scripts and tests have no middleware. Losing correlation is a degraded
    // log line; throwing would be a failed enqueue.
    await expect(
      enqueueJob({ payload: {}, type: "diagnostics.echo" }),
    ).resolves.toBe("job-uuid-1");

    expect(rpc).toHaveBeenCalledWith(
      "enqueue_job",
      expect.objectContaining({ request_id: null }),
    );
  });

  it("returns the new job id", async () => {
    await expect(enqueueJob({ type: "diagnostics.echo" })).resolves.toBe("job-uuid-1");
  });

  it("defaults to the default lane and five attempts", async () => {
    await enqueueJob({ type: "diagnostics.echo" });

    expect(rpc).toHaveBeenCalledWith(
      "enqueue_job",
      expect.objectContaining({ attempts_allowed: 5, target_queue: "default" }),
    );
  });

  it("honours an explicit lane", async () => {
    await enqueueJob({ queue: "media", type: "diagnostics.echo" });

    expect(rpc).toHaveBeenCalledWith(
      "enqueue_job",
      expect.objectContaining({ target_queue: "media" }),
    );
  });

  it("surfaces an enqueue failure rather than swallowing it", async () => {
    // An enqueue that silently does nothing is the view-tracker failure again:
    // the caller believes deferred work was scheduled and nothing happens.
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });

    await expect(enqueueJob({ type: "diagnostics.echo" })).rejects.toBeDefined();
  });
});
