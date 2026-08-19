import "server-only";

import { createSupabaseAuthenticatedClient } from "@/lib/db/supabase";
import {
  getPublicListingIdByUuid,
  saveListing,
  unsaveListing,
} from "@/server/repositories/listings-repository";
import { getCurrentAppUser } from "@/server/services/user-sync-service";

export async function saveListingForCurrentUser(listingPublicId: string) {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new Error("Unauthenticated request.");
  }

  const client = await createSupabaseAuthenticatedClient();
  const listing = await getPublicListingIdByUuid(client, listingPublicId);

  if (!listing) {
    throw new Error("Listing not found.");
  }

  await saveListing(client, appUser.user.id, listing.id);

  return { saved: true };
}

export async function unsaveListingForCurrentUser(listingPublicId: string) {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new Error("Unauthenticated request.");
  }

  const client = await createSupabaseAuthenticatedClient();
  const listing = await getPublicListingIdByUuid(client, listingPublicId);

  if (!listing) {
    throw new Error("Listing not found.");
  }

  await unsaveListing(client, appUser.user.id, listing.id);

  return { saved: false };
}
