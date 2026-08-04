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

export async function listPublicListings(filters: ListingListFilters) {
  const client = await createSupabaseServerClient();

  return getPublicListings(client, filters);
}

export async function getPublicListing(slugOrPublicId: string) {
  const client = await createSupabaseServerClient();
  const identifier = parseListingIdentifier(slugOrPublicId);

  return getPublicListingByIdentifier(
    client,
    identifier.publicId,
    identifier.slug,
  );
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
