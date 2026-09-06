import "server-only";

import {
  createAgentProfileView,
  getAgentProfileByHandle,
  getAgentResponseRate,
} from "@/server/repositories/agent-profile-repository";
import { signAgentAvatarPath, signListingImagePaths } from "@/server/services/listing-media-service";
import { createSupabaseAuthenticatedClient } from "@/lib/db/supabase/authenticated";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import { publicResponseRate } from "@/features/agents/public-response-rate";
import type { ListingListItem } from "@/features/listings/types";
import type { Database } from "@/types/database";

type ListingRow = Database["public"]["Tables"]["listings"]["Row"];
type ImageRow = Database["public"]["Tables"]["listing_images"]["Row"];

/**
 * The public agent profile, as one page for two viewers.
 *
 * ===========================================================================
 * ONE QUERY, AND RLS IS THE VIEWER-DEPENDENT FILTER
 * ===========================================================================
 *
 * The listing query below carries NO status filter, and that is the whole
 * trick. `public_can_read_approved_listings` admits status='approved' to
 * everyone; `agents_read_own_listings` admits every status to the agent who
 * owns them. So the same statement returns the approved grid to a stranger and
 * the full set to its owner, without the application deciding anything.
 *
 * The application then partitions by status anyway, and renders the
 * non-approved half only when the viewer is the owner. That is not redundancy
 * for its own sake: an admin holds a read-all policy on listings, so without
 * the second gate an admin opening somebody's public profile would see their
 * drafts sitting in a public grid. Two independent controls, both failing
 * closed.
 */

/**
 * Which client to open — and it is not a detail.
 *
 * The signed avatar URL, the listings, and the response rate are all read as
 * the caller. An agent looking at their own unverified profile must see it;
 * nobody else may. Falling back to the anon client rather than throwing is
 * what makes the page work for a signed-out visitor, which is the case it
 * exists for.
 */
async function callerClient() {
  return createSupabaseAuthenticatedClient().catch(() => createSupabaseServerClient());
}

export type PublicAgentProfile = {
  /** Signed at render time; null when there is no avatar or no entitlement. */
  avatarUrl: string | null;
  bio: string | null;
  displayName: string;
  handle: string;
  /** The viewer is this agent. Gates everything below the public fold. */
  isOwner: boolean;
  isVerified: boolean;
  listings: ListingListItem[];
  /** Owner-only. Empty for every other viewer, whatever RLS returned. */
  privateListings: Array<ListingListItem & { status: string }>;
  profileId: string;
  responseRate: ReturnType<typeof publicResponseRate>;
  verifiedAt: string | null;
};

export async function getPublicAgentProfile(
  handle: string,
): Promise<PublicAgentProfile | null> {
  const client = await callerClient();
  const profile = await getAgentProfileByHandle(client, handle);

  if (!profile) {
    return null;
  }

  /**
   * Ownership through current_agent_profile_id(), which is granted to anon and
   * answers null for them. Comparing profile ids rather than user ids keeps
   * this off agent_profiles.user_id, a column this page has no other reason to
   * read and which 0037's note flags as the next one to close.
   */
  const { data: viewerProfileId } = await client.rpc("current_agent_profile_id");
  const isOwner = Boolean(viewerProfileId) && viewerProfileId === profile.id;

  const [avatarUrl, rate, listingRows] = await Promise.all([
    signAgentAvatarPath(client, profile.avatar_path),
    getAgentResponseRate(client, profile.id),
    listProfileListings(client, profile.id),
  ]);

  const cards = await withSignedCovers(
    client,
    listingRows.map((row) => toCard(row, profile)),
  );

  return {
    avatarUrl,
    bio: profile.bio,
    displayName: profile.display_name,
    handle: profile.handle,
    isOwner,
    isVerified: profile.verification_status === "verified",
    listings: cards.filter((card) => card.status === "approved"),
    privateListings: isOwner
      ? cards.filter((card) => card.status !== "approved")
      : [],
    profileId: profile.id,
    responseRate: publicResponseRate(rate),
    verifiedAt: profile.verified_at,
  };
}

