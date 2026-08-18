/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RequestInspectionForm } from "@/features/listings/components/request-inspection-form";
import { CopyUrlButton } from "@/features/listings/components/copy-url-button";
import { ListingViewTracker } from "@/features/listings/components/listings-view-tracker";
import { formatPriceNaira, formatPropertyType } from "@/features/listings/format";
import { getPublicListing } from "@/server/services/public-listings-service";

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
    return {
      title: "Listing Not Found | Ruvo",
    };
  }

  return {
    description: `${listing.area}, ${listing.city}. ${formatPriceNaira(listing.priceNaira)} on Ruvo.`,
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
  const listing = await getPublicListing((await params).slugOrPublicId);

  if (!listing) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)] px-6 py-10 text-stone-900">
      <ListingViewTracker listingId={listing.id} />

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
                  {formatPropertyType(listing.propertyType)}
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
                  Annual price
                </p>
                <p className="mt-2 text-3xl font-semibold text-emerald-950">
                  {formatPriceNaira(listing.priceNaira)}
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
