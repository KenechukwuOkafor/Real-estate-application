import type { ListingListFilters } from "@/features/listings/types";

type SearchParamRecord = Record<string, string | string[] | undefined>;

export function toSearchParams(input: SearchParamRecord): URLSearchParams {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      searchParams.set(key, value);
      continue;
    }

    if (Array.isArray(value) && value[0]) {
      searchParams.set(key, value[0]);
    }
  }

  return searchParams;
}

export function buildListingSearchQuery(
  filters: ListingListFilters,
  overrides?: Partial<ListingListFilters>,
) {
  const finalFilters = { ...filters, ...overrides };
  const searchParams = new URLSearchParams();

  if (finalFilters.area) {
    searchParams.set("area", finalFilters.area);
  }

  if (typeof finalFilters.bedrooms === "number") {
    searchParams.set("bedrooms", String(finalFilters.bedrooms));
  }

  if (finalFilters.city) {
    searchParams.set("city", finalFilters.city);
  }

  if (finalFilters.cursor) {
    searchParams.set("cursor", finalFilters.cursor);
  }

  if (finalFilters.limit) {
    searchParams.set("limit", String(finalFilters.limit));
  }

  if (typeof finalFilters.maxPrice === "number") {
    searchParams.set("maxPrice", String(finalFilters.maxPrice));
  }

  if (typeof finalFilters.minPrice === "number") {
    searchParams.set("minPrice", String(finalFilters.minPrice));
  }

  if (finalFilters.propertyType) {
    searchParams.set("propertyType", finalFilters.propertyType);
  }

  if (finalFilters.sort) {
    searchParams.set("sort", finalFilters.sort);
  }

  if (finalFilters.state) {
    searchParams.set("state", finalFilters.state);
  }

  if (typeof finalFilters.verifiedOnly === "boolean") {
    searchParams.set("verifiedOnly", String(finalFilters.verifiedOnly));
  }

  return searchParams.toString();
}
