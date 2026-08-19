import { beforeEach, describe, expect, it, vi } from "vitest";

const createListingView = vi.fn();
const getPublicListingIdByUuid = vi.fn();

vi.mock("@/lib/db/supabase", () => ({
  createSupabaseServerClient: vi.fn(async () => ({})),
}));

vi.mock("@/server/repositories/listings-repository", () => ({
  createListingView,
  getPublicListingByIdentifier: vi.fn(),
  getPublicListingIdByUuid,
  getPublicListings: vi.fn(),
}));

const { trackListingView } = await import(
  "@/server/services/public-listings-service"
);

const LISTING_UUID = "0198c1f2-3a4b-7c8d-9e0f-1a2b3c4d5e6f";

beforeEach(() => {
  vi.clearAllMocks();
  createListingView.mockResolvedValue(undefined);
  getPublicListingIdByUuid.mockResolvedValue({ id: "listing_row_1" });
});

describe("trackListingView", () => {
  it("records the resolved listings.id, never the url identifier", async () => {
    await trackListingView({ slugOrPublicId: `modern-flat--${LISTING_UUID}` });

    expect(getPublicListingIdByUuid).toHaveBeenCalledWith({}, LISTING_UUID);
    expect(createListingView).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ listingId: "listing_row_1" }),
    );
  });

  it("accepts a bare public uuid", async () => {
    await trackListingView({ slugOrPublicId: LISTING_UUID });

    expect(getPublicListingIdByUuid).toHaveBeenCalledWith({}, LISTING_UUID);
  });

  it("does not query the database for a malformed identifier", async () => {
    const result = await trackListingView({ slugOrPublicId: "not-a-listing" });

    expect(result).toEqual({ tracked: false });
    expect(getPublicListingIdByUuid).not.toHaveBeenCalled();
    expect(createListingView).not.toHaveBeenCalled();
  });

  it("reports untracked without throwing when the listing does not resolve", async () => {
    getPublicListingIdByUuid.mockResolvedValue(null);

    const result = await trackListingView({ slugOrPublicId: LISTING_UUID });

    expect(result).toEqual({ tracked: false });
    expect(createListingView).not.toHaveBeenCalled();
  });

  it("reports tracked when the view is recorded", async () => {
    const result = await trackListingView({ slugOrPublicId: LISTING_UUID });

    expect(result).toEqual({ tracked: true });
  });
});
