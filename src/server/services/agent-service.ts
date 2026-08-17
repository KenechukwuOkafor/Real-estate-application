import "server-only";

import type {
  AgentDraftListingInput,
  AgentListingImageInput,
  AgentListingImageUploadRequest,
  AgentProfileInput,
  AgentVerificationSubmissionInput,
} from "@/features/agents/types";
import {
  validateAgentProfileInput,
  validateAgentListingImagesInput,
  validateDraftListingInput,
  validateVerificationSubmissionInput,
} from "@/features/agents/validation";
import { AppError } from "@/lib/api/errors";
import { getSupabaseAdminClient } from "@/lib/db/supabase";
import { writeAuditLog } from "@/server/services/audit-service";
import {
  createListingImageUploadTargets,
  listUploadedListingImageObjects,
} from "@/server/services/listing-media-service";
import {
  createDraftListing,
  createVerificationSubmission,
  getAgentProfileByUserId,
  getAgentProfileWithSubscriptionsByUserId,
  getOwnedListing,
  listAgentListings,
  markAgentVerificationPending,
  registerListingImages,
  updateAgentFreeListingQuota,
  updateDraftListing,
  updateListingCoverImage,
  updateListingStatus,
  upsertAgentProfile,
} from "@/server/repositories/agents-repository";
import { getCurrentListingEntitlementSubscription } from "@/server/repositories/subscriptions-repository";
import { getCurrentAppUser } from "@/server/services/user-sync-service";
import type { Database } from "@/types/database";

function requireAgentRole(roles: string[]) {
  if (!roles.includes("agent")) {
    throw new Error("Agent role is required.");
  }
}

export async function getCurrentAgentContext() {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new Error("Unauthenticated request.");
  }

  requireAgentRole(appUser.roles);

  const adminClient = getSupabaseAdminClient();
  const agentProfile = await getAgentProfileByUserId(adminClient, appUser.user.id);

  return {
    agentProfile,
    roles: appUser.roles,
    user: appUser.user,
  };
}

/**
 * Authenticated context that does NOT require the `agent` role.
 *
 * Self-service signup grants `student` only, so a user becoming an agent has
 * no `agent` role yet. Agent-profile creation and verification submission must
 * therefore be reachable without it. Anything that produces marketplace
 * inventory continues to use getCurrentAgentContext.
 */
export async function getAgentOnboardingContext() {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new Error("Unauthenticated request.");
  }

  const adminClient = getSupabaseAdminClient();
  const agentProfile = await getAgentProfileByUserId(adminClient, appUser.user.id);

  return {
    agentProfile,
    roles: appUser.roles,
    user: appUser.user,
  };
}

export async function getCurrentAgentListingEntitlement() {
  const context = await getCurrentAgentContext();

  // canCreateDraft is unconditionally true: drafts are free and unlimited for
  // any agent, verified or not. It stays in the shape so callers keep reading
  // an explicit answer rather than inferring one.
  if (!context.agentProfile) {
    return {
      activeSubscription: null,
      canCreateDraft: true,
      canSubmitListing: false,
      freeListingQuota: 0,
      isVerified: false,
      source: "none" as const,
    };
  }

  const isVerified = context.agentProfile.verification_status === "verified";
  const adminClient = getSupabaseAdminClient();
  const activeSubscription = await getCurrentListingEntitlementSubscription(
    adminClient,
    context.agentProfile.id,
  );

  if (activeSubscription) {
    return {
      activeSubscription,
      canCreateDraft: true,
      canSubmitListing: isVerified,
      freeListingQuota: context.agentProfile.free_listing_quota,
      isVerified,
      source: "subscription" as const,
    };
  }

  const hasQuota = context.agentProfile.free_listing_quota > 0;

  return {
    activeSubscription: null,
    canCreateDraft: true,
    canSubmitListing: isVerified && hasQuota,
    freeListingQuota: context.agentProfile.free_listing_quota,
    isVerified,
    source: hasQuota ? ("quota" as const) : ("none" as const),
  };
}

async function requireListingEntitlement(options?: { consumeQuota?: boolean }) {
  const context = await getCurrentAgentContext();

  if (!context.agentProfile) {
    throw new Error("Create your agent profile before managing listings.");
  }

  const adminClient = getSupabaseAdminClient();
  const activeSubscription = await getCurrentListingEntitlementSubscription(
    adminClient,
    context.agentProfile.id,
  );

  if (activeSubscription) {
    return {
      activeSubscription,
      agentProfile: context.agentProfile,
      entitlementSource: "subscription" as const,
      user: context.user,
    };
  }

  if (context.agentProfile.free_listing_quota > 0) {
    const updatedAgentProfile = options?.consumeQuota
      ? await updateAgentFreeListingQuota(
          adminClient,
          context.agentProfile.id,
          context.agentProfile.free_listing_quota - 1,
          context.agentProfile.free_listing_quota,
        )
      : context.agentProfile;

    return {
      activeSubscription: null,
      agentProfile: updatedAgentProfile,
      entitlementSource: "quota" as const,
      user: context.user,
    };
  }

  throw new Error("LISTING_SUBSCRIPTION_REQUIRED");
}

