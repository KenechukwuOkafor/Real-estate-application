import { describe, expect, it } from "vitest";

import { countActiveFilters } from "@/features/listings/search-params";

describe("countActiveFilters", () => {
  it("returns 0 when no params are present", () => {
    expect(countActiveFilters(new URLSearchParams())).toBe(0);
  });

  it("counts bedrooms=0 as an active filter", () => {
    // Regression: a parsed numeric 0 is falsy, but the raw query string "0"
    // is a real, user-applied filter and must be counted.
    expect(countActiveFilters(new URLSearchParams("bedrooms=0"))).toBe(1);
  });

  it("counts minPrice=0 as an active filter", () => {
    expect(countActiveFilters(new URLSearchParams("minPrice=0"))).toBe(1);
  });

  it("counts maxPrice=0 as an active filter", () => {
    expect(countActiveFilters(new URLSearchParams("maxPrice=0"))).toBe(1);
  });

  it("counts several filters applied together", () => {
    expect(
      countActiveFilters(
        new URLSearchParams(
          "area=Hill+Top&propertyType=self_contain&minPrice=100000&verifiedOnly=true",
        ),
      ),
    ).toBe(4);
  });

  it("counts a city-only or state-only filter", () => {
    expect(countActiveFilters(new URLSearchParams("city=Nsukka"))).toBe(1);
    expect(countActiveFilters(new URLSearchParams("state=Enugu"))).toBe(1);
  });

  it("ignores params outside the active-filter key list", () => {
    expect(
      countActiveFilters(new URLSearchParams("cursor=abc&sort=newest&limit=20")),
    ).toBe(0);
  });
});
