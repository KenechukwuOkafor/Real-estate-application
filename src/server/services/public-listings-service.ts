import "server-only";

import { parseListingIdentifier } from "@/features/listings/parsers";
import type { ListingListFilters } from "@/features/listings/types";
import { createSupabaseServerClient } from "@/lib/db/supabase";
import {
  createListingView,
  getPublicListingByIdentifier,
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

export async function trackListingView(input: {
  ipHash?: string | null;
  listingId: string;
  referrer?: string | null;
  sessionId?: string | null;
  userAgent?: string | null;
  viewerUserId?: string | null;
}) {
  const client = await createSupabaseServerClient();

  return createListingView(client, input);
}
