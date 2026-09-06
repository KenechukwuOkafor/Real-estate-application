import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { requireUuid } from "@/lib/api/identifiers";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { markCurrentAgentListingAvailable } from "@/server/services/agent-service";

type RouteContext = {
  params: Promise<{ listingId: string }>;
};

/**
 * Put a listing that was taken back on the market.
 *
 * No re-review, and that is safe for one reason only: nothing can have changed
 * while it was off. A rented listing is absent from the
 * agents_update_own_listings policy and from EDITABLE_LISTING_STATUSES, so its
 * content is as uneditable as an approved listing's, and the only way to
 * change it is the revision path that a moderator sees.
 *
 * Read migration 0036 before widening either of those lists. The probe in
 * listing-rented-integration.test.ts is what enforces it.
 */
export async function POST(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { listingId } = await context.params;
    requireUuid(listingId, "Listing");

    const result = await markCurrentAgentListingAvailable(listingId);

    return NextResponse.json({
      data: {
        approvedAt: result.approvedAt,
        listingId: result.listingId,
      },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
