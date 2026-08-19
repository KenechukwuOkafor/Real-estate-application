import type { Metadata } from "next";

import { ListingFeed } from "@/features/listings/components/listing-feed";
import { ListingSearchBar } from "@/features/listings/components/listing-search-bar";
import { PropertyTypeTiles } from "@/features/listings/components/property-type-tiles";
import { parseListingListFilters } from "@/features/listings/parsers";
import {
  buildListingSearchQuery,
  countActiveFilters,
  toSearchParams,
} from "@/features/listings/search-params";
import { deriveAreaSuggestions } from "@/features/listings/suggestions";
import { getAuthContext } from "@/lib/auth/clerk";
import { listPublicListings } from "@/server/services/public-listings-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ruvo — Verified rentals in Nsukka",
  description:
    "Browse rentals in Nsukka. Every listing is reviewed before publishing.",
};

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolved = toSearchParams(await searchParams);
  const filters = parseListingListFilters(resolved);
  const [result, authState] = await Promise.all([
    listPublicListings(filters),
    getAuthContext(),
  ]);

  const isSignedIn = Boolean(authState.userId);
  const activeFilterCount = countActiveFilters(resolved);
  const query = buildListingSearchQuery(filters);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#f0eadf_100%)] text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-2 md:gap-7 md:py-8">
        {!isSignedIn ? (
          <section className="text-center md:pt-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              Live in Nsukka, Enugu
            </span>

            <h1 className="mt-2 text-2xl font-semibold tracking-tight md:mt-3 md:text-4xl">
              Verified rentals. No surprises.
            </h1>

            <p className="mx-auto mt-1.5 max-w-xl text-sm leading-5 text-stone-600 md:mt-2 md:leading-6 md:text-base">
              Every listing is reviewed before publishing, priced upfront, and open
              for an inspection request in-app.
            </p>
          </section>
        ) : null}

        <ListingSearchBar
          activeFilterCount={activeFilterCount}
          areas={deriveAreaSuggestions(result.items)}
        />

        <PropertyTypeTiles />

        <ListingFeed
          hasActiveFilters={activeFilterCount > 0}
          initialCursor={result.nextCursor}
          initialHasMore={result.hasMore}
          initialItems={result.items}
          query={query}
        />

        {!isSignedIn ? (
          <section className="mt-4 grid gap-4 border-t border-stone-900/10 pt-8 md:grid-cols-3">
            <div>
              <h2 className="text-base font-semibold">Agents are reviewed before they can list</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                An administrator reviews every agent before their listings can go
                live, so one bad actor cannot flood the feed.
              </p>
            </div>
            <div>
              <h2 className="text-base font-semibold">Price upfront, always</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Rent is shown on every card and detail page. No asking for price,
                no post-viewing surprises.
              </p>
            </div>
            <div>
              <h2 className="text-base font-semibold">Request an inspection in-app</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Send an inspection request from any listing. The agent accepts or
                declines in-app, and a chat opens for that listing.
              </p>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
