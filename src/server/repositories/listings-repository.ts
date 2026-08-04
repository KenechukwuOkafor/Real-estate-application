import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { decodeListingCursor, encodeListingCursor } from "@/features/listings/cursor";
import { buildCanonicalListingUrl } from "@/features/listings/serializers";
import type {
  ListingDetail,
  ListingListFilters,
  ListingListItem,
  ListingListResult,
} from "@/features/listings/types";
import type { Database } from "@/types/database";

type DbClient = SupabaseClient<Database>;

type AgentProfileSummaryRow = Pick<
  Database["public"]["Tables"]["agent_profiles"]["Row"],
  "display_name" | "id" | "verification_status"
>;

type ListingImageSummaryRow = Pick<
  Database["public"]["Tables"]["listing_images"]["Row"],
  "created_at" | "deleted_at" | "height" | "id" | "is_cover" | "listing_id" | "mime_type" | "position" | "public_url" | "size_bytes" | "storage_path" | "width"
>;

type PublicListingListRow = Pick<
  Database["public"]["Tables"]["listings"]["Row"],
  | "approved_at"
  | "area"
  | "bathrooms"
  | "bedrooms"
  | "city"
  | "deleted_at"
  | "id"
  | "price_naira"
  | "property_type"
  | "public_uuid"
  | "slug"
  | "state"
  | "status"
  | "title"
> & {
  agent_profiles: AgentProfileSummaryRow | null;
  listing_images: ListingImageSummaryRow[] | null;
};

type PublicListingDetailRow = Pick<
  Database["public"]["Tables"]["listings"]["Row"],
  | "amenities"
  | "approved_at"
  | "area"
  | "bathrooms"
  | "bedrooms"
  | "city"
  | "country"
  | "description"
  | "id"
  | "latitude"
  | "longitude"
  | "price_naira"
  | "property_type"
  | "public_uuid"
  | "slug"
  | "state"
  | "status"
  | "title"
  | "video_url"
> & {
  agent_profiles: AgentProfileSummaryRow | null;
  listing_images: ListingImageSummaryRow[] | null;
};

function applyPublicListingFilters(
  query: ReturnType<DbClient["from"]>,
  filters: ListingListFilters,
) {
  let nextQuery = query
    .eq("status", "approved")
    .is("deleted_at", null)
    .neq("status", "under_dispute");

  if (filters.area) {
    nextQuery = nextQuery.ilike("area", `%${filters.area}%`);
  }

  if (filters.city) {
    nextQuery = nextQuery.eq("city", filters.city);
  }

  if (filters.state) {
    nextQuery = nextQuery.eq("state", filters.state);
  }

  if (filters.propertyType) {
    nextQuery = nextQuery.eq("property_type", filters.propertyType);
  }

  if (typeof filters.bedrooms === "number") {
    nextQuery = nextQuery.eq("bedrooms", filters.bedrooms);
  }

  if (typeof filters.minPrice === "number") {
    nextQuery = nextQuery.gte("price_naira", filters.minPrice);
  }

  if (typeof filters.maxPrice === "number") {
    nextQuery = nextQuery.lte("price_naira", filters.maxPrice);
  }

  if (filters.verifiedOnly) {
    nextQuery = nextQuery.eq("agent_profiles.verification_status", "verified");
  }

  return nextQuery;
}

function applySort(
  query: ReturnType<DbClient["from"]>,
  filters: ListingListFilters,
) {
  if (filters.sort === "price_asc") {
    return query.order("price_naira", { ascending: true }).order("id", {
      ascending: true,
    });
  }

  if (filters.sort === "price_desc") {
    return query.order("price_naira", { ascending: false }).order("id", {
      ascending: false,
    });
  }

  return query.order("approved_at", { ascending: false }).order("id", {
    ascending: false,
  });
}

function applyCursor(
  query: ReturnType<DbClient["from"]>,
  filters: ListingListFilters,
) {
  if (!filters.cursor) {
    return query;
  }

  const cursor = decodeListingCursor(filters.cursor);

  if (!cursor || cursor.sort !== filters.sort) {
    return query;
  }

  if (filters.sort === "newest") {
    return query.or(
      `approved_at.lt.${cursor.lastValue},and(approved_at.eq.${cursor.lastValue},id.lt.${cursor.lastId})`,
    );
  }

  if (filters.sort === "price_asc") {
    return query.or(
      `price_naira.gt.${cursor.lastValue},and(price_naira.eq.${cursor.lastValue},id.gt.${cursor.lastId})`,
    );
  }

  return query.or(
    `price_naira.lt.${cursor.lastValue},and(price_naira.eq.${cursor.lastValue},id.lt.${cursor.lastId})`,
  );
}

