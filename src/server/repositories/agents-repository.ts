import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AgentDraftListingInput,
  AgentProfileInput,
  AgentVerificationSubmissionInput,
} from "@/features/agents/types";
import { AppError } from "@/lib/api/errors";
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

/**
 * Create or update an agent's profile.
 *
 * Deliberately NOT `.upsert()`.
 *
 * PostgREST compiles an upsert to `INSERT ... ON CONFLICT DO UPDATE SET`, with
 * every column in the payload appearing in the SET list — including `user_id`.
 * Postgres checks column privileges for that SET list statically, when it plans
 * the statement, not per row. So the UPDATE privilege on `user_id` is required
 * even on a first insert where no conflict is possible.
 *
 * `authenticated` holds UPDATE on exactly (bio, display_name, updated_at) by
 * design: migration 0013 withholds verification_status, verified_at,
 * verified_by, founding_agent, free_listing_quota, rejection_reason and
 * suspension_reason because each is a self-grant, and it withholds `user_id`
 * because a profile must not be reassignable to another account.
 *
 * The grant is right. The upsert was wrong: it demanded a privilege nobody
 * should hold and failed with 42501 permission denied, which surfaced as a 500
 * and blocked agent onboarding at its first step — no profile, so no
 * verification, no quota, no listings.
 *
 * Reading first and then writing only the granted columns keeps the least
 * privilege intact. The read is not a TOCTOU risk: `agent_profiles.user_id` is
 * UNIQUE, so a concurrent insert loses on the constraint rather than producing
 * a second profile.
 */
export async function upsertAgentProfile(
  client: DbClient,
  userId: string,
  input: AgentProfileInput,
) {
  const fields = {
    bio: input.bio?.trim() || null,
    display_name: input.displayName.trim(),
  };

  const { data: existing, error: readError } = await client
    .from("agent_profiles")
    .select("id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  const { data, error } = existing
    ? await client
        .from("agent_profiles")
        .update(fields)
        .eq("id", existing.id)
        .select("*")
        .single()
    : await client
        .from("agent_profiles")
        .insert({ ...fields, user_id: userId })
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
    throw new AppError(
      "AGENT_QUOTA_CONFLICT",
      "Your listing quota changed while you were working. Reload and try again.",
    );
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
      rental_duration: input.rentalDuration,
      slug,
      state: input.state?.trim() || "Enugu",
      // Normalised here as well as validated: the CHECK refuses a month count on
      // anything that is not a sublet, so passing one through would turn a
      // caller's mistake into a 500 instead of a stored row.
      sublet_months: input.rentalDuration === "sublet" ? input.subletMonths : null,
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

  /**
   * The duration and its month count are written as a pair, never singly.
   *
   * This is the one place the CHECK constraint makes itself felt. A partial
   * update that set rental_duration = 'yearly' while leaving a stale
   * sublet_months behind would violate the constraint and fail the whole
   * statement, so switching away from a sublet has to clear the count in the
   * same UPDATE. Deriving it here means a caller cannot forget.
   */
  if (input.rentalDuration !== undefined) {
    updates.rental_duration = input.rentalDuration;
    updates.sublet_months =
      input.rentalDuration === "sublet" ? (input.subletMonths ?? null) : null;
  } else if (input.subletMonths !== undefined) {
    // A month count with no duration alongside it. Left to the constraint
    // rather than guessed at: writing it blind could pair a count with a
    // yearly listing, and inferring the duration from its presence would be
    // the caller's intent invented rather than read.
    updates.sublet_months = input.subletMonths;
  }

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
    throw new AppError(
      "LISTING_STATE_CONFLICT",
      "This listing changed while you were working on it. Reload and try again.",
    );
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

export type VerificationDocumentRow =
  Database["public"]["Tables"]["verification_documents"]["Row"];

export async function insertVerificationDocuments(
  client: DbClient,
  rows: Database["public"]["Tables"]["verification_documents"]["Insert"][],
) {
  if (rows.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("verification_documents")
    .insert(rows)
    .select("*");

  if (error) {
    throw error;
  }

  return (data ?? []) as VerificationDocumentRow[];
}

export async function listVerificationDocumentsForSubmissions(
  client: DbClient,
  submissionIds: string[],
) {
  if (submissionIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("verification_documents")
    .select("*")
    .in("agent_verification_submission_id", submissionIds)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  return (data ?? []) as VerificationDocumentRow[];
}
