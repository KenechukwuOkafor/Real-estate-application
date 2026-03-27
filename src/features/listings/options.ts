import type { ListingSort } from "@/features/listings/types";

export const listingPropertyTypeOptions = [
  { label: "Any type", value: "" },
  { label: "Self contain", value: "self_contain" },
  { label: "1 bedroom", value: "1_bedroom" },
  { label: "2 bedroom", value: "2_bedroom" },
  { label: "3 bedroom", value: "3_bedroom" },
  { label: "Shop", value: "shop" },
  { label: "Lodge room", value: "lodge_room" },
] as const;

export const listingBedroomOptions = [
  { label: "Any", value: "" },
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "3", value: "3" },
] as const;

export const listingSortOptions: Array<{ label: string; value: ListingSort }> = [
  { label: "Newest first", value: "newest" },
  { label: "Lowest price", value: "price_asc" },
  { label: "Highest price", value: "price_desc" },
];

export function getListingPropertyTypeLabel(value: string | undefined) {
  return (
    listingPropertyTypeOptions.find((option) => option.value === value)?.label ??
    value
  );
}

export function getListingSortLabel(value: ListingSort) {
  return (
    listingSortOptions.find((option) => option.value === value)?.label ?? value
  );
}
