import type { Metadata } from "next";
import Link from "next/link";

import { ActiveListingFilters } from "@/features/listings/components/active-listing-filters";
import { ListingFilters } from "@/features/listings/components/listing-filters";
import { ListingGrid } from "@/features/listings/components/listing-grid";
import { parseListingListFilters } from "@/features/listings/parsers";
import { buildListingSearchQuery, toSearchParams } from "@/features/listings/search-params";
import { listPublicListings } from "@/server/services/public-listings-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Listings | Ruvo",
  description: "Browse verified property listings in Nsukka on Ruvo.",
};

type ListingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ListingsPage({
  searchParams,
}: ListingsPageProps) {
  const filters = parseListingListFilters(toSearchParams(await searchParams));
  const result = await listPublicListings(filters);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#f0eadf_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <section className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Public listings
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Verified rentals with clear pricing.
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-700">
            Browse approved listings in Nsukka. Slice 1 supports public search,
            structured listing detail, and share-ready URLs.
          </p>
        </section>

        <ActiveListingFilters
          filters={filters}
          listingCount={result.items.length}
        />

        <ListingFilters filters={filters} />

        <ListingGrid listings={result.items} />

        {result.nextCursor ? (
          <div className="flex justify-center">
            <Link
              className="rounded-full border border-stone-900/10 bg-white px-5 py-3 text-sm font-medium text-stone-800 shadow-[0_12px_30px_rgba(48,38,24,0.06)]"
              href={`/listings?${buildListingSearchQuery(filters, {
                cursor: result.nextCursor,
              })}`}
            >
              Load more listings
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}
