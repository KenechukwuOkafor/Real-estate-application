import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { isWellFormedHandle } from "@/features/agents/handle";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { log } from "@/lib/observability/logger";
import { captureMessage } from "@/lib/observability/sentry";
import { trackAgentProfileView } from "@/server/services/public-agent-profile-service";

type RouteContext = {
  params: Promise<{ handle: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { handle } = await context.params;
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      referrer?: string | null;
      sessionId?: string | null;
    };

    if (!isWellFormedHandle(handle)) {
      // Crawlers generate these constantly. Rejected before a query, and
      // deliberately not reported — drowning the real signal below is exactly
      // how the listing tracker's silence went unnoticed for months.
      return NextResponse.json(
        { data: { tracked: false }, meta: createApiMeta(requestId) },
        { status: 200 },
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip");

    // No viewer lookup here. Attribution is decided by which client the
    // service opens, because a viewer_user_id resolved in a route is still a
    // value the database would be accepting on trust. See 0028.
    const result = await trackAgentProfileView({
      handle,
      ipHash: ipAddress
        ? crypto.createHash("sha256").update(ipAddress).digest("hex")
        : null,
      referrer: body.referrer ?? null,
      sessionId: body.sessionId ?? null,
      userAgent: request.headers.get("user-agent"),
    });

    /**
     * A well-formed handle that resolved to nothing.
     *
     * Measured as attempted-versus-recorded, not as silence. The obvious alert
     * is "no profile views have arrived recently", which on a product with no
     * users measures the absence of users rather than the absence of the
     * system working — so it fires continuously, gets muted, and the real
     * defect hides behind it. That is precisely how listing views came to
     * record nothing for months while answering 200.
     */
    if (!result.tracked && result.reason === "unresolved") {
      log.warn({
        event: "AgentProfileViewUnresolved",
        handle,
        hint: "A well-formed handle matched no readable profile.",
      });

      try {
        captureMessage("Agent profile view recorded against no profile", {
          alertKind: "view-unresolved",
          category: "unexpected",
          extra: { handle, requestId },
          level: "warning",
          requestId,
        });
      } catch {
        // Reporting is fire-and-forget and must never be why a beacon fails.
      }
    }

    return NextResponse.json(
      { data: { tracked: result.tracked }, meta: createApiMeta(requestId) },
      { status: result.tracked ? 201 : 200 },
    );
  } catch (error) {
    // BR-ANA-003: analytics collection must not block user actions. A beacon
    // reports untracked rather than surfacing a 5xx.
    log.error({ error, event: "AgentProfileViewTrackingFailed" });

    return NextResponse.json(
      { data: { tracked: false }, meta: createApiMeta(requestId) },
      { status: 200 },
    );
  }
}
