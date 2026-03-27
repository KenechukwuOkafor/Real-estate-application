/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

import { buildListingHref, formatPriceNaira, formatPropertyType } from "@/features/listings/format";
import type { ListingListItem } from "@/features/listings/types";

type ListingCardProps = {
  listing: ListingListItem;
};

export function ListingCard({ listing }: ListingCardProps) {
  return (
    <Link
      className="group overflow-hidden rounded-[1.75rem] border border-stone-900/10 bg-white shadow-[0_18px_50px_rgba(48,38,24,0.08)] transition-transform duration-200 hover:-translate-y-1"
      href={buildListingHref(listing.slug, listing.publicId)}
    >
      <div className="aspect-[4/3] bg-stone-200">
        {listing.coverImageUrl ? (
          <img
            alt={listing.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            src={listing.coverImageUrl}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,_#d9d2c4,_#ece6d8)] text-sm uppercase tracking-[0.25em] text-stone-600">
            Ruvo
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-stone-500">
              {formatPropertyType(listing.propertyType)}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-900">
              {listing.title}
            </h2>
          </div>
          <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900">
            {listing.agent.isVerified ? "Verified" : "Agent"}
          </div>
        </div>

        <p className="text-2xl font-semibold text-stone-900">
          {formatPriceNaira(listing.priceNaira)}
        </p>

        <div className="flex flex-wrap gap-2 text-sm text-stone-700">
          <span>{listing.bedrooms} bed</span>
          <span>{listing.bathrooms} bath</span>
          <span>{listing.area}</span>
          <span>{listing.city}</span>
        </div>

        <p className="text-sm text-stone-500">{listing.agent.displayName}</p>
      </div>
    </Link>
  );
}
