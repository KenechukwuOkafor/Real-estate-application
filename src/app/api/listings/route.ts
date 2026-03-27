import { NextResponse } from "next/server";

import { parseListingListFilters } from "@/features/listings/parsers";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { listPublicListings } from "@/server/services/public-listings-service";

export async function GET(request: Request) {
  const requestId = await getRequestId();

  try {
    const filters = parseListingListFilters(new URL(request.url).searchParams);
    const result = await listPublicListings(filters);

    return NextResponse.json({
      data: result.items,
      meta: createApiMeta(requestId),
      pagination: {
        hasMore: result.hasMore,
        limit: result.limit,
        nextCursor: result.nextCursor,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          details: null,
          message:
            error instanceof Error ? error.message : "Unable to load listings.",
        },
        meta: createApiMeta(requestId),
      },
      { status: 500 },
    );
  }
}
