import "server-only";

import { getSupabaseAdminClient } from "@/lib/db/supabase";
import {
  getVerificationSubmissionById,
  getListingById,
  listModerationQueue,
  listVerificationQueue,
  markVerificationSubmissionReviewed,
  updateAgentVerificationStatus,
  updateListingStatus,
} from "@/server/repositories/agents-repository";
import { ensureUserRoles } from "@/server/repositories/users-repository";
import { writeAuditLog } from "@/server/services/audit-service";
import { getCurrentAppUser } from "@/server/services/user-sync-service";

function requireAdminRole(roles: string[]) {
  if (!roles.includes("admin")) {
    throw new Error("Admin role is required.");
  }
}

async function requireAdminContext() {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new Error("Unauthenticated request.");
  }

  requireAdminRole(appUser.roles);

  return appUser;
}

function requireListingState(
  currentStatus: string,
  allowedStatuses: string[],
  action: string,
) {
  if (!allowedStatuses.includes(currentStatus)) {
    throw new Error(`Listing cannot be ${action} from status ${currentStatus}.`);
  }
}

export async function listAdminModerationQueue() {
  await requireAdminContext();

  const adminClient = getSupabaseAdminClient();
  return listModerationQueue(adminClient, [
    "pending_review",
    "flagged",
    "under_dispute",
  ]);
}

export async function listAdminVerificationQueue() {
  await requireAdminContext();

  const adminClient = getSupabaseAdminClient();
  return listVerificationQueue(adminClient);
}

function requirePendingVerificationState(
  currentStatus: string,
  reviewedAt: string | null,
) {
  if (reviewedAt) {
    throw new Error("Verification submission has already been reviewed.");
  }

  if (currentStatus !== "pending_review") {
    throw new Error(
      `Verification cannot be reviewed from status ${currentStatus}.`,
    );
  }
}

export async function approveAgentVerificationAsAdmin(submissionId: string) {
  const appUser = await requireAdminContext();
  const adminClient = getSupabaseAdminClient();
  const submission = await getVerificationSubmissionById(adminClient, submissionId);

  if (!submission || !submission.agent_profiles) {
    throw new Error("Verification submission not found.");
  }

  requirePendingVerificationState(
    submission.agent_profiles.verification_status,
    submission.reviewed_at,
  );

  const reviewedAt = new Date().toISOString();
  const agentProfile = await updateAgentVerificationStatus(
    adminClient,
    submission.agent_profile_id,
    "verified",
    {
      rejection_reason: null,
      verified_at: reviewedAt,
      verified_by: appUser.user.id,
    },
  );

  await markVerificationSubmissionReviewed(adminClient, submission.id, reviewedAt);

  // Granted last, deliberately. These are three unbatched writes with no
  // transaction (Phase 1 adds transactions). Ordering the grant last means a
  // failure here leaves the user verified but not yet an agent — never an
  // agent without an approved verification. Note that re-running the approval
  // will NOT repair it: requirePendingVerificationState rejects any submission
  // whose status has already moved off pending_review, and the status write
  // above has already done so. Recovery is an out-of-band grant of the agent
  // role for that user. Phase 1's transaction work removes this window.
  await ensureUserRoles(adminClient, submission.agent_profiles.user_id, [
    "agent",
  ]);

  await writeAuditLog({
    action: "agent_verification.approved",
    actorUserId: appUser.user.id,
    afterData: {
      verification_status: agentProfile.verification_status,
      verified_at: agentProfile.verified_at,
      verified_by: agentProfile.verified_by,
    },
    entityId: submission.agent_profile_id,
    entityType: "agent_profile",
    metadata: {
      roleGranted: "agent",
      submissionId: submission.id,
    },
  });

  return agentProfile;
}

