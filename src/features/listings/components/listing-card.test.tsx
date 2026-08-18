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

  it("shows the verified badge when the agent is verified", () => {
    const html = renderToStaticMarkup(<ListingCard listing={base} />);

    expect(html).toContain("Verified");
  });

  it("renders no badge at all when the agent is unverified", () => {
    const html = renderToStaticMarkup(
      <ListingCard listing={{ ...base, agent: { ...base.agent, isVerified: false } }} />,
    );

    expect(html).not.toContain("Verified");
    expect(html).not.toContain("Unverified");
    expect(html).not.toContain(">Agent<");
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
