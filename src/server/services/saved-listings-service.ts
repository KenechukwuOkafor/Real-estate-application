import "server-only";

import { AppError } from "@/lib/api/errors";
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
    throw new AppError("UNAUTHENTICATED", "Unauthenticated request.");
  }

  const client = await createSupabaseAuthenticatedClient();
  const listing = await getPublicListingIdByUuid(client, listingPublicId);

  if (!listing) {
    throw new AppError("NOT_FOUND", "Listing not found.");
  }

  await saveListing(client, appUser.user.id, listing.id);

  return { saved: true };
}

export async function unsaveListingForCurrentUser(listingPublicId: string) {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new AppError("UNAUTHENTICATED", "Unauthenticated request.");
  }

  const client = await createSupabaseAuthenticatedClient();
  const listing = await getPublicListingIdByUuid(client, listingPublicId);

  if (!listing) {
    throw new AppError("NOT_FOUND", "Listing not found.");
  }

  await unsaveListing(client, appUser.user.id, listing.id);

  return { saved: false };
}
