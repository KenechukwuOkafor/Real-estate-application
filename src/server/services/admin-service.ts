import "server-only";

/**
 * SERVICE ROLE throughout, deliberately.
 *
 * Every exported function here calls requireAdminContext first, which resolves
 * the caller from Postgres and rejects anyone without the admin role in
 * public.user_roles (ADR-003 — never from a JWT claim). Moderation and
 * verification review legitimately read and write rows belonging to other
 * users, which is precisely what RLS is written to prevent, so these paths are
 * the escalation rather than a gap in it.
 *
 * The database still constrains what an escalation can reach: audit_logs
 * remain append-only, and admin policies exist on the tables an admin may read
 * so that migrating any of these call sites later cannot silently widen
 * access.
 *
 * Note that chats and messages deliberately have no admin policy at all.
 * REB-ARCH-004 grants admins "Reported Only" there — moderation scoped to an
 * investigation, not blanket read — and nothing in this file touches them.
 */

import { AppError } from "@/lib/api/errors";
import {
  applyListingRevision,
  listPendingListingRevisions,
  rejectListingRevision,
} from "@/server/repositories/agents-repository";
import { getSupabaseAdminClient } from "@/lib/db/supabase";
import { VERIFIED_AGENT_LISTING_QUOTA } from "@/server/policies/listing-entitlement";
import {
  getVerificationSubmissionById,
  getListingById,
  grantFreeListingQuotaIfUnset,
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
    throw new AppError("UNAUTHORIZED", "Admin role is required.");
  }
}

async function requireAdminContext() {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new AppError("UNAUTHENTICATED", "Unauthenticated request.");
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
    throw new AppError(
      "LISTING_STATE_TRANSITION_INVALID",
      `Listing cannot be ${action} from status ${currentStatus}.`,
    );
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

/**
 * Changes waiting on a moderator, with the values they would replace.
 *
 * A separate queue from the listing queue, because reviewing a change is a
 * different task from reviewing a listing: the question is "is this edit
 * acceptable", not "is this listing acceptable", and the answer lives in the
 * difference rather than in the whole.
 */
export async function listAdminListingRevisionQueue() {
  await requireAdminContext();

  return listPendingListingRevisions(getSupabaseAdminClient());
}

export async function approveListingRevisionAsAdmin(revisionId: string) {
  const context = await requireAdminContext();
  const adminClient = getSupabaseAdminClient();

  const result = await applyListingRevision(adminClient, revisionId, context.user.id);

  await writeAuditLog({
    action: "listing.revision_approved",
    actorUserId: context.user.id,
    afterData: { listing_id: result.listing_id, revision_id: result.revision_id },
    entityId: result.listing_id,
    entityType: "listing",
  });

  return result;
}

export async function rejectListingRevisionAsAdmin(
  revisionId: string,
  reason: string,
) {
  const context = await requireAdminContext();

  if (!reason.trim()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "A rejection reason is required so the agent knows what to change.",
      422,
    );
  }

  const adminClient = getSupabaseAdminClient();
  const result = await rejectListingRevision(
    adminClient,
    revisionId,
    context.user.id,
    reason.trim(),
  );

  await writeAuditLog({
    action: "listing.revision_rejected",
    actorUserId: context.user.id,
    afterData: {
      listing_id: result.listing_id,
      rejection_reason: reason.trim(),
      revision_id: result.revision_id,
    },
    entityId: result.listing_id,
    entityType: "listing",
  });

  return result;
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
  // AppError rather than bare messages. The shared resolver classifies by
  // string matching, and "Verification cannot be reviewed from status X"
  // matches its `includes("cannot be")` branch — which would label a
  // verification failure with the listing code LISTING_STATE_TRANSITION_INVALID.
  // Naming the code here keeps the domain correct.
  if (reviewedAt) {
    throw new AppError(
      "VERIFICATION_ALREADY_REVIEWED",
      "Verification submission has already been reviewed.",
      409,
    );
  }

  if (currentStatus !== "pending_review") {
    throw new AppError(
      "VERIFICATION_STATE_TRANSITION_INVALID",
      `Verification cannot be reviewed from status ${currentStatus}.`,
      422,
    );
  }
}

export async function approveAgentVerificationAsAdmin(submissionId: string) {
  const appUser = await requireAdminContext();
  const adminClient = getSupabaseAdminClient();
  const submission = await getVerificationSubmissionById(adminClient, submissionId);

  if (!submission || !submission.agent_profiles) {
    throw new AppError(
      "VERIFICATION_SUBMISSION_NOT_FOUND",
      "Verification submission not found.",
    );
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

  // Approval is what makes an agent able to publish: it is the only thing in
  // the codebase that puts a non-zero free_listing_quota on a profile. Guarded
  // on quota = 0 so an out-of-band top-up is never clobbered; a null return
  // means they already had a balance, which is reported, not an error.
  const quotaGrantedProfile = await grantFreeListingQuotaIfUnset(
    adminClient,
    submission.agent_profile_id,
    VERIFIED_AGENT_LISTING_QUOTA,
  );

  if (quotaGrantedProfile) {
    await writeAuditLog({
      action: "agent_profile.listing_quota_granted",
      actorUserId: appUser.user.id,
      afterData: {
        free_listing_quota: quotaGrantedProfile.free_listing_quota,
      },
      beforeData: {
        free_listing_quota: 0,
      },
      entityId: submission.agent_profile_id,
      entityType: "agent_profile",
      metadata: {
        reason: "verification_approved",
        submissionId: submission.id,
      },
    });
  }

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
    throw new AppError(
      "VERIFICATION_SUBMISSION_NOT_FOUND",
      "Verification submission not found.",
    );
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
    throw new AppError("NOT_FOUND", "Listing not found.");
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
    throw new AppError("NOT_FOUND", "Listing not found.");
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
    throw new AppError("NOT_FOUND", "Listing not found.");
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
    throw new AppError("NOT_FOUND", "Listing not found.");
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
