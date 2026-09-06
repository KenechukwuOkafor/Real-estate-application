/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RequestInspectionForm } from "@/features/listings/components/request-inspection-form";
import { CopyUrlButton } from "@/features/listings/components/copy-url-button";
import { ListingViewTracker } from "@/features/listings/components/listings-view-tracker";
import { formatPriceNaira, formatPropertyType } from "@/features/listings/format";
import {
  formatListingTypeLine,
  formatRentalDuration,
  formatRentalPriceHeading,
} from "@/features/listings/rental-duration";
import { ListingGrid } from "@/features/listings/components/listing-grid";
import {
  getListingAbsence,
  getPublicListing,
  listRecentPublicListings,
} from "@/server/services/public-listings-service";

export const dynamic = "force-dynamic";

type ListingDetailPageProps = {
  params: Promise<{
    slugOrPublicId: string;
  }>;
};

export async function generateMetadata({
  params,
}: ListingDetailPageProps): Promise<Metadata> {
  const listing = await getPublicListing((await params).slugOrPublicId);

  if (!listing) {
    const absence = await getListingAbsence((await params).slugOrPublicId);

    // Named rather than left as the generic not-found title, because this is
    // the string a seeker sees in their tab and in a link preview when they
    // re-share the URL. `noindex` because there is nothing here to find: the
    // page exists to answer one person who already had the link.
    return absence
      ? {
          robots: { follow: true, index: false },
          title: `${absence.title} — no longer available | Ruvo`,
        }
      : { title: "Listing Not Found | Ruvo" };
  }

  return {
    // The duration belongs here as much as on the page. This string is the
    // link preview a seeker sees before they open anything, and a bare price on
    // a six-month sublet reads as a year's rent — the same misreading the
    // hardcoded label produced, in the one place a listing is seen out of
    // context.
    description: `${listing.area}, ${listing.city}. ${formatPriceNaira(
      listing.priceNaira,
    )} ${formatRentalDuration(listing.rentalDuration, listing.subletMonths)} on Ruvo.`,
    openGraph: {
      images: listing.images[0]?.url ? [listing.images[0].url] : [],
      title: listing.title,
      url: listing.share.canonicalUrl,
    },
    title: `${listing.title} | Ruvo`,
  };
}

export default async function ListingDetailPage({
  params,
}: ListingDetailPageProps) {
  const identifier = (await params).slugOrPublicId;
  const listing = await getPublicListing(identifier);

  if (!listing) {
    // Only now, on the path that already came back empty. See getListingAbsence.
    const absence = await getListingAbsence(identifier);

    if (absence) {
      const alternatives = await listRecentPublicListings(3);
      return (
        <ListingAbsence absence={absence} alternatives={alternatives.items} />
      );
    }

    notFound();
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)] px-6 py-10 text-stone-900">
      <ListingViewTracker publicId={listing.publicId} />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <div className="flex items-center justify-between gap-4">
          <Link className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors" href="/listings">
            ← Back to listings
          </Link>
          <CopyUrlButton url={listing.share.canonicalUrl} />
        </div>

        <section className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-stone-500">
                  {formatListingTypeLine(
                    formatPropertyType(listing.propertyType),
                    listing.rentalDuration,
                  )}
                </p>
                <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
                  {listing.title}
                </h1>
                <p className="mt-3 text-lg text-stone-600">
                  {listing.area}, {listing.city}, {listing.state}
                </p>
              </div>

              <div className="rounded-[1.5rem] bg-emerald-50 px-5 py-4 text-right">
                <p className="text-sm uppercase tracking-[0.2em] text-emerald-900/70">
                  {formatRentalPriceHeading(listing.rentalDuration)}
                </p>
                <p className="mt-2 text-3xl font-semibold text-emerald-950">
                  {formatPriceNaira(listing.priceNaira)}
                </p>
                <p className="mt-1 text-sm text-emerald-900/70">
                  {formatRentalDuration(listing.rentalDuration, listing.subletMonths)}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-3xl bg-stone-50 p-4">
                <p className="text-sm text-stone-500">Bedrooms</p>
                <p className="mt-2 text-2xl font-semibold">{listing.bedrooms}</p>
              </div>
              <div className="rounded-3xl bg-stone-50 p-4">
                <p className="text-sm text-stone-500">Bathrooms</p>
                <p className="mt-2 text-2xl font-semibold">{listing.bathrooms}</p>
              </div>
              <div className="rounded-3xl bg-stone-50 p-4">
                <p className="text-sm text-stone-500">Agent</p>
                <p className="mt-2 text-2xl font-semibold">
                  {listing.agent.displayName}
                </p>
              </div>
              <div className="rounded-3xl bg-stone-50 p-4">
                <p className="text-sm text-stone-500">Trust</p>
                <p className="mt-2 text-xl font-semibold">
                  {listing.agent.isVerified ? (
                    <span className="text-emerald-800">Verified ✓</span>
                  ) : (
                    <span className="text-stone-600">Unverified</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="grid gap-4 md:grid-cols-2">
            {listing.images.map((image) => (
              <div
                key={image.id}
                className="overflow-hidden rounded-[1.5rem] border border-stone-900/10 bg-white shadow-[0_16px_40px_rgba(48,38,24,0.06)]"
              >
                <img
                  alt={listing.title}
                  className="h-full w-full object-cover"
                  src={image.url ?? undefined}
                />
              </div>
            ))}
          </div>

          <aside className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
            <h2 className="text-2xl font-semibold">Listing details</h2>
            <p className="mt-4 leading-8 text-stone-700">
              {listing.description}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {listing.amenities.map((amenity) => (
                <span
                  key={amenity}
                  className="rounded-full bg-stone-100 px-3 py-2 text-sm text-stone-700"
                >
                  {amenity.replaceAll("_", " ")}
                </span>
              ))}
            </div>

            <RequestInspectionForm listingId={listing.id} />
          </aside>
        </section>
      </div>
    </main>
  );
}

