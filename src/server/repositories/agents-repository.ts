import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AgentDraftListingInput,
  AgentProfileInput,
  AgentVerificationSubmissionInput,
} from "@/features/agents/types";
import type { Database } from "@/types/database";

type DbClient = SupabaseClient<Database>;

type ListingImageRow = Database["public"]["Tables"]["listing_images"]["Row"];
type AgentProfileRow = Database["public"]["Tables"]["agent_profiles"]["Row"];
type ListingRow = Database["public"]["Tables"]["listings"]["Row"];
type AgentVerificationSubmissionRow =
  Database["public"]["Tables"]["agent_verification_submissions"]["Row"];
type AgentProfileWithSubscriptionRow = AgentProfileRow & {
  subscriptions:
    | Array<
        Pick<
          Database["public"]["Tables"]["subscriptions"]["Row"],
          "expires_at" | "id" | "plan" | "starts_at" | "status"
        >
      >
    | null;
};
type OwnedListingRow = ListingRow & {
  listing_images: ListingImageRow[] | null;
};
type ModerationQueueRow = ListingRow & {
  agent_profiles: AgentProfileRow | null;
  listing_images: ListingImageRow[] | null;
};
type VerificationQueueRow = AgentVerificationSubmissionRow & {
  agent_profiles: AgentProfileRow | null;
};

