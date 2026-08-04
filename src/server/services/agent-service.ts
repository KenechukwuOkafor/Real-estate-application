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
import { getSupabaseAdminClient } from "@/lib/db/supabase";
import { writeAuditLog } from "@/server/services/audit-service";
import { createListingImageUploadTargets } from "@/server/services/listing-media-service";
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

export async function getCurrentAgentListingEntitlement() {
  const context = await getCurrentAgentContext();

  if (!context.agentProfile) {
    return {
      activeSubscription: null,
      canCreateDraft: false,
      canSubmitListing: false,
      freeListingQuota: 0,
      source: "none" as const,
    };
  }

  const adminClient = getSupabaseAdminClient();
  const activeSubscription = await getCurrentListingEntitlementSubscription(
    adminClient,
    context.agentProfile.id,
  );

  if (activeSubscription) {
    return {
      activeSubscription,
      canCreateDraft: true,
      canSubmitListing: true,
      freeListingQuota: context.agentProfile.free_listing_quota,
      source: "subscription" as const,
    };
  }

  const hasQuota = context.agentProfile.free_listing_quota > 0;

  return {
    activeSubscription: null,
    canCreateDraft: hasQuota,
    canSubmitListing: hasQuota,
    freeListingQuota: context.agentProfile.free_listing_quota,
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

  const context = await getCurrentAgentContext();
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

export async function submitCurrentAgentVerification(
  input: AgentVerificationSubmissionInput,
) {
  validateVerificationSubmissionInput(input);

  const context = await getCurrentAgentContext();

  if (!context.agentProfile) {
    throw new Error("Create your agent profile before submitting verification.");
  }

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

  const context = await requireListingEntitlement();

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
        canCreateDraft: false,
        canSubmitListing: false,
        freeListingQuota: 0,
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

  return {
    entitlement: {
      activeSubscription,
      canCreateDraft: Boolean(activeSubscription) || freeListingQuota > 0,
      canSubmitListing: Boolean(activeSubscription) || freeListingQuota > 0,
      freeListingQuota,
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
    throw new Error("Images can only be added to draft or rejected listings.");
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
    throw new Error("Images can only be added to draft or rejected listings.");
  }

  const existingImages = (listing.listing_images ?? []).filter((image) => !image.deleted_at);

  if (existingImages.length + input.images.length > 10) {
    throw new Error("A listing cannot have more than 10 active images.");
  }

  const createdImages = await registerListingImages(adminClient, input);

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

  const entitlement = await requireListingEntitlement({ consumeQuota: true });

  const updated = await updateListingStatus(adminClient, listing.id, "pending_review", {
    submitted_at: new Date().toISOString(),
  });

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
