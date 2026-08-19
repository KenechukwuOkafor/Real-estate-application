/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

import {
  buildListingHref,
  formatPriceNaira,
  formatPropertyType,
} from "@/features/listings/format";
import { RENT_PERIOD_LABEL } from "@/features/listings/rent-period";
import { SaveListingButton } from "@/features/listings/components/save-listing-button";
import type { ListingListItem } from "@/features/listings/types";

type ListingCardProps = {
  listing: ListingListItem;
};

export function ListingCard({ listing }: ListingCardProps) {
  return (
    <article className="group relative overflow-hidden rounded-[1.5rem] border border-stone-900/10 bg-white shadow-[0_18px_50px_rgba(48,38,24,0.08)] transition-transform duration-200 hover:-translate-y-1">
      <div className="relative aspect-[2/1] bg-stone-200 md:aspect-[4/3]">
        {listing.coverImageUrl ? (
          <img
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
            src={listing.coverImageUrl}
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-full items-center justify-center bg-[linear-gradient(135deg,_#d9d2c4,_#ece6d8)] text-sm uppercase tracking-[0.25em] text-stone-600"
          >
            Ruvo
          </div>
        )}

        <div className="absolute right-3 top-3">
          <SaveListingButton
            listingPublicId={listing.publicId}
            listingTitle={listing.title}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xl font-semibold tracking-tight text-stone-900">
            {formatPriceNaira(listing.priceNaira)}
          </p>
          <span className="text-xs text-stone-500">{RENT_PERIOD_LABEL}</span>
        </div>

        <p className="text-sm uppercase tracking-[0.18em] text-stone-500">
          {formatPropertyType(listing.propertyType)}
        </p>

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-stone-700">{listing.area}</span>

          {listing.agent.isVerified ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900">
              Verified
            </span>
          ) : null}
        </div>
      </div>

      {/*
        Stretched link rather than wrapping the whole card in an <a>: the save
        control sits inside the card and must not be swallowed by the link.
      */}
      <Link
        aria-label={listing.title}
        className="absolute inset-0 z-0"
        href={buildListingHref(listing.slug, listing.publicId)}
      />
    </article>
  );
}
