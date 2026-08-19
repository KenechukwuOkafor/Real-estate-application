import { describe, expect, it } from "vitest";

import {
  currentContext,
  currentRequestId,
  runWithContext,
  setContextUser,
} from "@/lib/observability/context";

describe("the request context", () => {
  it("carries a request id through awaits", async () => {
    await runWithContext({ requestId: "req-1", service: "api" }, async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));

      expect(currentRequestId()).toBe("req-1");
    });
  });

  it("does not leak between sibling contexts", async () => {
    // The property that makes runWithContext correct for the job drain: two
    // jobs in one drain invocation must not inherit each other's ids.
    await Promise.all([
      runWithContext({ requestId: "req-a", service: "job:a" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(currentRequestId()).toBe("req-a");
      }),
      runWithContext({ requestId: "req-b", service: "job:b" }, async () => {
        expect(currentRequestId()).toBe("req-b");
      }),
    ]);
  });

  it("attaches a user once identity resolves", async () => {
    await runWithContext({ requestId: "req-1", service: "api" }, async () => {
      expect(currentContext()?.userId).toBeUndefined();

      setContextUser("user-123");

      expect(currentContext()?.userId).toBe("user-123");
    });
  });

  it("is a no-op outside a context, never a failure", () => {
    // A request has an id before it has a user, and scripts have neither.
    // Calling this must never be the thing that breaks a request.
    expect(() => setContextUser("user-123")).not.toThrow();
    expect(currentRequestId()).toBeUndefined();
  });

  it("carries a job id when one is present", async () => {
    await runWithContext(
      { jobId: "job-9", requestId: "req-1", service: "job:diagnostics.echo" },
      async () => {
        expect(currentContext()?.jobId).toBe("job-9");
      },
    );
  });
});