export async function saveCurrentAgentProfile(input: AgentProfileInput) {
  validateAgentProfileInput(input);

  const context = await getAgentOnboardingContext();
  const adminClient = getSupabaseAdminClient();
  const agentProfile = await upsertAgentProfile(adminClient, context.user.id, input);

  await writeAuditLog({
    action: "agent_profile.upserted",
    actorUserId: context.user.id,
    afterData: {
      bio: agentProfile.bio,
      display_name: agentProfile.display_name,
      verification_status: agentProfile.verification_status,
    },
    entityId: agentProfile.id,
    entityType: "agent_profile",
  });

  return {
    agentProfile,
    user: context.user,
  };
}

type AgentVerificationStatus =
  Database["public"]["Enums"]["agent_verification_status"];

/**
 * States a verification submission may be made from.
 *
 * An allowlist, per REB-DOM-003's "the absence of a permission implies denial".
 * The path had no guard at all, so a verified agent could re-submit and be
 * written back to pending_review — which drops them out of the
 * public_can_read_verified_agent_profiles RLS policy and silently hides their
 * public profile. `pending_review` is excluded too: re-submitting mid-review
 * stacks a second row in the admin queue for the same agent. `suspended` is
 * excluded because an agent must not be able to self-clear a suspension.
 */
const RESUBMITTABLE_VERIFICATION_STATUSES: ReadonlySet<AgentVerificationStatus> =
  new Set<AgentVerificationStatus>(["not_submitted", "rejected"]);

function assertVerificationSubmittable(status: AgentVerificationStatus) {
  if (RESUBMITTABLE_VERIFICATION_STATUSES.has(status)) {
    return;
  }

  if (status === "verified") {
    throw new AppError(
      "AGENT_ALREADY_VERIFIED",
      "Your account is already verified. There is nothing to resubmit.",
      409,
    );
  }

  if (status === "pending_review") {
    throw new AppError(
      "VERIFICATION_REVIEW_IN_PROGRESS",
      "Your verification is already under review. You will hear back before you can resubmit.",
      409,
    );
  }

  throw new AppError(
    "VERIFICATION_NOT_SUBMITTABLE",
    `Verification cannot be submitted from status ${status}.`,
    409,
  );
}

export async function submitCurrentAgentVerification(
  input: AgentVerificationSubmissionInput,
) {
  validateVerificationSubmissionInput(input);

  const context = await getAgentOnboardingContext();

  if (!context.agentProfile) {
    throw new Error("Create your agent profile before submitting verification.");
  }

  assertVerificationSubmittable(context.agentProfile.verification_status);

  const adminClient = getSupabaseAdminClient();

  await createVerificationSubmission(adminClient, context.agentProfile.id, input);
  const updatedProfile = await markAgentVerificationPending(
    adminClient,
    context.agentProfile.id,
  );

  await writeAuditLog({
    action: "agent_verification.submitted",
    actorUserId: context.user.id,
    afterData: {
      verification_status: updatedProfile.verification_status,
    },
    entityId: updatedProfile.id,
    entityType: "agent_profile",
    metadata: {
      fullLegalName: input.fullLegalName,
    },
  });

  return {
    agentProfile: updatedProfile,
  };
}

export async function createCurrentAgentDraftListing(
  input: AgentDraftListingInput,
) {
  validateDraftListingInput(input);

  // Deliberately not entitlement-gated. REB-DOM-002 Verification: "Unverified
  // agents may: Create drafts" / "may not: Submit listings for public
  // approval". Drafts are private working state that produce no marketplace
  // inventory, so neither verification nor a paid slot is required to make
  // one. Both gates live on submit-for-review instead.
  const context = await getCurrentAgentContext();

  if (!context.agentProfile) {
    throw new Error("Create your agent profile before creating a draft listing.");
  }

  const adminClient = getSupabaseAdminClient();
  const listing = await createDraftListing(adminClient, context.agentProfile.id, input);

  await writeAuditLog({
    action: "listing.draft_created",
    actorUserId: context.user.id,
    afterData: {
      area: listing.area,
      price_naira: listing.price_naira,
      status: listing.status,
      title: listing.title,
    },
    entityId: listing.id,
    entityType: "listing",
  });

  return {
    listing,
  };
}

