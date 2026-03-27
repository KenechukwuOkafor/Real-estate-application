import "server-only";

import type {
  AgentDraftListingInput,
  AgentListingImageInput,
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
import {
  createDraftListing,
  createVerificationSubmission,
  getAgentProfileByUserId,
  getOwnedListing,
  listAgentListings,
  markAgentVerificationPending,
  registerListingImages,
  updateListingCoverImage,
  updateListingStatus,
  upsertAgentProfile,
} from "@/server/repositories/agents-repository";
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

export async function saveCurrentAgentProfile(input: AgentProfileInput) {
  validateAgentProfileInput(input);

  const context = await getCurrentAgentContext();
  const adminClient = getSupabaseAdminClient();
  const agentProfile = await upsertAgentProfile(adminClient, context.user.id, input);

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

  return {
    agentProfile: updatedProfile,
  };
}

export async function createCurrentAgentDraftListing(
  input: AgentDraftListingInput,
) {
  validateDraftListingInput(input);

  const context = await getCurrentAgentContext();

  if (!context.agentProfile) {
    throw new Error("Create your agent profile before creating a draft listing.");
  }

  const adminClient = getSupabaseAdminClient();
  const listing = await createDraftListing(adminClient, context.agentProfile.id, input);

  return {
    listing,
  };
}

export async function listCurrentAgentListings() {
  const context = await getCurrentAgentContext();

  if (!context.agentProfile) {
    return [];
  }

  const adminClient = getSupabaseAdminClient();
  return listAgentListings(adminClient, context.agentProfile.id);
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

  const updated = await updateListingStatus(adminClient, listing.id, "pending_review", {
    submitted_at: new Date().toISOString(),
  });

  return { listing: updated };
}
