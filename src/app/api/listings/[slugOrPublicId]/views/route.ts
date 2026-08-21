import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { log } from "@/lib/observability/logger";
import { captureMessage } from "@/lib/observability/sentry";
import { trackListingView } from "@/server/services/public-listings-service";

type RouteContext = {
  params: Promise<{
    slugOrPublicId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { slugOrPublicId } = await context.params;
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      referrer?: string | null;
      sessionId?: string | null;
    };
    // No viewer lookup here any more. Attribution is decided by which client
    // the service opens — the caller's Clerk token, or none — because a
    // viewer_user_id resolved in the route was still a value the database
    // accepted on trust. See 0028.
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip");

    const result = await trackListingView({
      ipHash: ipAddress
        ? crypto.createHash("sha256").update(ipAddress).digest("hex")
        : null,
      referrer: body.referrer ?? null,
      sessionId: body.sessionId ?? null,
      slugOrPublicId,
      userAgent: request.headers.get("user-agent"),
    });

    /**
     * A well-formed identifier that resolved to nothing.
     *
     * This is the shape of a caller passing the wrong column, and it is how
     * this endpoint recorded nothing for months while answering 200. It stays
     * a 200 — BR-ANA-003 is not negotiable and the client must not care — but
     * it stops being silent.
     *
     * MEASURED AS ATTEMPTED-VERSUS-RECORDED, NOT AS SILENCE. ADR-032's
     * argument about queue depth applies here in a stronger form. The obvious
     * alert is "no views have arrived recently", but on a product with no
     * users yet that measures the absence of users rather than the absence of
     * the system working, so it would fire continuously and be muted — which
     * is precisely how the tracker came to be ignored the first time.
     *
     * The bug was never "no views arriving". It was views arriving and not
     * being recorded. That is a finding at any traffic level, including on a
     * single request, and it needs no baseline.
     *
     * Reported per event, with no threshold in this code. The rate lives in
     * the Sentry alert rule, so tuning it is a UI change rather than a deploy,
     * and one unresolved view on a dead-quiet day still creates the issue.
     *
     * Malformed input is deliberately NOT reported: crawlers generate it
     * constantly and drowning the real signal is how it gets ignored again.
     */
    if (!result.tracked && result.reason === "unresolved") {
      log.warn({
        event: "ListingViewUnresolved",
        hint:
          "Callers must send the listing's public_uuid, not its primary key. " +
          "Both are UUIDs, so a wrong column resolves to nothing rather than erroring.",
        slugOrPublicId,
      });

      try {
        captureMessage("Listing view recorded against no listing", {
          alertKind: "view-unresolved",
          category: "unexpected",
          extra: {
            hint: "Caller likely sent listings.id rather than listings.public_uuid.",
            requestId,
            slugOrPublicId,
          },
          level: "warning",
          requestId,
        });
      } catch {
        // BR-ANA-003. Reporting is fire-and-forget and must never be the
        // reason a beacon fails.
      }
    }

    return NextResponse.json(
      {
        data: { tracked: result.tracked },
        meta: createApiMeta(requestId),
      },
      { status: result.tracked ? 201 : 200 },
    );
  } catch (error) {
    // BR-ANA-003 (Critical): analytics collection must not block user actions.
    // This endpoint is a fire-and-forget beacon, so infrastructure failures are
    // logged and reported as untracked rather than surfaced as a 5xx.
    log.error({ error, event: "ListingViewTrackingFailed" });

    return NextResponse.json(
      {
        data: { tracked: false },
        meta: createApiMeta(requestId),
      },
      { status: 200 },
    );
  }
}
