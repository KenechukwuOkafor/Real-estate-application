import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { getAuthContext } from "@/lib/auth/clerk";
import { trackListingView } from "@/server/services/public-listings-service";

type RouteContext = {
  params: Promise<{
    listingId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { listingId } = await context.params;
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      referrer?: string | null;
      sessionId?: string | null;
    };
    const authContext = await getAuthContext();
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip");

    await trackListingView({
      ipHash: ipAddress
        ? crypto.createHash("sha256").update(ipAddress).digest("hex")
        : null,
      listingId,
      referrer: body.referrer ?? null,
      sessionId: body.sessionId ?? null,
      userAgent: request.headers.get("user-agent"),
      viewerUserId: authContext.userId,
    });

    return NextResponse.json(
      {
        data: {
          tracked: true,
        },
        meta: createApiMeta(requestId),
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          details: null,
          message:
            error instanceof Error ? error.message : "Unable to track listing view.",
        },
        meta: createApiMeta(requestId),
      },
      { status: 500 },
    );
  }
}
