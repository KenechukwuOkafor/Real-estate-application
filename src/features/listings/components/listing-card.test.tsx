import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// SaveListingButton (rendered inside ListingCard) calls next/navigation's
// useRouter and @clerk/nextjs's useAuth, both of which require app-level
// providers that don't exist under renderToStaticMarkup. Stub them so the
// card can render in isolation.
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: false }),
}));

import { ListingCard } from "@/features/listings/components/listing-card";
import type { ListingListItem } from "@/features/listings/types";

const base: ListingListItem = {
  agent: { displayName: "Prime Homes Nsukka", isVerified: true },
  approvedAt: "2026-03-29T19:09:33.831Z",
  area: "Hill Top",
  bathrooms: 1,
  bedrooms: 1,
  city: "Nsukka",
  coverImageUrl: "https://example.test/a.jpg",
  coverImageStoragePath: null,
  id: "listing-1",
  priceNaira: 180000,
  propertyType: "self_contain",
  publicId: "20887cbf-53fc-4c45-adb2-c5d4d33cf001",
  rentalDuration: "yearly",
  subletMonths: null,
  slug: "clean-self-contain",
  state: "Enugu",
  title: "Clean Self Contain",
};

describe("ListingCard", () => {
  it("shows the price and the rent period", () => {
    const html = renderToStaticMarkup(<ListingCard listing={base} />);

    expect(html).toContain("180,000");
    expect(html).toContain("per year");
  });

  /**
   * The three durations, rendered from the row.
   *
   * The previous version of this suite asserted "per year" against a hardcoded
   * constant, so it passed for every listing regardless of what the listing
   * actually was. These read the value off the item, which is the only way the
   * card can be wrong in a way a test can see.
   */
  describe("duration", () => {
    it("renders a yearly listing as a rate", () => {
      const html = renderToStaticMarkup(
        <ListingCard listing={{ ...base, rentalDuration: "yearly" }} />,
      );

      expect(html).toContain("per year");
      expect(html).not.toContain("per month");
      expect(html).not.toContain("Sublet");
    });

    it("renders a monthly listing as a rate", () => {
      const html = renderToStaticMarkup(
        <ListingCard listing={{ ...base, rentalDuration: "monthly" }} />,
      );

      expect(html).toContain("per month");
      expect(html).not.toContain("per year");
      expect(html).not.toContain("Sublet");
    });

    it("renders a sublet as its length in months", () => {
      const html = renderToStaticMarkup(
        <ListingCard
          listing={{ ...base, rentalDuration: "sublet", subletMonths: 4 }}
        />,
      );

      expect(html).toContain("4 months");
      expect(html).not.toContain("per year");
      expect(html).not.toContain("per month");
    });

    // A sublet is a different kind of offer from a tenancy, and a seeker should
    // not have to infer that from the price suffix.
    it("marks a sublet on the type line", () => {
      const html = renderToStaticMarkup(
        <ListingCard
          listing={{ ...base, rentalDuration: "sublet", subletMonths: 4 }}
        />,
      );

      expect(html).toContain("Sublet");
    });

    it("says month, singular, for a one month sublet", () => {
      const html = renderToStaticMarkup(
        <ListingCard
          listing={{ ...base, rentalDuration: "sublet", subletMonths: 1 }}
        />,
      );

      expect(html).toContain("1 month");
      expect(html).not.toContain("1 months");
    });
  });

  describe("the trust slot", () => {
    /**
     * The card carries no verification badge. It used to, and it rendered on
     * every card in the public feed, because verification gates both
     * submission and visibility — so it distinguished nothing between two
     * listings while occupying the card's one trust affordance. The claim
     * moved to PlatformTrustLine, which states it about the platform.
     */
    it("shows no verification badge when the agent is verified", () => {
      const html = renderToStaticMarkup(<ListingCard listing={base} />);

      expect(html).not.toContain("Verified");
    });

    it("shows no verification badge when the agent is unverified either", () => {
      const html = renderToStaticMarkup(
        <ListingCard listing={{ ...base, agent: { ...base.agent, isVerified: false } }} />,
      );

      expect(html).not.toContain("Verified");
      expect(html).not.toContain("Unverified");
      expect(html).not.toContain(">Agent<");
    });

    it("leaves the slot empty rather than backfilling it with tenure", () => {
      // verified_at is available and varies, and putting it here would spend
      // the slot on a signal about time rather than conduct. Reserved for
      // something that reflects how an agent has behaved.
      const html = renderToStaticMarkup(<ListingCard listing={base} />);

      expect(html.toLowerCase()).not.toContain("verified since");
      expect(html.toLowerCase()).not.toContain("member since");
    });
  });

  it("shows the property type and area", () => {
    const html = renderToStaticMarkup(<ListingCard listing={base} />);

    expect(html).toContain("Self Contain");
    expect(html).toContain("Hill Top");
  });

  it("links to the canonical listing url", () => {
    const html = renderToStaticMarkup(<ListingCard listing={base} />);

    expect(html).toContain(
      "/listings/clean-self-contain--20887cbf-53fc-4c45-adb2-c5d4d33cf001",
    );
  });

  it("lazy loads the cover image", () => {
    const html = renderToStaticMarkup(<ListingCard listing={base} />);

    expect(html).toContain('loading="lazy"');
  });
});
