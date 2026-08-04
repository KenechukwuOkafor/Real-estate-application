import { describe, expect, it } from "vitest";

import { parseListingIdentifier } from "@/features/listings/parsers";

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
