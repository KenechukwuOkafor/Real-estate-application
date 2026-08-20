import { describe, expect, it } from "vitest";

import {
  parseListingIdentifier,
  parseListingListFilters,
} from "@/features/listings/parsers";

const LISTING_UUID = "0198c1f2-3a4b-7c8d-9e0f-1a2b3c4d5e6f";

describe("parseListingIdentifier", () => {
  it("splits a slug and public id on the final double dash", () => {
    expect(parseListingIdentifier(`modern-flat--${LISTING_UUID}`)).toEqual({
      publicId: LISTING_UUID,
      slug: "modern-flat",
    });
  });

  it("splits on the last double dash when the slug contains one", () => {
    expect(parseListingIdentifier(`a--b--${LISTING_UUID}`)).toEqual({
      publicId: LISTING_UUID,
      slug: "a--b",
    });
  });

  it("treats a bare value as a public id", () => {
    expect(parseListingIdentifier(LISTING_UUID)).toEqual({
      publicId: LISTING_UUID,
      slug: null,
    });
  });

  it("performs no validation on unrecognised input", () => {
    // Documents existing behaviour: this function never fails. Callers that
    // reach the database must validate the uuid shape themselves.
    expect(parseListingIdentifier("garbage")).toEqual({
      publicId: "garbage",
      slug: null,
    });
  });
});


describe("parseListingListFilters — rental duration", () => {
  function filtersFor(query: string) {
    return parseListingListFilters(new URLSearchParams(query));
  }

  it.each(["yearly", "monthly", "sublet"])("accepts %s", (duration) => {
    expect(filtersFor(`rentalDuration=${duration}`).rentalDuration).toBe(duration);
  });

  it("is undefined when absent, so the feed is unfiltered", () => {
    expect(filtersFor("").rentalDuration).toBeUndefined();
  });

  /**
   * An unrecognised value must not reach the query.
   *
   * rental_duration is a Postgres enum, so an unknown string would fail the
   * cast and turn a crafted query string into a 500. Dropping it matches how an
   * unknown property type is already handled: the caller gets the unfiltered
   * feed, not an error.
   */
  it.each(["weekly", "SUBLET", "sublet; drop table listings", ""])(
    "drops %j rather than passing it to the query",
    (value) => {
      expect(filtersFor(`rentalDuration=${value}`).rentalDuration).toBeUndefined();
    },
  );
});
