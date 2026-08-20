import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { requireUuid } from "@/lib/api/identifiers";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { removeCurrentAgentListingImage } from "@/server/services/agent-service";

type RouteContext = {
  params: Promise<{ imageId: string; listingId: string }>;
};

/**
 * Remove one image from a listing.
 *
 * DELETE on the image's own path rather than a mutation on the collection,
 * because the thing being removed has an id and removing it twice must be
 * indistinguishable from removing it once.
 *
 * The removal is a soft delete and the storage object is deliberately left in
 * the bucket — see migration 0020, including the note that nothing currently
 * reclaims those objects.
 */
export async function DELETE(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { imageId, listingId } = await context.params;

    // Both checked before anything touches the database. A non-UUID would
    // otherwise reach Postgres and return a 500 for what is plainly a bad URL.
    requireUuid(listingId, "Listing");
    requireUuid(imageId, "Image");

    const result = await removeCurrentAgentListingImage(listingId, imageId);

    return NextResponse.json({
      data: {
        // Returned so the caller can reflect a promotion it did not ask for:
        // removing the cover silently changes which image represents the
        // listing, and a UI that did not know would show the old one.
        newCoverImageId: result.newCoverImageId,
        removedImageId: result.removedImageId,
      },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