/**
 * A listing that is gone, said out loud.
 *
 * WHAT THIS REPLACES: notFound(). A seeker who saved a listing, or was sent
 * the link by a friend, got the same blank 404 as somebody who mistyped a URL.
 * The system knew the answer and showed nothing — the same failure as a
 * silently-expired inspection request, and answered the same way.
 *
 * THE TWO REASONS ARE NOT MERGED, because they are different news. A taken
 * property may free up — student lets turn over annually — so it is worth
 * asking the agent about, and the copy says so. A removed one is not coming
 * back and pretending otherwise wastes the seeker's message.
 *
 * NO PRICE, NO DESCRIPTION, NO PHOTOGRAPHS, and that is a deliberate limit
 * rather than an oversight. listing_absence_notice returns four columns; the
 * storage policy still grants image reads on approved listings only, so there
 * is nothing to sign here and the page does not ask. An archived listing may
 * have been removed BECAUSE its price or its photographs were wrong, and a
 * tombstone is the last place to keep serving them.
 */
function ListingAbsence({
  absence,
  alternatives,
}: {
  absence: { area: string; city: string; reason: "taken" | "removed"; title: string };
  alternatives: Awaited<ReturnType<typeof listRecentPublicListings>>["items"];
}) {
  const taken = absence.reason === "taken";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <Link
          className="text-sm font-medium text-stone-600 transition-colors hover:text-stone-900"
          href="/listings"
        >
          ← Back to listings
        </Link>

        <section className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
          <p className="text-sm uppercase tracking-[0.22em] text-stone-500">
            {taken ? "No longer available" : "No longer listed"}
          </p>
          {/*
            The title, so the seeker can be certain this is the place they
            saved rather than wondering whether the link was wrong after all.
            Identifying it is the entire job of the four columns we return.
          */}
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            {absence.title}
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            {absence.area}, {absence.city}
          </p>

          <p className="mt-6 max-w-2xl text-base leading-8 text-stone-700">
            {taken
              ? "This place has been taken, so it is not accepting inspection requests at the moment. Student lets usually come free again at the end of the year, so it may reappear here."
              : "This listing has been removed by the agent and is not coming back. The property may be listed again later under a new listing."}
          </p>
        </section>

        {alternatives.length > 0 ? (
          <section className="flex flex-col gap-4">
            {/*
              Recent, not "similar". `area` is free text with no notion of
              adjacency, so nearby listings would be invented rather than
              computed — the same limit the empty search state records.
            */}
            <h2 className="text-xl font-semibold tracking-tight">
              Recently added
            </h2>
            <ListingGrid listings={alternatives} />
          </section>
        ) : null}
      </div>
    </main>
  );
}
