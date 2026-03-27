import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { getPublicListing } from "@/server/services/public-listings-service";

type RouteContext = {
  params: Promise<{
    slugOrPublicId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { slugOrPublicId } = await context.params;
    const listing = await getPublicListing(slugOrPublicId);

    if (!listing) {
      return NextResponse.json(
        {
          error: {
            code: "LISTING_NOT_FOUND",
            details: null,
            message: "Listing not found.",
          },
          meta: createApiMeta(requestId),
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: listing,
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          details: null,
          message:
            error instanceof Error ? error.message : "Unable to load listing.",
        },
        meta: createApiMeta(requestId),
      },
      { status: 500 },
    );
  }
}
