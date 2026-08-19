import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { unsaveListingForCurrentUser } from "@/server/services/saved-listings-service";

type RouteContext = {
  params: Promise<{ listingId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { listingId } = await context.params;
    const result = await unsaveListingForCurrentUser(listingId);

    return NextResponse.json({ data: result, meta: createApiMeta(requestId) });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
