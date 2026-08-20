import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { requireUuid } from "@/lib/api/identifiers";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { archiveCurrentAgentListing } from "@/server/services/agent-service";

type RouteContext = {
  params: Promise<{ listingId: string }>;
};

/**
 * Take a live listing down.
 *
 * POST to a named sub-resource rather than PATCH on the listing, because this
 * is not an edit of a field an agent may write — `status` is deliberately
 * ungranted. It is a request for the system to perform a transition on their
 * behalf, and naming it that way keeps it from being mistaken for one more
 * editable attribute.
 *
 * Irreversible. `archived` is terminal at the database, not merely absent from
 * the interface — see migration 0022.
 */
export async function POST(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { listingId } = await context.params;
    requireUuid(listingId, "Listing");

    const result = await archiveCurrentAgentListing(listingId);

    return NextResponse.json({
      data: {
        archivedAt: result.archivedAt,
        listingId: result.listingId,
      },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
