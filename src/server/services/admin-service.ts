import "server-only";

import { getSupabaseAdminClient } from "@/lib/db/supabase";
import {
  listModerationQueue,
  updateListingStatus,
} from "@/server/repositories/agents-repository";
import { getCurrentAppUser } from "@/server/services/user-sync-service";

function requireAdminRole(roles: string[]) {
  if (!roles.includes("admin")) {
    throw new Error("Admin role is required.");
  }
}

export async function listAdminModerationQueue() {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new Error("Unauthenticated request.");
  }

  requireAdminRole(appUser.roles);

  const adminClient = getSupabaseAdminClient();
  return listModerationQueue(adminClient, "pending_review");
}

export async function approveListingAsAdmin(listingId: string, adminUserId: string) {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new Error("Unauthenticated request.");
  }

  requireAdminRole(appUser.roles);

  const adminClient = getSupabaseAdminClient();

  return updateListingStatus(adminClient, listingId, "approved", {
    approved_at: new Date().toISOString(),
    approved_by: adminUserId,
    rejection_reason: null,
  });
}

export async function rejectListingAsAdmin(listingId: string, reason: string) {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new Error("Unauthenticated request.");
  }

  requireAdminRole(appUser.roles);

  const adminClient = getSupabaseAdminClient();

  return updateListingStatus(adminClient, listingId, "rejected", {
    rejection_reason: reason.trim() || "Rejected by admin review.",
  });
}
