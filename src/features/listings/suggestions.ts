import type { ListingListItem } from "@/features/listings/types";

/**
 * Areas are free-text columns, not first-class entities, so there is no table
 * to read. Deriving them from listings that actually exist keeps the sheet
 * honest: it can only ever suggest an area a seeker can really find something
 * in. A hardcoded list would suggest empty areas.
 */
export function deriveAreaSuggestions(listings: ListingListItem[]) {
  return [...new Set(listings.map((listing) => listing.area.trim()))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

export const HOME_PROPERTY_TYPES: Array<{
  icon: "bed" | "building" | "door";
  label: string;
  value: string;
}> = [
  { icon: "door", label: "Self contain", value: "self_contain" },
  { icon: "bed", label: "1 bedroom", value: "1_bedroom" },
  { icon: "building", label: "2 bedroom", value: "2_bedroom" },
];

export const PRICE_BANDS: Array<{
  label: string;
  maxPrice?: number;
  minPrice?: number;
}> = [
  { label: "Under ₦200,000", maxPrice: 200000 },
  { label: "₦200,000 – ₦500,000", maxPrice: 500000, minPrice: 200000 },
  { label: "₦500,000 and above", minPrice: 500000 },
];
