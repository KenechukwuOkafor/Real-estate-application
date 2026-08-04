import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { approveListingAsAdmin } from "@/server/services/admin-service";

type RouteContext = {
  params: Promise<{ listingId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { listingId } = await context.params;
    const listing = await approveListingAsAdmin(listingId);

    return NextResponse.json({
      data: { id: listing.id, status: listing.status },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
