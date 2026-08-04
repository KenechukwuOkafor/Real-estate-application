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

    await trackListingView({
      ipHash: ipAddress
        ? crypto.createHash("sha256").update(ipAddress).digest("hex")
        : null,
      listingId: slugOrPublicId,
      referrer: body.referrer ?? null,
      sessionId: body.sessionId ?? null,
      userAgent: request.headers.get("user-agent"),
      viewerUserId: appUser?.user.id ?? null,
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
