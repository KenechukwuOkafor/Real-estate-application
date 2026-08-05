"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { ListingGrid } from "@/features/listings/components/listing-grid";
import { useListingFeed } from "@/features/listings/hooks/use-listing-feed";
import type { ListingListItem } from "@/features/listings/types";

type ListingFeedProps = {
  hasActiveFilters: boolean;
  initialCursor: string | null;
  initialHasMore: boolean;
  initialItems: ListingListItem[];
  query: string;
};

export function ListingFeed({
  hasActiveFilters,
  initialCursor,
  initialHasMore,
  initialItems,
  query,
}: ListingFeedProps) {
  const { error, hasMore, isLoading, items, loadMore } = useListingFeed({
    initialCursor,
    initialHasMore,
    initialItems,
    query,
  });
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "400px" },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadMore]);

  if (items.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-stone-900/15 bg-white/70 p-8 text-center">
        {hasActiveFilters ? (
          <>
            <p className="text-base font-medium text-stone-900">
              No listings match these filters.
            </p>
            <p className="mt-2 text-sm text-stone-600">
              Try widening your budget or choosing another area.
            </p>
            <Link
              className="mt-5 inline-block rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white"
              href={pathname}
            >
              Clear filters
            </Link>
          </>
        ) : (
          <>
            <p className="text-base font-medium text-stone-900">
              No listings available yet.
            </p>
            <p className="mt-2 text-sm text-stone-600">
              New listings appear here once agents publish them.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ListingGrid listings={items} />

      <div ref={sentinelRef} />

      {isLoading ? (
        <p className="text-center text-sm text-stone-600">Loading more listings…</p>
      ) : null}

      {error ? (
        <div className="text-center">
          <p className="text-sm text-stone-700">{error}</p>
          <button
            className="mt-3 rounded-full border border-stone-900/15 bg-white px-4 py-2 text-sm font-medium text-stone-800"
            onClick={() => void loadMore()}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      {!hasMore && !isLoading ? (
        <div className="border-t border-stone-900/10 pt-6 text-center">
          <p className="text-sm text-stone-700">
            That is all {items.length}{" "}
            {items.length === 1 ? "listing" : "listings"}
            {hasActiveFilters ? " matching these filters" : " in Nsukka"}.
          </p>
          {hasActiveFilters ? (
            <Link
              className="mt-3 inline-block rounded-full border border-stone-900/15 bg-white px-4 py-2 text-sm font-medium text-stone-800"
              href={pathname}
            >
              Clear filters to see more
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
