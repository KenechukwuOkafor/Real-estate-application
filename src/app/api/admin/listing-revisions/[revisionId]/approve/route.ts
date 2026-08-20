import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { requireUuid } from "@/lib/api/identifiers";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { approveListingRevisionAsAdmin } from "@/server/services/admin-service";

type RouteContext = {
  params: Promise<{ revisionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { revisionId } = await context.params;
    requireUuid(revisionId, "Revision");

    const result = await approveListingRevisionAsAdmin(revisionId);

    return NextResponse.json({
      data: { listingId: result.listing_id, revisionId: result.revision_id },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
