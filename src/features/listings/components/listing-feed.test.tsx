/**
 * The empty state, which is the one screen a seeker can get stuck on.
 *
 * A one-tap reset is a way out only once the seeker chooses it; until then the
 * screen is blank. These assertions cover the offer that sits beside it, and
 * the two cases where there must be no offer — nothing published yet, and
 * nothing recent to show.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: false }),
}));

import { ListingFeed } from "@/features/listings/components/listing-feed";
import type { ListingListItem } from "@/features/listings/types";

function listing(overrides: Partial<ListingListItem> = {}): ListingListItem {
  return {
    agent: { displayName: "Prime Homes Nsukka", isVerified: true },
    approvedAt: "2026-08-01T10:00:00.000Z",
    area: "Hill Top",
    bathrooms: 1,
    bedrooms: 1,
    city: "Nsukka",
    coverImageStoragePath: null,
    coverImageUrl: null,
    id: "listing-1",
    priceNaira: 180000,
    propertyType: "self_contain",
    publicId: "20887cbf-53fc-4c45-adb2-c5d4d33cf001",
    rentalDuration: "yearly",
    slug: "clean-self-contain",
    state: "Enugu",
    subletMonths: null,
    title: "Clean Self Contain",
    ...overrides,
  };
}

function renderEmptyFeed(
  props: Partial<React.ComponentProps<typeof ListingFeed>> = {},
) {
  return renderToStaticMarkup(
    <ListingFeed
      hasActiveFilters
      initialCursor={null}
      initialHasMore={false}
      initialItems={[]}
      query=""
      {...props}
    />,
  );
}

describe("ListingFeed empty state", () => {
  it("offers recent listings when filters match nothing", () => {
    const html = renderEmptyFeed({
      fallbackListings: [
        listing({ id: "recent-1", title: "Lodge Room Close to UNN Gate" }),
      ],
    });

    expect(html).toContain("No listings match these filters.");
    expect(html).toContain("Recently added in Nsukka");
    expect(html).toContain("Lodge Room Close to UNN Gate");
  });

  it("keeps the one-tap reset beside the offer, not replaced by it", () => {
    const html = renderEmptyFeed({
      fallbackListings: [listing({ id: "recent-1" })],
    });

    expect(html).toContain("Clear filters");
  });

  it("shows no strip when there is nothing recent to offer", () => {
    const html = renderEmptyFeed({ fallbackListings: [] });

    expect(html).toContain("No listings match these filters.");
    expect(html).not.toContain("Recently added in Nsukka");
  });

  it("shows no strip when nothing is published at all", () => {
    // Not a dead end the seeker created, so there is nothing to offer as a way
    // out of it — and the same listings would be the ones already absent.
    const html = renderEmptyFeed({
      fallbackListings: [],
      hasActiveFilters: false,
    });

    expect(html).toContain("No listings available yet.");
    expect(html).not.toContain("Recently added in Nsukka");
    expect(html).not.toContain("Clear filters");
  });

  it("never claims proximity, which the data cannot support", () => {
    const html = renderEmptyFeed({
      fallbackListings: [listing({ id: "recent-1" })],
    });

    expect(html.toLowerCase()).not.toContain("nearby");
    expect(html.toLowerCase()).not.toContain("near you");
  });
});
