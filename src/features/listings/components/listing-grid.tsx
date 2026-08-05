import type { ListingListItem } from "@/features/listings/types";

import { ListingCard } from "@/features/listings/components/listing-card";

type ListingGridProps = {
  listings: ListingListItem[];
};

export function ListingGrid({ listings }: ListingGridProps) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