export async function updateCurrentAgentDraftListing(
  listingId: string,
  input: Partial<AgentDraftListingInput>,
) {
  const context = await getCurrentAgentContext();

  if (!context.agentProfile) {
    throw new Error("Create your agent profile before managing listings.");
  }

  const adminClient = getSupabaseAdminClient();
  const existing = await getOwnedListing(adminClient, context.agentProfile.id, listingId);

  if (!existing) {
    throw new Error("Listing not found.");
  }

  if (existing.status !== "draft" && existing.status !== "rejected") {
    throw new Error("LISTING_STATE_TRANSITION_INVALID");
  }

  const merged: AgentDraftListingInput = {
    amenities: input.amenities ?? (existing.amenities as string[]),
    area: input.area ?? existing.area,
    bathrooms: input.bathrooms ?? existing.bathrooms,
    bedrooms: input.bedrooms ?? existing.bedrooms,
    city: input.city ?? existing.city,
    description: input.description ?? existing.description,
    latitude: input.latitude !== undefined ? input.latitude : existing.latitude,
    longitude: input.longitude !== undefined ? input.longitude : existing.longitude,
    priceNaira: input.priceNaira ?? existing.price_naira,
    propertyType: input.propertyType ?? existing.property_type,
    state: input.state ?? existing.state,
    title: input.title ?? existing.title,
  };

  validateDraftListingInput(merged);

  const listing = await updateDraftListing(adminClient, context.agentProfile.id, listingId, input);

  await writeAuditLog({
    action: "listing.draft_updated",
    actorUserId: context.user.id,
    afterData: {
      area: listing.area,
      price_naira: listing.price_naira,
      status: listing.status,
      title: listing.title,
    },
    entityId: listing.id,
    entityType: "listing",
  });

  return { listing };
}

export async function listCurrentAgentListings() {
  const context = await getCurrentAgentContext();

  if (!context.agentProfile) {
    return [];
  }

  const adminClient = getSupabaseAdminClient();
  return listAgentListings(adminClient, context.agentProfile.id);
}

export async function getCurrentAgentListingsOverview() {
  const context = await getCurrentAgentContext();

  if (!context.agentProfile) {
    return {
      entitlement: {
        activeSubscription: null,
        canCreateDraft: true,
        canSubmitListing: false,
        freeListingQuota: 0,
        isVerified: false,
        source: "none" as const,
      },
      listings: [],
    };
  }

  const adminClient = getSupabaseAdminClient();
  const [agentProfile, listings] = await Promise.all([
    getAgentProfileWithSubscriptionsByUserId(adminClient, context.user.id),
    listAgentListings(adminClient, context.agentProfile.id),
  ]);

  const activeSubscription =
    agentProfile?.subscriptions?.find((subscription) => {
      const now = Date.now();
      return (
        (subscription.status === "active" ||
          subscription.status === "grace_period") &&
        new Date(subscription.starts_at).getTime() <= now &&
        new Date(subscription.expires_at).getTime() > now
      );
    }) ?? null;

  const freeListingQuota = agentProfile?.free_listing_quota ?? 0;
  const isVerified = agentProfile?.verification_status === "verified";

  return {
    entitlement: {
      activeSubscription,
      canCreateDraft: true,
      canSubmitListing:
        isVerified && (Boolean(activeSubscription) || freeListingQuota > 0),
      freeListingQuota,
      isVerified,
      source: activeSubscription
        ? ("subscription" as const)
        : freeListingQuota > 0
          ? ("quota" as const)
          : ("none" as const),
    },
    listings,
  };
}

export async function createCurrentAgentListingImageUploadTargets(
  input: AgentListingImageUploadRequest,
) {
  const context = await getCurrentAgentContext();

  if (!context.agentProfile) {
    throw new Error("Create your agent profile before managing listing images.");
  }

  const adminClient = getSupabaseAdminClient();
  const listing = await getOwnedListing(adminClient, context.agentProfile.id, input.listingId);

  if (!listing) {
    throw new Error("Listing not found.");
  }

  if (listing.status !== "draft" && listing.status !== "rejected") {
    // Was resolving to 500: the images route's old mapping matched
    // includes("cannot") and returned 422, and converting that route to the
    // shared resolver dropped the rule. This is a state-transition rejection.
    throw new AppError(
      "LISTING_STATE_TRANSITION_INVALID",
      "Images can only be added to draft or rejected listings.",
      422,
    );
  }

  const existingImages = (listing.listing_images ?? []).filter((image) => !image.deleted_at);

  if (existingImages.length + input.files.length > 10) {
    throw new Error("A listing cannot have more than 10 active images.");
  }

  return createListingImageUploadTargets({
    files: input.files,
    listingId: input.listingId,
  });
}

