/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

import {
  buildListingHref,
  formatPriceNaira,
  formatPropertyType,
} from "@/features/listings/format";
import {
  formatListingTypeLine,
  formatRentalDuration,
} from "@/features/listings/rental-duration";
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
          <span className="text-xs text-stone-500">
            {formatRentalDuration(listing.rentalDuration, listing.subletMonths)}
          </span>
        </div>

        <p className="text-sm uppercase tracking-[0.18em] text-stone-500">
          {formatListingTypeLine(
            formatPropertyType(listing.propertyType),
            listing.rentalDuration,
          )}
        </p>

        {/*
          The card's trust slot is deliberately empty.

          It held a "Verified" badge, which rendered on every card: the public
          feed only ever contains listings from verified agents, because
          verification gates both submission (canSubmitListing is
          `isVerified && hasQuota`) and visibility (the agent_profiles embed is
          inner, and only verified profiles are publicly readable). A signal
          that always fires carries no information, and a badge is read as a
          differentiator whether or not it is one.

          The claim now lives in PlatformTrustLine, where it is a true
          statement about Ruvo rather than a claim about this listing.

          Left empty rather than backfilled. Putting a weak signal here — agent
          tenure from verified_at, say — spends the slot just as surely as a
          constant one did. It is reserved for something that varies with an
          agent's conduct, such as whether they have completed an inspection
          before. That needs a SECURITY DEFINER aggregate in the shape of 0025:
          inspection_requests has no anon grants at all, so a signed-out seeker
          can currently read nothing about it.
        */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-stone-700">{listing.area}</span>
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
