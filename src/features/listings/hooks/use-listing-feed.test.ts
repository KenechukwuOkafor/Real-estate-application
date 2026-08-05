import { describe, expect, it } from "vitest";

import {
  buildFeedCacheKey,
  shouldRestoreSnapshot,
} from "@/features/listings/hooks/use-listing-feed";

describe("buildFeedCacheKey", () => {
  it("namespaces the key so it cannot collide with other session data", () => {
    expect(buildFeedCacheKey("")).toBe("ruvo:feed:");
  });

  it("varies with the filter query so each filter set restores separately", () => {
    expect(buildFeedCacheKey("area=Hill+Top")).toBe("ruvo:feed:area=Hill+Top");
    expect(buildFeedCacheKey("area=Hill+Top")).not.toBe(
      buildFeedCacheKey("area=Odenigbo"),
    );
  });
});

function makeListingStub(id: string) {
  return {
    id,
    publicId: id,
    slug: id,
    title: id,
    propertyType: "self_contain",
    priceNaira: 100_000,
    bedrooms: 1,
    bathrooms: 1,
    area: "Area",
    city: "City",
    state: "State",
    coverImageUrl: null,
    approvedAt: null,
    agent: { displayName: "Agent", isVerified: false },
  };
}

describe("shouldRestoreSnapshot", () => {
  it("returns false for a null snapshot", () => {
    expect(shouldRestoreSnapshot(null, 0)).toBe(false);
  });

  it("returns false when the snapshot has no more items than the server already sent", () => {
    const snapshot = {
      cursor: null,
      hasMore: false,
      items: [makeListingStub("a"), makeListingStub("b")],
      scrollY: 400,
    };

    // Equal length: nothing to restore.
    expect(shouldRestoreSnapshot(snapshot, 2)).toBe(false);

    // Fewer items than the server just sent: stale/shorter snapshot, not
    // worth restoring.
    expect(shouldRestoreSnapshot(snapshot, 5)).toBe(false);
  });

  it("returns true when the snapshot has strictly more items than the server just sent", () => {
    const snapshot = {
      cursor: "cursor-2",
      hasMore: true,
      items: [makeListingStub("a"), makeListingStub("b"), makeListingStub("c")],
      scrollY: 1200,
    };

    expect(shouldRestoreSnapshot(snapshot, 2)).toBe(true);
  });

  it("returns false for malformed snapshots regardless of item count", () => {
    expect(shouldRestoreSnapshot(undefined, 0)).toBe(false);
    expect(shouldRestoreSnapshot("not-an-object", 0)).toBe(false);
    expect(shouldRestoreSnapshot(42, 0)).toBe(false);
    expect(shouldRestoreSnapshot([], 0)).toBe(false);
    expect(shouldRestoreSnapshot({}, 0)).toBe(false);
    // items missing
    expect(
      shouldRestoreSnapshot({ cursor: null, hasMore: true, scrollY: 0 }, 0),
    ).toBe(false);
    // items not an array
    expect(
      shouldRestoreSnapshot(
        { cursor: null, hasMore: true, items: "oops", scrollY: 0 },
        0,
      ),
    ).toBe(false);
    // hasMore wrong type
    expect(
      shouldRestoreSnapshot(
        { cursor: null, hasMore: "yes", items: [makeListingStub("a")], scrollY: 0 },
        0,
      ),
    ).toBe(false);
    // scrollY wrong type
    expect(
      shouldRestoreSnapshot(
        {
          cursor: null,
          hasMore: true,
          items: [makeListingStub("a")],
          scrollY: "0",
        },
        0,
      ),
    ).toBe(false);
    // cursor wrong type
    expect(
      shouldRestoreSnapshot(
        {
          cursor: 123,
          hasMore: true,
          items: [makeListingStub("a")],
          scrollY: 0,
        },
        0,
      ),
    ).toBe(false);
  });
});
