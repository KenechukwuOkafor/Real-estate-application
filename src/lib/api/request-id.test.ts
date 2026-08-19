import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { headerStore } = vi.hoisted(() => ({ headerStore: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => headerStore.get(key) ?? null,
  })),
}));

import { getRequestId } from "@/lib/api/request-id";
import { runWithContext } from "@/lib/observability/context";

beforeEach(() => {
  headerStore.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("getRequestId", () => {
  it("returns the id middleware put on the request", async () => {
    headerStore.set("x-request-id", "req-from-middleware");

    await runWithContext({ requestId: "", service: "test" }, async () => {
      // Fresh context with no id, so the header is what answers.
    });

    await expect(getRequestId()).resolves.toBe("req-from-middleware");
  });

  it("returns the SAME id when called twice in one request", async () => {
    // The defect this closes: the previous implementation called
    // crypto.randomUUID() on every invocation, so two calls in one request
    // produced two different "request" ids and correlation was impossible by
    // construction.
    headerStore.set("x-request-id", "req-from-middleware");

    const first = await getRequestId();
    const second = await getRequestId();

    expect(second).toBe(first);
  });

  it("mints one rather than throwing when the header is absent", async () => {
    // Middleware does not run in tests or scripts. Losing an id is a degraded
    // log line; throwing would be a failed request.
    //
    // Asserted as a UUID rather than as any string. `expect.any(String)` would
    // also be satisfied by an id leaking out of an earlier test through
    // enterWith, which would make this pass without exercising the mint path
    // at all.
    await expect(getRequestId()).resolves.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("prefers an id already in the context over the header", async () => {
    headerStore.set("x-request-id", "req-from-header");

    await runWithContext(
      { requestId: "req-from-context", service: "job:x" },
      async () => {
        await expect(getRequestId()).resolves.toBe("req-from-context");
      },
    );
  });
});