export async function rejectAgentVerificationAsAdmin(
  submissionId: string,
  reason: string,
) {
  const appUser = await requireAdminContext();
  const adminClient = getSupabaseAdminClient();
  const submission = await getVerificationSubmissionById(adminClient, submissionId);

  if (!submission || !submission.agent_profiles) {
    throw new Error("Verification submission not found.");
  }

  requirePendingVerificationState(
    submission.agent_profiles.verification_status,
    submission.reviewed_at,
  );

  const reviewedAt = new Date().toISOString();
  const agentProfile = await updateAgentVerificationStatus(
    adminClient,
    submission.agent_profile_id,
    "rejected",
    {
      rejection_reason: reason.trim() || "Verification evidence was insufficient.",
      verified_at: null,
      verified_by: null,
    },
  );

  await markVerificationSubmissionReviewed(adminClient, submission.id, reviewedAt);

  await writeAuditLog({
    action: "agent_verification.rejected",
    actorUserId: appUser.user.id,
    afterData: {
      rejection_reason: agentProfile.rejection_reason,
      verification_status: agentProfile.verification_status,
    },
    entityId: submission.agent_profile_id,
    entityType: "agent_profile",
    metadata: {
      submissionId: submission.id,
    },
  });

  return agentProfile;
}

export async function approveListingAsAdmin(listingId: string) {
  const appUser = await requireAdminContext();

  const adminClient = getSupabaseAdminClient();
  const currentListing = await getListingById(adminClient, listingId);

  if (!currentListing) {
    throw new Error("Listing not found.");
  }

  requireListingState(
    currentListing.status,
    ["pending_review", "flagged", "under_dispute"],
    "approved",
  );

  const listing = await updateListingStatus(adminClient, listingId, "approved", currentListing.status, {
    approved_at: new Date().toISOString(),
    approved_by: appUser.user.id,
    dispute_reason: null,
    flag_reason: null,
    rejection_reason: null,
  });

  await writeAuditLog({
    action: "listing.approved",
    actorUserId: appUser.user.id,
    afterData: {
      approved_at: listing.approved_at,
      status: listing.status,
    },
    entityId: listing.id,
    entityType: "listing",
  });

  return listing;
}

export async function rejectListingAsAdmin(listingId: string, reason: string) {
  const appUser = await requireAdminContext();

  const adminClient = getSupabaseAdminClient();
  const currentListing = await getListingById(adminClient, listingId);

  if (!currentListing) {
    throw new Error("Listing not found.");
  }

  requireListingState(
    currentListing.status,
    ["pending_review", "flagged", "under_dispute"],
    "rejected",
  );

  const listing = await updateListingStatus(adminClient, listingId, "rejected", currentListing.status, {
    dispute_reason: null,
    flag_reason: null,
    rejection_reason: reason.trim() || "Rejected by admin review.",
  });

  await writeAuditLog({
    action: "listing.rejected",
    actorUserId: appUser.user.id,
    afterData: {
      rejection_reason: listing.rejection_reason,
      status: listing.status,
    },
    entityId: listing.id,
    entityType: "listing",
  });

  return listing;
}

export async function flagListingAsAdmin(listingId: string, reason: string) {
  const appUser = await requireAdminContext();

  const adminClient = getSupabaseAdminClient();
  const currentListing = await getListingById(adminClient, listingId);

  if (!currentListing) {
    throw new Error("Listing not found.");
  }

  requireListingState(
    currentListing.status,
    ["pending_review", "approved"],
    "flagged",
  );

  const listing = await updateListingStatus(adminClient, listingId, "flagged", currentListing.status, {
    dispute_reason: null,
    flag_reason: reason.trim() || "Listing flagged for manual review.",
  });

  await writeAuditLog({
    action: "listing.flagged",
    actorUserId: appUser.user.id,
    afterData: {
      flag_reason: listing.flag_reason,
      status: listing.status,
    },
    entityId: listing.id,
    entityType: "listing",
  });

  return listing;
}

export async function disputeListingAsAdmin(listingId: string, reason: string) {
  const appUser = await requireAdminContext();

  const adminClient = getSupabaseAdminClient();
  const currentListing = await getListingById(adminClient, listingId);

  if (!currentListing) {
    throw new Error("Listing not found.");
  }

  requireListingState(
    currentListing.status,
    ["approved", "flagged"],
    "moved under dispute",
  );

  const listing = await updateListingStatus(adminClient, listingId, "under_dispute", currentListing.status, {
    dispute_reason: reason.trim() || "Ownership dispute requires manual resolution.",
  });

  await writeAuditLog({
    action: "listing.under_dispute",
    actorUserId: appUser.user.id,
    afterData: {
      dispute_reason: listing.dispute_reason,
      status: listing.status,
    },
    entityId: listing.id,
    entityType: "listing",
  });

  return listing;
}
