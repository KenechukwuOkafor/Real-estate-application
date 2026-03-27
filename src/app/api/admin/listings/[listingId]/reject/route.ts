import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { rejectListingAsAdmin } from "@/server/services/admin-service";

type RouteContext = {
  params: Promise<{ listingId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as { reason?: string };
    const { listingId } = await context.params;
    const listing = await rejectListingAsAdmin(
      listingId,
      body.reason ?? "Rejected by admin review.",
    );

    return NextResponse.json({
      data: {
        id: listing.id,
        status: listing.status,
      },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reject listing.";
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