function mapListingCard(row: PublicListingListRow | PublicListingDetailRow): ListingListItem {
  const images = row.listing_images ?? [];
  const coverImage =
    images.find((image) => image.is_cover && !image.deleted_at) ??
    images.find((image) => !image.deleted_at) ??
    null;

  return {
    agent: {
      displayName: row.agent_profiles?.display_name ?? "Verified Agent",
      isVerified: row.agent_profiles?.verification_status === "verified",
    },
    approvedAt: row.approved_at,
    area: row.area,
    bathrooms: row.bathrooms,
    bedrooms: row.bedrooms,
    city: row.city,
    coverImageUrl: coverImage?.public_url ?? null,
    id: row.id,
    priceNaira: row.price_naira,
    propertyType: row.property_type,
    publicId: row.public_uuid,
    slug: row.slug,
    state: row.state,
    title: row.title,
  };
}

export async function getPublicListings(
  client: DbClient,
  filters: ListingListFilters,
): Promise<ListingListResult> {
  let query = client
    .from("listings")
    .select(
      `
        id,
        public_uuid,
        slug,
        title,
        property_type,
        price_naira,
        bedrooms,
        bathrooms,
        area,
        city,
        state,
        approved_at,
        status,
        deleted_at,
        agent_profiles!inner (
          id,
          display_name,
          verification_status,
          bio,
          created_at,
          deleted_at,
          founding_agent,
          free_listing_quota,
          rejection_reason,
          suspension_reason,
          updated_at,
          user_id,
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
    );

  query = applyPublicListingFilters(query, filters);
  query = applyCursor(query, filters);
  query = applySort(query, filters);

  const { data, error } = await query.limit(filters.limit + 1);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as PublicListingListRow[];
  const hasMore = rows.length > filters.limit;
  const items = rows.slice(0, filters.limit).map(mapListingCard);
  const lastItem = items.at(-1);

  return {
    hasMore,
    items,
    limit: filters.limit,
    nextCursor:
      hasMore && lastItem
        ? encodeListingCursor({
            lastId: lastItem.id,
            lastValue:
              filters.sort === "newest"
                ? lastItem.approvedAt ?? ""
                : lastItem.priceNaira,
            sort: filters.sort,
          })
        : null,
  };
}

export async function getPublicListingByIdentifier(
  client: DbClient,
  publicId: string,
  slug?: string | null,
): Promise<ListingDetail | null> {
  const { data, error } = await client
    .from("listings")
    .select(
      `
        id,
        public_uuid,
        slug,
        title,
        description,
        property_type,
        price_naira,
        bedrooms,
        bathrooms,
        area,
        city,
        state,
        country,
        latitude,
        longitude,
        amenities,
        video_url,
        approved_at,
        status,
        agent_profiles!inner (
          id,
          display_name,
          verification_status,
          bio,
          created_at,
          deleted_at,
          founding_agent,
          free_listing_quota,
          rejection_reason,
          suspension_reason,
          updated_at,
          user_id,
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
    .eq("public_uuid", publicId)
    .eq("status", "approved")
    .is("deleted_at", null)
    .single();

  if (error?.code === "PGRST116") {
    return null;
  }

  if (error) {
    throw error;
  }

  const row = data as unknown as PublicListingDetailRow;

  if (slug && row.slug !== slug) {
    return null;
  }

  const images = (row.listing_images ?? [])
    .filter((image) => !image.deleted_at)
    .sort((left, right) => left.position - right.position);

  const card = mapListingCard(row);

  return {
    ...card,
    amenities: Array.isArray(row.amenities)
      ? row.amenities.filter((item): item is string => typeof item === "string")
      : [],
    country: row.country,
    description: row.description,
    images: images.map((image) => ({
      id: image.id,
      isCover: image.is_cover,
      position: image.position,
      url: image.public_url,
    })),
    latitude: row.latitude,
    longitude: row.longitude,
    share: {
      canonicalUrl: buildCanonicalListingUrl(row.slug, row.public_uuid),
    },
    status: "approved",
    videoUrl: row.video_url,
  };
}

export async function getPublicListingIdByUuid(
  client: DbClient,
  publicId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await client
    .from("listings")
    .select("id")
    .eq("public_uuid", publicId)
    .eq("status", "approved")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function saveListing(
  client: DbClient,
  userId: string,
  listingId: string,
) {
  const { data, error } = await client
    .from("saved_listings")
    .upsert({ listing_id: listingId, user_id: userId }, { onConflict: "user_id,listing_id" })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function unsaveListing(
  client: DbClient,
  userId: string,
  listingId: string,
) {
  const { error } = await client
    .from("saved_listings")
    .delete()
    .eq("user_id", userId)
    .eq("listing_id", listingId);

  if (error) {
    throw error;
  }
}

export async function createListingView(
  client: DbClient,
  input: {
    ipHash?: string | null;
    listingId: string;
    referrer?: string | null;
    sessionId?: string | null;
    userAgent?: string | null;
    viewerUserId?: string | null;
  },
) {
  const { error } = await client.from("listing_views").insert({
    ip_hash: input.ipHash ?? null,
    listing_id: input.listingId,
    referrer: input.referrer ?? null,
    session_id: input.sessionId ?? null,
    user_agent: input.userAgent ?? null,
    viewer_user_id: input.viewerUserId ?? null,
  });

  if (error) {
    throw error;
  }
}
