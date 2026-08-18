import { describe, expect, it } from "vitest";

import {
  deriveAreaSuggestions,
  HOME_PROPERTY_TYPES,
  PRICE_BANDS,
} from "@/features/listings/suggestions";
import type { ListingListItem } from "@/features/listings/types";

function listing(area: string, id: string): ListingListItem {
  return {
    agent: { displayName: "A", isVerified: true },
    approvedAt: null,
    area,
    bathrooms: 1,
    bedrooms: 1,
    city: "Nsukka",
    coverImageUrl: null,
  coverImageStoragePath: null,
    id,
    priceNaira: 100000,
    propertyType: "self_contain",
    publicId: `p-${id}`,
    slug: `s-${id}`,
    state: "Enugu",
    title: "T",
  };
}

describe("deriveAreaSuggestions", () => {
  it("returns each area once, alphabetically", () => {
    const result = deriveAreaSuggestions([
      listing("Odenigbo", "1"),
      listing("Hill Top", "2"),
      listing("Odenigbo", "3"),
    ]);

    expect(result).toEqual(["Hill Top", "Odenigbo"]);
  });

  it("returns nothing when there are no listings, rather than inventing areas", () => {
    expect(deriveAreaSuggestions([])).toEqual([]);
  });
});

describe("HOME_PROPERTY_TYPES", () => {
  it("offers exactly the three tiles the homepage shows", () => {
    expect(HOME_PROPERTY_TYPES.map((type) => type.value)).toEqual([
      "self_contain",
      "1_bedroom",
      "2_bedroom",
    ]);
  });
});

describe("PRICE_BANDS", () => {
  it("covers the range without gaps", () => {
    expect(PRICE_BANDS.length).toBeGreaterThan(0);
    expect(PRICE_BANDS[0].minPrice).toBeUndefined();
    expect(PRICE_BANDS.at(-1)?.maxPrice).toBeUndefined();
  });
});
