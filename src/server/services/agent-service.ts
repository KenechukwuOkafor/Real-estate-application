import "server-only";

import type {
  AgentDraftListingInput,
  AgentListingImageInput,
  AgentListingImageUploadRequest,
  AgentProfileInput,
  AgentVerificationSubmissionInput,
  VerificationDocumentUploadRequest,
} from "@/features/agents/types";
import {
  validateAgentProfileInput,
  validateAgentListingImagesInput,
  validateDraftListingInput,
  validateVerificationSubmissionInput,
} from "@/features/agents/validation";
import { isListingEditable } from "@/features/listings/editability";
import { stateTransitionDetails } from "@/lib/api/error-details";
import { AppError } from "@/lib/api/errors";
import {
  createSupabaseAuthenticatedClient,
  getSupabaseAdminClient,
} from "@/lib/db/supabase";
import { writeAuditLog } from "@/server/services/audit-service";
import {
  createListingImageUploadTargets,
  createVerificationDocumentUploadTargets,
  listUploadedListingImageObjects,
  listUploadedVerificationDocuments,
} from "@/server/services/listing-media-service";
import {
  createDraftListing,
  createVerificationSubmission,
  insertVerificationDocuments,
  getAgentProfileByUserId,
  getAgentProfileWithSubscriptionsByUserId,
  getOwnedListing,
  listAgentListings,
  markAgentVerificationPending,
  registerListingImages,
  archiveOwnListing,
  removeListingImage,
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
    throw new AppError("UNAUTHORIZED", "Agent role is required.");
  }
}

export async function getCurrentAgentContext() {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new AppError("UNAUTHENTICATED", "Unauthenticated request.");
  }

  requireAgentRole(appUser.roles);

  const client = await createSupabaseAuthenticatedClient();
  const agentProfile = await getAgentProfileByUserId(client, appUser.user.id);

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
    throw new AppError("UNAUTHENTICATED", "Unauthenticated request.");
  }

  const client = await createSupabaseAuthenticatedClient();
  const agentProfile = await getAgentProfileByUserId(client, appUser.user.id);

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
  const client = await createSupabaseAuthenticatedClient();
  const activeSubscription = await getCurrentListingEntitlementSubscription(
    client,
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
    throw new AppError(
      "AGENT_PROFILE_REQUIRED",
      "Create your agent profile before managing listings.",
    );
  }

  const client = await createSupabaseAuthenticatedClient();
  const activeSubscription = await getCurrentListingEntitlementSubscription(
    client,
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
    // SERVICE ROLE for the spend. free_listing_quota is not grantable to an
    // agent — the privilege to decrement it is the privilege to raise it, and
    // an agent who can set their own quota can mint unlimited submissions.
    const adminClient = getSupabaseAdminClient();
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

  throw new AppError(
    "SUBSCRIPTION_REQUIRED",
    // Was the string "LISTING_SUBSCRIPTION_REQUIRED": a second, code-shaped
    // message that existed only so the client could match on it. The client
    // reads the code now, so this can say something to whoever reads a log.
    "Agent has neither an active subscription nor remaining free listing quota.",
  );
}

export async function saveCurrentAgentProfile(input: AgentProfileInput) {
  validateAgentProfileInput(input);

  const context = await getAgentOnboardingContext();
  const client = await createSupabaseAuthenticatedClient();
  const agentProfile = await upsertAgentProfile(client, context.user.id, input);

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
    throw new AppError(
      "AGENT_PROFILE_REQUIRED",
      "Create your agent profile before submitting verification.",
    );
  }

  assertVerificationSubmittable(context.agentProfile.verification_status);

  // The submission itself is written with the agent's own credentials, so the
  // insert policy re-checks that agent_profile_id is theirs.
  // Every submitted path must name an object that actually exists under this
  // agent's own verification prefix. Uploading there requires a signed token
  // only createVerificationDocumentUploadTargets issues, so presence is proof
  // of provenance — an agent cannot attach another agent's document, and the
  // recorded MIME type and size come from the stored object rather than the
  // request body.
  const documentClient = await createSupabaseAuthenticatedClient();
  const uploaded = await listUploadedVerificationDocuments(
    documentClient,
    context.agentProfile.id,
  );
  const resolvedDocuments = input.documents.map((document) => {
    const object = uploaded.get(document.storagePath);

    if (!object) {
      throw new AppError(
        "VERIFICATION_DOCUMENT_NOT_UPLOADED",
        "That document was not uploaded for this account. Upload it again and retry.",
        422,
      );
    }

    return { document, object };
  });

  const authenticatedClient = documentClient;
  const submission = await createVerificationSubmission(
    authenticatedClient,
    context.agentProfile.id,
    input,
  );

  await insertVerificationDocuments(
    authenticatedClient,
    resolvedDocuments.map(({ document, object }) => ({
      agent_profile_id: context.agentProfile!.id,
      agent_verification_submission_id: submission.id,
      document_type: document.documentType,
      mime_type: object.mimeType,
      // Metadata only — BR-MEDIA-004 keeps it out of the storage path.
      original_filename: document.originalFilename ?? null,
      size_bytes: object.sizeBytes,
      storage_path: object.storagePath,
    })),
  );

  // SERVICE ROLE, deliberately. This moves the agent's own
  // verification_status to 'pending_review', and an agent must never hold
  // UPDATE on that column: the same grant that let them set 'pending_review'
  // would let them set 'verified' and self-approve. The transition is the
  // system acting on their behalf after assertVerificationSubmittable has
  // passed, not the agent acting directly, so it stays an escalation.
  const adminClient = getSupabaseAdminClient();
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
    throw new AppError(
      "AGENT_PROFILE_REQUIRED",
      "Create your agent profile before creating a draft listing.",
    );
  }

  const client = await createSupabaseAuthenticatedClient();
  const listing = await createDraftListing(client, context.agentProfile.id, input);

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

