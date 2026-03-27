import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { listAdminModerationQueue } from "@/server/services/admin-service";

export async function GET() {
  const requestId = await getRequestId();

  try {
    const listings = await listAdminModerationQueue();

    return NextResponse.json({
      data: listings,
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load moderation queue.";
    const status =
      message === "Unauthenticated request."
        ? 401
        : message === "Admin role is required."
          ? 403
          : 500;

    return NextResponse.json(
      {
        error: {
          code: status === 401 ? "UNAUTHENTICATED" : status === 403 ? "UNAUTHORIZED" : "INTERNAL_ERROR",
          details: null,
          message,
        },
        meta: createApiMeta(requestId),
      },
      { status },
    );
  }
}