export async function getAgentProfileByUserId(client: DbClient, userId: string) {
  const { data, error } = await client
    .from("agent_profiles")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function getAgentProfileWithSubscriptionsByUserId(
  client: DbClient,
  userId: string,
) {
  const { data, error } = await client
    .from("agent_profiles")
    .select(
      `
        *,
        subscriptions (
          id,
          plan,
          status,
          starts_at,
          expires_at
        )
      `,
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as unknown as AgentProfileWithSubscriptionRow | null;
}

export async function upsertAgentProfile(
  client: DbClient,
  userId: string,
  input: AgentProfileInput,
) {
  const { data, error } = await client
    .from("agent_profiles")
    .upsert(
      {
        bio: input.bio?.trim() || null,
        display_name: input.displayName.trim(),
        user_id: userId,
      },
      {
        onConflict: "user_id",
      },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createVerificationSubmission(
  client: DbClient,
  agentProfileId: string,
  input: AgentVerificationSubmissionInput,
) {
  const { data, error } = await client
    .from("agent_verification_submissions")
    .insert({
      agent_profile_id: agentProfileId,
      documents: input.documents,
      full_legal_name: input.fullLegalName.trim(),
      notes: input.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function markAgentVerificationPending(
  client: DbClient,
  agentProfileId: string,
) {
  const { data, error } = await client
    .from("agent_profiles")
    .update({
      verification_status: "pending_review",
      verification_submitted_at: new Date().toISOString(),
    })
    .eq("id", agentProfileId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateAgentVerificationStatus(
  client: DbClient,
  agentProfileId: string,
  status: Database["public"]["Enums"]["agent_verification_status"],
  extras?: Partial<Database["public"]["Tables"]["agent_profiles"]["Update"]>,
) {
  const { data, error } = await client
    .from("agent_profiles")
    .update({
      ...extras,
      verification_status: status,
    })
    .eq("id", agentProfileId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Grant an opening quota, but only to a profile that has none.
 *
 * Guarded on free_listing_quota = 0 so re-running an approval, or approving an
 * agent who was topped up out of band, never overwrites a balance they already
 * hold. Returns null when nothing was granted, which the caller reports rather
 * than treating as failure — unlike updateAgentFreeListingQuota, a no-match
 * here is an expected outcome, not a lost update.
 */
export async function grantFreeListingQuotaIfUnset(
  client: DbClient,
  agentProfileId: string,
  freeListingQuota: number,
) {
  const { data, error } = await client
    .from("agent_profiles")
    .update({
      free_listing_quota: freeListingQuota,
    })
    .eq("id", agentProfileId)
    .eq("free_listing_quota", 0)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as AgentProfileRow | null) ?? null;
}

/**
 * Compare-and-set on free_listing_quota.
 *
 * `expectedFreeListingQuota` is required and goes into the WHERE clause. Two
 * simultaneous submits that both read quota=3 would otherwise both write 2 and
 * consume one slot between them; with the guard the loser matches no row and
 * throws AGENT_QUOTA_CONFLICT (mapped to 409) instead of silently double
 * spending. There are no transactions in this layer yet, so the guard is the
 * only thing standing between a concurrent read and a lost update.
 */
export async function updateAgentFreeListingQuota(
  client: DbClient,
  agentProfileId: string,
  freeListingQuota: number,
  expectedFreeListingQuota: number,
) {
  const { data, error } = await client
    .from("agent_profiles")
    .update({
      free_listing_quota: freeListingQuota,
    })
    .eq("id", agentProfileId)
    .eq("free_listing_quota", expectedFreeListingQuota)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("AGENT_QUOTA_CONFLICT");
  }

  return data as AgentProfileRow;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function createDraftListing(
  client: DbClient,
  agentProfileId: string,
  input: AgentDraftListingInput,
) {
  const baseSlug = slugify(input.title);
  const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;

  const { data, error } = await client
    .from("listings")
    .insert({
      agent_profile_id: agentProfileId,
      amenities: input.amenities,
      area: input.area.trim(),
      bathrooms: input.bathrooms,
      bedrooms: input.bedrooms,
      city: input.city?.trim() || "Nsukka",
      description: input.description.trim(),
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      price_naira: input.priceNaira,
      property_type: input.propertyType,
      slug,
      state: input.state?.trim() || "Enugu",
      title: input.title.trim(),
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function listAgentListings(client: DbClient, agentProfileId: string) {
  const { data, error } = await client
    .from("listings")
    .select(
      `
        *,
        listing_images!listing_images_listing_id_fkey (
          id,
          listing_id,
          storage_path,
          public_url,
          position,
          width,
          height,
          mime_type,
          size_bytes,
          is_cover,
          created_at,
          deleted_at
        )
      `,
    )
    .eq("agent_profile_id", agentProfileId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as OwnedListingRow[]);
}

export async function getOwnedListing(
  client: DbClient,
  agentProfileId: string,
  listingId: string,
) {
  const { data, error } = await client
    .from("listings")
    .select(
      `
        *,
        listing_images!listing_images_listing_id_fkey (
          id,
          listing_id,
          storage_path,
          public_url,
          position,
          width,
          height,
          mime_type,
          size_bytes,
          is_cover,
          created_at,
          deleted_at
        )
      `,
    )
    .eq("id", listingId)
    .eq("agent_profile_id", agentProfileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as unknown as OwnedListingRow | null);
}

export async function getListingById(client: DbClient, listingId: string) {
  const { data, error } = await client
    .from("listings")
    .select(
      `
        *,
        agent_profiles (
          id,
          display_name,
          verification_status,
          user_id,
          bio,
          created_at,
          deleted_at,
          founding_agent,
          free_listing_quota,
          rejection_reason,
          suspension_reason,
          updated_at,
          verification_submitted_at,
          verified_at,
          verified_by
        ),
        listing_images!listing_images_listing_id_fkey (
          id,
          listing_id,
          storage_path,
          public_url,
          position,
          width,
          height,
          mime_type,
          size_bytes,
          is_cover,
          created_at,
          deleted_at
        )
      `,
    )
    .eq("id", listingId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as unknown as ModerationQueueRow | null);
}

export async function getVerificationSubmissionById(
  client: DbClient,
  submissionId: string,
) {
  const { data, error } = await client
    .from("agent_verification_submissions")
    .select(
      `
        *,
        agent_profiles (
          id,
          display_name,
          verification_status,
          user_id,
          bio,
          created_at,
          deleted_at,
          founding_agent,
          free_listing_quota,
          rejection_reason,
          suspension_reason,
          updated_at,
          verification_submitted_at,
          verified_at,
          verified_by
        )
      `,
    )
    .eq("id", submissionId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as unknown as VerificationQueueRow | null);
}

export async function markVerificationSubmissionReviewed(
  client: DbClient,
  submissionId: string,
  reviewedAt = new Date().toISOString(),
) {
  const { data, error } = await client
    .from("agent_verification_submissions")
    .update({
      reviewed_at: reviewedAt,
    })
    .eq("id", submissionId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export type RegisterListingImagesInput = {
  images: Array<{
    mimeType: string;
    position: number;
    publicUrl: string;
    sizeBytes: number;
    storagePath: string;
  }>;
  listingId: string;
};

export async function registerListingImages(
  client: DbClient,
  input: RegisterListingImagesInput,
) {
  const rows = input.images.map((image, index) => ({
    is_cover: image.position === 0 && index === 0,
    listing_id: input.listingId,
    mime_type: image.mimeType,
    position: image.position,
    public_url: image.publicUrl,
    size_bytes: image.sizeBytes,
    storage_path: image.storagePath,
  }));

  const { data, error } = await client
    .from("listing_images")
    .insert(rows)
    .select("*");

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function updateListingCoverImage(
  client: DbClient,
  listingId: string,
  coverImageId: string,
) {
  const { data, error } = await client
    .from("listings")
    .update({
      cover_image_id: coverImageId,
    })
    .eq("id", listingId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateDraftListing(
  client: DbClient,
  agentProfileId: string,
  listingId: string,
  input: Partial<AgentDraftListingInput>,
) {
  const updates: Partial<Database["public"]["Tables"]["listings"]["Update"]> = {};

  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.description !== undefined) updates.description = input.description.trim();
  if (input.area !== undefined) updates.area = input.area.trim();
  if (input.propertyType !== undefined) updates.property_type = input.propertyType;
  if (input.priceNaira !== undefined) updates.price_naira = input.priceNaira;
  if (input.bedrooms !== undefined) updates.bedrooms = input.bedrooms;
  if (input.bathrooms !== undefined) updates.bathrooms = input.bathrooms;
  if (input.city !== undefined) updates.city = input.city?.trim() || "Nsukka";
  if (input.state !== undefined) updates.state = input.state?.trim() || "Enugu";
  if (input.latitude !== undefined) updates.latitude = input.latitude ?? null;
  if (input.longitude !== undefined) updates.longitude = input.longitude ?? null;
  if (input.amenities !== undefined) updates.amenities = input.amenities;

  const { data, error } = await client
    .from("listings")
    .update(updates)
    .eq("id", listingId)
    .eq("agent_profile_id", agentProfileId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Compare-and-set on listings.status.
 *
 * `expectedStatus` is required and goes into the WHERE clause. Every caller
 * reads the row, validates the transition, then writes — without the guard
 * two concurrent moderators could both pass the check and both write, so the
 * second silently overwrites the first (approve landing on top of reject, or
 * a second submit re-stamping submitted_at). The loser now matches no row and
 * throws LISTING_STATE_CONFLICT (mapped to 409).
 */
export async function updateListingStatus(
  client: DbClient,
  listingId: string,
  status: Database["public"]["Enums"]["listing_status"],
  expectedStatus: Database["public"]["Enums"]["listing_status"],
  extras?: Partial<Database["public"]["Tables"]["listings"]["Update"]>,
) {
  const { data, error } = await client
    .from("listings")
    .update({
      ...extras,
      status,
    })
    .eq("id", listingId)
    .eq("status", expectedStatus)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("LISTING_STATE_CONFLICT");
  }

  return data;
}

export async function listModerationQueue(
  client: DbClient,
  statuses: Database["public"]["Enums"]["listing_status"][] = ["pending_review"],
) {
  const { data, error } = await client
    .from("listings")
    .select(
      `
        *,
        agent_profiles (
          id,
          display_name,
          verification_status,
          user_id,
          bio,
          created_at,
          deleted_at,
          founding_agent,
          free_listing_quota,
          rejection_reason,
          suspension_reason,
          updated_at,
          verification_submitted_at,
          verified_at,
          verified_by
        ),
        listing_images!listing_images_listing_id_fkey (
          id,
          listing_id,
          storage_path,
          public_url,
          position,
          width,
          height,
          mime_type,
          size_bytes,
          is_cover,
          created_at,
          deleted_at
        )
      `,
    )
    .in("status", statuses)
    .is("deleted_at", null)
    .order("submitted_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as ModerationQueueRow[]);
}

export async function listVerificationQueue(client: DbClient) {
  const { data, error } = await client
    .from("agent_verification_submissions")
    .select(
      `
        *,
        agent_profiles (
          id,
          display_name,
          verification_status,
          user_id,
          bio,
          created_at,
          deleted_at,
          founding_agent,
          free_listing_quota,
          rejection_reason,
          suspension_reason,
          updated_at,
          verification_submitted_at,
          verified_at,
          verified_by
        )
      `,
    )
    .is("deleted_at", null)
    .is("reviewed_at", null)
    .order("submitted_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as VerificationQueueRow[]).filter(
    (submission) => submission.agent_profiles?.verification_status === "pending_review",
  );
}
