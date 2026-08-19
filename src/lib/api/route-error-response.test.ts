import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above const declarations, so the spy has to be
// created inside vi.hoisted or the factory closes over a temporal-dead-zone
// binding and the module fails to mock at all.
const { reportError } = vi.hoisted(() => ({ reportError: vi.fn(() => true) }));

vi.mock("@/lib/observability/sentry", () => ({
  reportError,
  captureMessage: vi.fn(),
  captureUnconditionally: vi.fn(),
}));

import { AppError, routeErrorResponse } from "@/lib/api/errors";

beforeEach(() => {
  vi.clearAllMocks();
  reportError.mockReturnValue(true);
});

describe("routeErrorResponse", () => {
  it("reports an unexpected error to Sentry with full context", () => {
    const cause = new Error("connect ECONNREFUSED 10.0.0.5:5432");

    const response = routeErrorResponse(cause, "req-abc12345");

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(
      cause,
      expect.objectContaining({
        category: "unexpected",
        errorCode: "INTERNAL_ERROR",
        requestId: "req-abc12345",
      }),
    );
    expect(response.status).toBe(500);
  });

  it("hands Sentry the original error, not the resolved summary", () => {
    // The stack trace is the thing that makes a report worth having. Passing a
    // reconstructed error would report the line that handled the failure
    // rather than the line that caused it.
    const cause = new Error("original failure");

    routeErrorResponse(cause, "req-abc12345");

    expect(reportError.mock.calls[0]?.[0]).toBe(cause);
  });

  it("still returns the sanitized response the client already expects", async () => {
    const response = routeErrorResponse(
      new Error("connect ECONNREFUSED 10.0.0.5:5432"),
      "req-abc12345",
    );
    const body = await response.json();

    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.details).toBeNull();
    expect(body.error.message).not.toContain("10.0.0.5");
    expect(body.error.message).not.toContain("ECONNREFUSED");
    expect(body.meta.requestId).toBe("req-abc12345");
  });

  it("passes an expected denial to the gate, which declines to report it", () => {
    // A 403 is the boundary working. Paging on it trains people to ignore the
    // pager, which is how the genuinely broken thing gets missed. The decision
    // lives in reportError's category gate, so the call still happens here.
    const response = routeErrorResponse(
      new AppError("UNAUTHORIZED", "Admin role is required."),
      "req-abc12345",
    );

    expect(response.status).toBe(403);
    expect(reportError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ category: "authorization" }),
    );
  });

  it("preserves an expected error's own message for the client", async () => {
    const response = routeErrorResponse(
      new AppError("NOT_FOUND", "Listing not found."),
      "req-1",
    );

    expect((await response.json()).error.message).toBe("Listing not found.");
  });

  it("does not fail the request when Sentry throws", () => {
    // The guarantee: an observability tool that can take the application down
    // is worse than no observability tool.
    reportError.mockImplementationOnce(() => {
      throw new Error("Sentry transport exploded");
    });

    expect(() =>
      routeErrorResponse(new Error("original failure"), "req-abc12345"),
    ).not.toThrow();
  });

  it("returns the same response when Sentry throws as when it does not", async () => {
    reportError.mockImplementationOnce(() => {
      throw new Error("Sentry transport exploded");
    });

    const response = routeErrorResponse(new AppError("NOT_FOUND", "Gone."), "req-1");
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Gone.");
  });

  it("does not fail the request when the logger throws", async () => {
    // Same guarantee, other half. A logger that throws mid-request would turn
    // a handled 404 into an unhandled 500.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {
        throw new Error("stdout is gone");
      });
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {
      throw new Error("stdout is gone");
    });

    try {
      const response = routeErrorResponse(new AppError("NOT_FOUND", "Gone."), "req-1");

      expect(response.status).toBe(404);
    } finally {
      consoleError.mockRestore();
      consoleWarn.mockRestore();
    }
  });
});