/**
 * Record that somebody looked at this profile.
 *
 * Non-blocking in the same sense listing views are: a failure here must never
 * cost the page. The caller ignores the outcome, and the endpoint answers 200
 * regardless — but it distinguishes "recorded" from "nothing to record", so
 * this cannot silently record nothing for months the way listing views once
 * did.
 */
export async function trackAgentProfileView(input: {
  handle: string;
  ipHash: string | null;
  referrer: string | null;
  sessionId: string | null;
  userAgent: string | null;
}): Promise<{ reason?: string; tracked: boolean }> {
  const client = await callerClient();
  const profile = await getAgentProfileByHandle(client, input.handle);

  if (!profile) {
    return { reason: "unresolved", tracked: false };
  }

  if (profile.verification_status !== "verified") {
    // The insert policy would refuse this anyway. Naming it here keeps an
    // agent previewing their own unverified page out of their own numbers,
    // and keeps the refusal from reading as a bug.
    return { reason: "unverified", tracked: false };
  }

  await createAgentProfileView(client, {
    agentProfileId: profile.id,
    ipHash: input.ipHash,
    referrer: input.referrer,
    sessionId: input.sessionId,
    userAgent: input.userAgent,
  });

  return { tracked: true };
}

type ProfileListingRow = ListingRow & { listing_images: ImageRow[] | null };

async function listProfileListings(
  client: Awaited<ReturnType<typeof callerClient>>,
  agentProfileId: string,
) {
  const { data, error } = await client
    .from("listings")
    .select(
      `
        id,
        public_uuid,
        slug,
        title,
        property_type,
        rental_duration,
        sublet_months,
        price_naira,
        bedrooms,
        bathrooms,
        area,
        city,
        state,
        approved_at,
        status,
        listing_images!listing_images_listing_id_fkey (
          id,
          storage_path,
          position,
          is_cover,
          deleted_at
        )
      `,
    )
    .eq("agent_profile_id", agentProfileId)
    .order("approved_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as ProfileListingRow[];
}

function toCard(
  row: ProfileListingRow,
  profile: { display_name: string; verification_status: string },
): ListingListItem & { status: string } {
  const images = row.listing_images ?? [];
  const cover =
    images.find((image) => image.is_cover && !image.deleted_at) ??
    images.find((image) => !image.deleted_at) ??
    null;

  return {
    // Filled from the profile already in hand rather than embedded again: on
    // this page every card belongs to the agent whose name is at the top, so
    // the join the public feed needs would be one round trip for a value that
    // is constant down the whole grid.
    agent: {
      displayName: profile.display_name,
      isVerified: profile.verification_status === "verified",
    },
    approvedAt: row.approved_at,
    area: row.area,
    bathrooms: row.bathrooms,
    bedrooms: row.bedrooms,
    city: row.city,
    coverImageStoragePath: cover?.storage_path ?? null,
    coverImageUrl: null,
    id: row.id,
    priceNaira: row.price_naira,
    propertyType: row.property_type,
    publicId: row.public_uuid,
    rentalDuration: row.rental_duration,
    slug: row.slug,
    state: row.state,
    status: row.status,
    subletMonths: row.sublet_months,
    title: row.title,
  };
}

async function withSignedCovers<T extends ListingListItem>(
  client: Awaited<ReturnType<typeof callerClient>>,
  items: T[],
): Promise<T[]> {
  const signed = await signListingImagePaths(
    client,
    items
      .map((item) => item.coverImageStoragePath)
      .filter((path): path is string => Boolean(path)),
  );

  return items.map((item) => ({
    ...item,
    coverImageUrl: item.coverImageStoragePath
      ? (signed.get(item.coverImageStoragePath) ?? null)
      : null,
  }));
}
