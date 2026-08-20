import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { requireUuid } from "@/lib/api/identifiers";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { submitCurrentAgentListingRevision } from "@/server/services/agent-service";

type RouteContext = {
  params: Promise<{ listingId: string }>;
};

/**
 * Propose a change to a live listing.
 *
 * POST to a sub-collection rather than PATCH on the listing, because it does
 * not change the listing. It creates a proposal, and the difference matters: a
 * PATCH that returned 200 while nothing a seeker sees had moved would be the
 * most misleading response this API could give.
 */
export async function POST(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { listingId } = await context.params;
    requireUuid(listingId, "Listing");

    const body = ((await request.json().catch(() => null)) ?? {}) as {
      amenities?: string[];
      description?: string;
      priceNaira?: number;
      rentalDuration?: "yearly" | "monthly" | "sublet";
      subletMonths?: number | null;
      title?: string;
    };

    const result = await submitCurrentAgentListingRevision(listingId, {
      amenities: body.amenities ?? [],
      description: body.description ?? "",
      priceNaira: body.priceNaira ?? 0,
      // Not defaulted, for the same reason the draft path does not default it:
      // a `?? "yearly"` would silently change the terms of a live listing.
      rentalDuration: body.rentalDuration as "yearly" | "monthly" | "sublet",
      subletMonths: body.subletMonths ?? null,
      title: body.title ?? "",
    });

    return NextResponse.json(
      {
        data: { revisionId: result.revisionId, submittedAt: result.submittedAt },
        meta: createApiMeta(requestId),
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