export async function registerCurrentAgentListingImages(
  input: AgentListingImageInput,
) {
  validateAgentListingImagesInput(input);

  const context = await getCurrentAgentContext();

  if (!context.agentProfile) {
    throw new Error("Create your agent profile before managing listing images.");
  }

  const adminClient = getSupabaseAdminClient();
  const listing = await getOwnedListing(adminClient, context.agentProfile.id, input.listingId);

  if (!listing) {
    throw new Error("Listing not found.");
  }

  if (listing.status !== "draft" && listing.status !== "rejected") {
    // Was resolving to 500: the images route's old mapping matched
    // includes("cannot") and returned 422, and converting that route to the
    // shared resolver dropped the rule. This is a state-transition rejection.
    throw new AppError(
      "LISTING_STATE_TRANSITION_INVALID",
      "Images can only be added to draft or rejected listings.",
      422,
    );
  }

  const existingImages = (listing.listing_images ?? []).filter((image) => !image.deleted_at);

  if (existingImages.length + input.images.length > 10) {
    throw new Error("A listing cannot have more than 10 active images.");
  }

  // Every path must name an object that actually exists under this listing's
  // media prefix. Uploading there requires a signed token only
  // createCurrentAgentListingImageUploadTargets issues, so presence in the
  // bucket is proof the path came from a target issued for this listing.
  // Without this a caller could register rows pointing anywhere, including at
  // another agent's media.
  const uploadedObjects = await listUploadedListingImageObjects(input.listingId);
  const resolvedImages = input.images.map((image) => {
    const uploaded = uploadedObjects.get(image.storagePath);

    if (!uploaded) {
      throw new AppError(
        "LISTING_IMAGE_NOT_UPLOADED",
        "That image was not uploaded for this listing. Upload it again and retry.",
        422,
      );
    }

    return {
      // Path, URL, content type and size all come from storage, never from the
      // request body.
      mimeType: uploaded.mimeType,
      position: image.position,
      publicUrl: uploaded.publicUrl,
      sizeBytes: uploaded.sizeBytes,
      storagePath: uploaded.storagePath,
    };
  });

  const createdImages = await registerListingImages(adminClient, {
    images: resolvedImages,
    listingId: input.listingId,
  });

  if (!listing.cover_image_id && createdImages[0]?.id) {
    await updateListingCoverImage(adminClient, listing.id, createdImages[0].id);
  }

  await writeAuditLog({
    action: "listing.images_registered",
    actorUserId: context.user.id,
    entityId: listing.id,
    entityType: "listing",
    metadata: {
      imageCount: createdImages.length,
    },
  });

  return {
    count: existingImages.length + createdImages.length,
  };
}

export async function submitCurrentAgentListingForReview(listingId: string) {
  const context = await getCurrentAgentContext();

  if (!context.agentProfile) {
    throw new Error("Create your agent profile before submitting listings.");
  }

  if (context.agentProfile.verification_status !== "verified") {
    throw new Error("AGENT_NOT_VERIFIED");
  }

  const adminClient = getSupabaseAdminClient();
  const listing = await getOwnedListing(adminClient, context.agentProfile.id, listingId);

  if (!listing) {
    throw new Error("Listing not found.");
  }

  if (listing.status !== "draft" && listing.status !== "rejected") {
    throw new Error("LISTING_STATE_TRANSITION_INVALID");
  }

  const activeImages = (listing.listing_images ?? []).filter((image) => !image.deleted_at);

  if (activeImages.length < 3) {
    throw new Error("LISTING_IMAGE_COUNT_INVALID");
  }

  // Check entitlement without spending anything yet, then let the guarded
  // status write be the serialisation point, then spend.
  //
  // Ordering matters because there are still no transactions here. Two
  // concurrent submits for the same listing both read status="draft" and both
  // pass this check, but only one can satisfy .eq("status", "draft") on the
  // update below — the loser throws LISTING_STATE_CONFLICT before reaching the
  // decrement, so a slot can never be spent twice for one submission. Spending
  // first would charge the loser for a submission that never happened.
  await requireListingEntitlement();

  const updated = await updateListingStatus(
    adminClient,
    listing.id,
    "pending_review",
    listing.status,
    {
      submitted_at: new Date().toISOString(),
    },
  );

  const entitlement = await requireListingEntitlement({ consumeQuota: true });

  await writeAuditLog({
    action: "listing.submitted_for_review",
    actorUserId: context.user.id,
    afterData: {
      status: updated.status,
      submitted_at: updated.submitted_at,
    },
    entityId: updated.id,
    entityType: "listing",
    metadata: {
      entitlementSource: entitlement.entitlementSource,
      subscriptionPlan: entitlement.activeSubscription?.plan ?? null,
    },
  });

  return { listing: updated };
}
