import {
  DEFAULT_LISTINGS_LIMIT,
  MAX_LISTINGS_LIMIT,
} from "@/features/listings/constants";
import { decodeListingCursor } from "@/features/listings/cursor";
import type { ListingListFilters, ListingSort } from "@/features/listings/types";

const propertyTypes = [
  "self_contain",
  "1_bedroom",
  "2_bedroom",
  "3_bedroom",
  "shop",
  "lodge_room",
 ] as const;
const propertyTypeSet = new Set<string>(propertyTypes);

const sorts = new Set<ListingSort>(["newest", "price_asc", "price_desc"]);

function parseInteger(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseBoolean(value: string | null) {
  if (!value) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

export function parseListingListFilters(
  searchParams: URLSearchParams,
): ListingListFilters {
  const limit = parseInteger(searchParams.get("limit")) ?? DEFAULT_LISTINGS_LIMIT;
  const sort = searchParams.get("sort");
  const propertyType = searchParams.get("propertyType");
  const cursor = searchParams.get("cursor");

  return {
    area: searchParams.get("area")?.trim() || undefined,
    bedrooms: parseInteger(searchParams.get("bedrooms")),
    city: searchParams.get("city")?.trim() || undefined,
    cursor: cursor && decodeListingCursor(cursor) ? cursor : undefined,
    limit: Math.max(1, Math.min(limit, MAX_LISTINGS_LIMIT)),
    maxPrice: parseInteger(searchParams.get("maxPrice")),
    minPrice: parseInteger(searchParams.get("minPrice")),
    propertyType:
      propertyType && propertyTypeSet.has(propertyType)
        ? (propertyType as (typeof propertyTypes)[number])
        : undefined,
    sort: sort && sorts.has(sort as ListingSort) ? (sort as ListingSort) : "newest",
    state: searchParams.get("state")?.trim() || undefined,
    verifiedOnly: parseBoolean(searchParams.get("verifiedOnly")),
  };
}

export function parseListingIdentifier(value: string) {
  const trimmed = value.trim();
  const splitIndex = trimmed.lastIndexOf("--");

  if (splitIndex === -1) {
    return {
      publicId: trimmed,
      slug: null,
    };
  }

  return {
    publicId: trimmed.slice(splitIndex + 2),
    slug: trimmed.slice(0, splitIndex) || null,
  };
}
