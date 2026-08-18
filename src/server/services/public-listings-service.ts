import "server-only";

import { parseListingIdentifier } from "@/features/listings/parsers";
import type { ListingListFilters } from "@/features/listings/types";
import { createSupabaseServerClient } from "@/lib/db/supabase";
import {
  createListingView,
  getPublicListingByIdentifier,
  getPublicListingIdByUuid,
  getPublicListings,
} from "@/server/repositories/listings-repository";
import { signListingImagePaths } from "@/server/services/listing-media-service";
import type { ListingDetail, ListingListItem } from "@/features/listings/types";

/**
 * Resolve storage paths into short-lived signed URLs.
 *
 * This is the awkward seam created by making the bucket private: a public
 * listing page has to serve images to visitors who have no session at all.
 * It works because the storage policy in migration 0016 grants anon SELECT on
 * objects whose listing is approved, so the anon client can sign its own URLs
 * and a draft or rejected listing yields nothing.
 *
 * The signing is done here rather than in the repository because the
 * repository must not mint URLs — it returns paths, and whoever renders
 * decides what the caller is allowed to see.
 */
async function withSignedCovers<T extends ListingListItem>(
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  items: T[],
): Promise<T[]> {
  const paths = items
    .map((item) => item.coverImageStoragePath)
    .filter((path): path is string => Boolean(path));

  const signed = await signListingImagePaths(client, paths);

  return items.map((item) => ({
    ...item,
    coverImageUrl: item.coverImageStoragePath
      ? (signed.get(item.coverImageStoragePath) ?? null)
      : null,
  }));
}

export async function listPublicListings(filters: ListingListFilters) {
  const client = await createSupabaseServerClient();
  const result = await getPublicListings(client, filters);

  return {
    ...result,
    items: await withSignedCovers(client, result.items),
  };
}

export async function getPublicListing(slugOrPublicId: string) {
  const client = await createSupabaseServerClient();
  const identifier = parseListingIdentifier(slugOrPublicId);

  const listing = await getPublicListingByIdentifier(
    client,
    identifier.publicId,
    identifier.slug,
  );

  if (!listing) {
    return listing;
  }

  const [withCover] = await withSignedCovers(client, [listing as ListingDetail]);
  const signed = await signListingImagePaths(
    client,
    withCover.images.map((image) => image.storagePath),
  );

  return {
    ...withCover,
    images: withCover.images
      .map((image) => ({
        ...image,
        url: signed.get(image.storagePath) ?? null,
      }))
      // An image the caller may not read has no URL and is simply not shown,
      // rather than rendering a broken <img>.
      .filter((image) => image.url !== null),
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function trackListingView(input: {
  ipHash?: string | null;
  referrer?: string | null;
  sessionId?: string | null;
  slugOrPublicId: string;
  userAgent?: string | null;
  viewerUserId?: string | null;
}): Promise<{ tracked: boolean }> {
  const { publicId } = parseListingIdentifier(input.slugOrPublicId);

  // parseListingIdentifier never fails: given input with no "--" it returns the
  // input verbatim as publicId. Querying with that produces a Postgres 22P02
  // invalid-uuid error, so every crawler hitting this endpoint would cost a
  // round-trip and an exception. Reject the shape before touching the database.
  if (!UUID_PATTERN.test(publicId)) {
    return { tracked: false };
  }

  const client = await createSupabaseServerClient();
  const listing = await getPublicListingIdByUuid(client, publicId);

  if (!listing) {
    return { tracked: false };
  }

  await createListingView(client, {
    ipHash: input.ipHash ?? null,
    listingId: listing.id,
    referrer: input.referrer ?? null,
    sessionId: input.sessionId ?? null,
    userAgent: input.userAgent ?? null,
    viewerUserId: input.viewerUserId ?? null,
  });

  return { tracked: true };
}
