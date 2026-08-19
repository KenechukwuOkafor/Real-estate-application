import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { trackListingView } from "@/server/services/public-listings-service";
import { getCurrentAppUser } from "@/server/services/user-sync-service";

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
    const appUser = await getCurrentAppUser().catch(() => null);
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
      viewerUserId: appUser?.user.id ?? null,
    });

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
    console.error("Failed to track listing view", { error, requestId });

    return NextResponse.json(
      {
        data: { tracked: false },
        meta: createApiMeta(requestId),
      },
      { status: 200 },
    );
  }
}
