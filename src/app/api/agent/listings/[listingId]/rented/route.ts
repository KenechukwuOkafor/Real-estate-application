import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { requireUuid } from "@/lib/api/identifiers";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { markCurrentAgentListingRented } from "@/server/services/agent-service";

type RouteContext = {
  params: Promise<{ listingId: string }>;
};

/**
 * Take a live listing off the market.
 *
 * POST to a named sub-resource rather than PATCH on the listing, for the
 * reason /archive is: `status` is deliberately ungranted, so this is a request
 * for the system to perform a transition rather than one more editable field.
 *
 * Reversible, unlike /archive — see ./available — and it consumes no
 * submission slot in either direction.
 */
export async function POST(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { listingId } = await context.params;
    requireUuid(listingId, "Listing");

    const result = await markCurrentAgentListingRented(listingId);

    return NextResponse.json({
      data: {
        listingId: result.listingId,
        rentedAt: result.rentedAt,
      },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
