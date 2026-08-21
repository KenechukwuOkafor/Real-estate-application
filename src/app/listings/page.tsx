import type { Metadata } from "next";

import { ActiveListingFilters } from "@/features/listings/components/active-listing-filters";
import { ListingFeed } from "@/features/listings/components/listing-feed";
import { ListingFilters } from "@/features/listings/components/listing-filters";
import { EMPTY_STATE_FALLBACK_LIMIT } from "@/features/listings/constants";
import { parseListingListFilters } from "@/features/listings/parsers";
import {
  buildListingSearchQuery,
  countActiveFilters,
  toSearchParams,
} from "@/features/listings/search-params";
import {
  listPublicListings,
  listRecentPublicListings,
} from "@/server/services/public-listings-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Listings | Ruvo",
  // "verified property listings" conflated the two things the product keeps
  // separate: an agent is verified, a listing is reviewed and approved. The
  // page body below already says it the accurate way.
  description:
    "Browse rental listings in Nsukka. Every listing is reviewed and approved before going live.",
};

type ListingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ListingsPage({
  searchParams,
}: ListingsPageProps) {
  const resolved = toSearchParams(await searchParams);
  const filters = parseListingListFilters(resolved);
  const result = await listPublicListings(filters);
  const activeFilterCount = countActiveFilters(resolved);
  const fallback =
    result.items.length === 0 && activeFilterCount > 0
      ? await listRecentPublicListings(EMPTY_STATE_FALLBACK_LIMIT)
      : null;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#f0eadf_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <section className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Nsukka · Enugu
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Verified rentals with clear pricing.
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-700">
            Every listing is reviewed and approved before going live.
            Filter by area, property type, bedrooms, and budget to find your next home.
          </p>
        </section>

        <ActiveListingFilters
          filters={filters}
          listingCount={result.items.length}
        />

        <ListingFilters filters={filters} />

        <ListingFeed
          fallbackListings={fallback?.items ?? []}
          hasActiveFilters={activeFilterCount > 0}
          initialCursor={result.nextCursor}
          initialHasMore={result.hasMore}
          initialItems={result.items}
          query={buildListingSearchQuery(filters)}
        />
      </div>
    </main>
  );
}
