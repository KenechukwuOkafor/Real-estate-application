import type { ListingListItem } from "@/features/listings/types";

import { ListingCard } from "@/features/listings/components/listing-card";

type ListingGridProps = {
  listings: ListingListItem[];
};

export function ListingGrid({ listings }: ListingGridProps) {
  if (listings.length === 0) {
    return (
      <div className="rounded-[2rem] border border-dashed border-stone-900/15 bg-white/70 p-10 text-center text-stone-600">
        No approved listings matched the current filters.
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
