import { beforeEach, describe, expect, it, vi } from "vitest";

const { captureMessage, trackListingView, getCurrentAppUser } = vi.hoisted(() => ({
  captureMessage: vi.fn<(message: string, context?: unknown) => boolean>(() => true),
  trackListingView: vi.fn<(input: unknown) => Promise<unknown>>(),
  getCurrentAppUser: vi.fn<() => Promise<unknown>>(async () => null),
}));

vi.mock("@/lib/observability/sentry", () => ({
  captureMessage,
  captureUnconditionally: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("@/server/services/public-listings-service", () => ({ trackListingView }));
vi.mock("@/server/services/user-sync-service", () => ({ getCurrentAppUser }));
vi.mock("@/lib/api/request-id", () => ({
  getRequestId: vi.fn(async () => "req-abcdef12"),
}));

import { POST } from "@/app/api/listings/[slugOrPublicId]/views/route";

const PUBLIC_UUID = "3c71e0a2-0000-4000-8000-000000000000";

function context() {
  return { params: Promise.resolve({ slugOrPublicId: PUBLIC_UUID }) };
}

function request() {
  return new Request("https://ruvo.example/api/listings/x/views", {
    body: JSON.stringify({}),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  captureMessage.mockReturnValue(true);
  getCurrentAppUser.mockResolvedValue(null);
});

describe("listing view tracking observability", () => {
  it("reports a view that resolved to no listing", async () => {
    // The original bug: a well-formed identifier that matched nothing, while
    // the endpoint answered 200. It ran undetected for months.
    trackListingView.mockResolvedValue({ reason: "unresolved", tracked: false });

    await POST(request(), context());

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("no listing"),
      expect.objectContaining({
        // The tag the runbook's Sentry alert rule matches on. Without it the
        // event lands in Sentry and no rule fires.
        alertKind: "view-unresolved",
        extra: expect.objectContaining({ requestId: "req-abcdef12" }),
      }),
    );
  });

  it("still returns 200 with tracked:false — BR-ANA-003 is not negotiable", async () => {
    trackListingView.mockResolvedValue({ reason: "unresolved", tracked: false });

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ tracked: false });
  });

  it("reports nothing when the view is recorded", async () => {
    trackListingView.mockResolvedValue({ tracked: true });

    const response = await POST(request(), context());

    expect(captureMessage).not.toHaveBeenCalled();
    expect(response.status).toBe(201);
  });

  it("reports nothing for a malformed identifier", async () => {
    // Crawlers generate these constantly. Reporting them drowns the signal,
    // which is how the real one gets ignored again.
    trackListingView.mockResolvedValue({ reason: "malformed", tracked: false });

    await POST(request(), context());

    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("never blocks the caller when Sentry throws", async () => {
    trackListingView.mockResolvedValue({ reason: "unresolved", tracked: false });
    captureMessage.mockImplementationOnce(() => {
      throw new Error("Sentry exploded");
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ tracked: false });
  });

  it("returns 200 when tracking throws outright", async () => {
    // BR-ANA-003: analytics collection must never block a user action. A
    // fire-and-forget beacon reports untracked rather than 5xx.
    trackListingView.mockRejectedValue(new Error("database is on fire"));

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ tracked: false });
  });

  it("does not report the identifier as a secret-shaped value", async () => {
    trackListingView.mockResolvedValue({ reason: "unresolved", tracked: false });

    await POST(request(), context());

    const passed = captureMessage.mock.calls[0]?.[1] as {
      extra?: Record<string, unknown>;
    };

    // The identifier is the whole diagnostic value of this report: it is what
    // tells an engineer which column the caller sent.
    expect(passed?.extra?.slugOrPublicId).toBe(PUBLIC_UUID);
  });
});