/**
 * One listing the caller owns, for the edit surface.
 *
 * Ownership is enforced by the query, not by a check after the fact:
 * getOwnedListing filters on agent_profile_id, so another agent's listing
 * simply is not found. That keeps "not yours" and "does not exist"
 * indistinguishable to the caller, which is the same answer the RLS policies
 * give and the reason the id of a listing you do not own tells you nothing.
 *
 * Editability is NOT decided here. This returns the row whatever its status,
 * and the page decides what to offer — the write path already refuses anything
 * that is not a draft or a rejection, and duplicating that rule in a third
 * place is how the three come to disagree.
 */
export async function getCurrentAgentListingForEdit(listingId: string) {
  const context = await getCurrentAgentContext();

  if (!context.agentProfile) {
    throw new AppError(
      "AGENT_PROFILE_REQUIRED",
      "Create your agent profile before managing listings.",
    );
  }

  const client = await createSupabaseAuthenticatedClient();
  const listing = await getOwnedListing(client, context.agentProfile.id, listingId);

  if (!listing) {
    throw new AppError("NOT_FOUND", "Listing not found.");
  }

  return listing;
}

export async function updateCurrentAgentDraftListing(
  listingId: string,
  input: Partial<AgentDraftListingInput>,
) {
  const context = await getCurrentAgentContext();

  if (!context.agentProfile) {
    throw new AppError(
      "AGENT_PROFILE_REQUIRED",
      "Create your agent profile before managing listings.",
    );
  }

  const client = await createSupabaseAuthenticatedClient();
  const existing = await getOwnedListing(client, context.agentProfile.id, listingId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "Listing not found.");
  }

  // Same predicate the edit page and the edit link read, so a surface cannot
  // offer an edit this will refuse.
  if (!isListingEditable(existing.status)) {
    throw new AppError(
      "LISTING_STATE_TRANSITION_INVALID",
      `A listing cannot be edited from status ${existing.status}.`,
      undefined,
      stateTransitionDetails("edit", existing.status),
    );
  }

  const rentalDuration = input.rentalDuration ?? existing.rental_duration;

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
    rentalDuration,
    state: input.state ?? existing.state,
    /**
     * Carried forward only when it still applies, and never invented.
     *
     * On a sublet, an absent month count means "leave it as it was" — an agent
     * fixing a title must not have to resend the length. Off a sublet, an
     * absent one means null, because keeping the old value would fail the CHECK
     * on a change the agent made correctly.
     *
     * A month count the caller ACTUALLY SENT survives either way, so the
     * validator below sees it and refuses it. Nulling it here instead would
     * hide a caller's mistake from validation and then hand the raw value to
     * the repository anyway — which is exactly the defect this shape fixes.
     */
    subletMonths:
      rentalDuration === "sublet"
        ? (input.subletMonths ?? existing.sublet_months)
        : (input.subletMonths ?? null),
    title: input.title ?? existing.title,
  };

  validateDraftListingInput(merged);

  /**
   * The validated pair, not the raw partial.
   *
   * Everything else stays partial so an edit touches only what it named, but
   * rental_duration and sublet_months go together or the CHECK rejects the
   * statement. Passing `input` here meant the repository could receive a month
   * count the validator never inspected, because the validator ran against
   * `merged`. Validation and the write now agree by construction rather than by
   * both happening to be right.
   */
  const listing = await updateDraftListing(client, context.agentProfile.id, listingId, {
    ...input,
    rentalDuration: merged.rentalDuration,
    subletMonths: merged.subletMonths,
  });

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

  const client = await createSupabaseAuthenticatedClient();
  return listAgentListings(client, context.agentProfile.id);
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
        verificationStatus: "not_submitted" as const,
      },
      listings: [],
    };
  }

  const client = await createSupabaseAuthenticatedClient();
  const [agentProfile, listings] = await Promise.all([
    getAgentProfileWithSubscriptionsByUserId(client, context.user.id),
    listAgentListings(client, context.agentProfile.id),
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
      // The raw status as well as the boolean. "Not verified" is one state to
      // the entitlement check and three quite different sentences to an agent:
      // never started, waiting on us, or rejected. Collapsing them to a boolean
      // is what made the copy say the same unhelpful thing to all three.
      verificationStatus: agentProfile?.verification_status ?? "not_submitted",
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
    throw new AppError(
      "AGENT_PROFILE_REQUIRED",
      "Create your agent profile before managing listing images.",
    );
  }

  const client = await createSupabaseAuthenticatedClient();
  const listing = await getOwnedListing(client, context.agentProfile.id, input.listingId);

  if (!listing) {
    throw new AppError("NOT_FOUND", "Listing not found.");
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
    throw new AppError(
      "LISTING_IMAGE_COUNT_INVALID",
      "A listing cannot have more than 10 active images.",
    );
  }

  return createListingImageUploadTargets(client, {
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
    throw new AppError(
      "AGENT_PROFILE_REQUIRED",
      "Create your agent profile before managing listing images.",
    );
  }

  const client = await createSupabaseAuthenticatedClient();
  const listing = await getOwnedListing(client, context.agentProfile.id, input.listingId);

  if (!listing) {
    throw new AppError("NOT_FOUND", "Listing not found.");
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
    throw new AppError(
      "LISTING_IMAGE_COUNT_INVALID",
      "A listing cannot have more than 10 active images.",
    );
  }

  // Every path must name an object that actually exists under this listing's
  // media prefix. Uploading there requires a signed token only
  // createCurrentAgentListingImageUploadTargets issues, so presence in the
  // bucket is proof the path came from a target issued for this listing.
  // Without this a caller could register rows pointing anywhere, including at
  // another agent's media.
  const uploadedObjects = await listUploadedListingImageObjects(
    client,
    input.listingId,
  );
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
      sizeBytes: uploaded.sizeBytes,
      storagePath: uploaded.storagePath,
    };
  });

  const createdImages = await registerListingImages(client, {
    images: resolvedImages,
    listingId: input.listingId,
  });

  if (!listing.cover_image_id && createdImages[0]?.id) {
    await updateListingCoverImage(client, listing.id, createdImages[0].id);
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

/**
 * Remove one image from a listing the caller owns.
 *
 * Pre-validated here and re-validated in the database, following the shape of
 * the inspection RPC in 0015. The checks in TypeScript exist so an agent gets a
 * 404 or a 409 that names what happened; the checks inside
 * public.remove_listing_image are the authority, because they hold for any
 * caller including PostgREST directly.
 */
export async function removeCurrentAgentListingImage(
  listingId: string,
  imageId: string,
) {
  const context = await getCurrentAgentContext();

  if (!context.agentProfile) {
    throw new AppError(
      "AGENT_PROFILE_REQUIRED",
      "Create your agent profile before managing listings.",
    );
  }

  const client = await createSupabaseAuthenticatedClient();
  const listing = await getOwnedListing(client, context.agentProfile.id, listingId);

  if (!listing) {
    throw new AppError("NOT_FOUND", "Listing not found.");
  }

  // Same predicate as every other edit. An approved listing losing a photo
  // without re-review is what the moderation queue exists to prevent, and a
  // flagged one losing a photo is evidence disappearing.
  if (!isListingEditable(listing.status)) {
    throw new AppError(
      "LISTING_STATE_TRANSITION_INVALID",
      `A photo cannot be removed from a listing with status ${listing.status}.`,
      undefined,
      stateTransitionDetails("remove_image", listing.status),
    );
  }

  const image = (listing.listing_images ?? []).find(
    (candidate) => candidate.id === imageId && !candidate.deleted_at,
  );

  // Checked against the images of THIS listing, so an image id belonging to
  // another listing cannot be removed by pairing it with a listing the caller
  // does own.
  if (!image) {
    throw new AppError("NOT_FOUND", "Image not found on this listing.");
  }

  const result = await removeListingImage(client, imageId);

  await writeAuditLog({
    action: "listing.image_removed",
    actorUserId: context.user.id,
    afterData: {
      listing_id: listingId,
      new_cover_image_id: result.new_cover_image_id,
      removed_image_id: result.removed_image_id,
      // Recorded because the storage object is deliberately left behind and
      // nothing currently reclaims it. When a cleanup job finally drains the
      // media lane, this is the trail that says which objects it may remove.
      storage_path: image.storage_path,
    },
    entityId: listingId,
    entityType: "listing",
  });

  return {
    newCoverImageId: result.new_cover_image_id,
    removedImageId: result.removed_image_id,
  };
}

/**
 * Withdraw a live listing.
 *
 * The answer to an agent holding an approved listing they can no longer edit.
 * Pre-validated here so the agent gets a 404 or a 409 that names what happened;
 * re-validated inside the function, which is the authority because it holds for
 * any caller.
 *
 * NO QUOTA REFUND. The slot was spent at submission and bought moderator
 * attention that has already been given. Relisting is a new listing and a
 * second piece of real review work. See migration 0022.
 */
export async function archiveCurrentAgentListing(listingId: string) {
  const context = await getCurrentAgentContext();

  if (!context.agentProfile) {
    throw new AppError(
      "AGENT_PROFILE_REQUIRED",
      "Create your agent profile before managing listings.",
    );
  }

  const client = await createSupabaseAuthenticatedClient();
  const listing = await getOwnedListing(client, context.agentProfile.id, listingId);

  if (!listing) {
    throw new AppError("NOT_FOUND", "Listing not found.");
  }

  if (listing.status !== "approved") {
    throw new AppError(
      "LISTING_STATE_TRANSITION_INVALID",
      `A listing cannot be taken down from status ${listing.status}.`,
      undefined,
      stateTransitionDetails("archive", listing.status),
    );
  }

  const result = await archiveOwnListing(client, listingId);

  await writeAuditLog({
    action: "listing.archived_by_agent",
    actorUserId: context.user.id,
    afterData: {
      archived_at: result.archived_at,
      // Recorded because this is irreversible and the slot is not returned:
      // if the decision is ever revisited, this is the evidence of what the
      // agent gave up and when.
      previous_status: listing.status,
      status: "archived",
    },
    entityId: listingId,
    entityType: "listing",
  });

  return { archivedAt: result.archived_at, listingId: result.listing_id };
}

export async function submitCurrentAgentListingForReview(listingId: string) {
  const context = await getCurrentAgentContext();

  if (!context.agentProfile) {
    throw new AppError(
      "AGENT_PROFILE_REQUIRED",
      "Create your agent profile before submitting listings.",
    );
  }

  if (context.agentProfile.verification_status !== "verified") {
    throw new AppError(
      "AGENT_NOT_VERIFIED",
      "Agent verification is not approved, so a listing cannot be submitted.",
    );
  }

  const client = await createSupabaseAuthenticatedClient();
  const listing = await getOwnedListing(client, context.agentProfile.id, listingId);

  if (!listing) {
    throw new AppError("NOT_FOUND", "Listing not found.");
  }

  if (listing.status !== "draft" && listing.status !== "rejected") {
    throw new AppError(
      "LISTING_STATE_TRANSITION_INVALID",
      `A listing cannot be submitted from status ${listing.status}.`,
      undefined,
      stateTransitionDetails("submit", listing.status),
    );
  }

  const activeImages = (listing.listing_images ?? []).filter((image) => !image.deleted_at);

  if (activeImages.length < 3) {
    throw new AppError("LISTING_IMAGE_COUNT_INVALID", "LISTING_IMAGE_COUNT_INVALID");
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

  // SERVICE ROLE, deliberately. listings.status is not grantable to an agent:
  // the same UPDATE privilege that permits 'pending_review' would permit
  // 'approved', letting an agent publish without moderation. The transition is
  // the system acting after the verification, image-count and entitlement
  // checks have passed, so it stays an escalation. Same shape as
  // markAgentVerificationPending.
  const adminClient = getSupabaseAdminClient();
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

/**
 * Signed upload targets for verification documents.
 *
 * Mirrors the listing-image flow. Reachable without the agent role, like the
 * rest of verification onboarding, because self-service signup grants student
 * only — see getAgentOnboardingContext.
 */
export async function createCurrentAgentVerificationUploadTargets(
  input: VerificationDocumentUploadRequest,
) {
  const context = await getAgentOnboardingContext();

  if (!context.agentProfile) {
    throw new AppError(
      "AGENT_PROFILE_REQUIRED",
      "Create your agent profile before uploading documents.",
    );
  }

  assertVerificationSubmittable(context.agentProfile.verification_status);

  if (input.files.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Select at least one document to upload.",
      422,
    );
  }

  const client = await createSupabaseAuthenticatedClient();

  return createVerificationDocumentUploadTargets(client, {
    agentProfileId: context.agentProfile.id,
    files: input.files,
  });
}
