import Link from "next/link";
import { notFound } from "next/navigation";

import { ListingForm } from "@/features/agents/components/listing-form";
import { ListingImageManager } from "@/features/agents/components/listing-image-manager";
import { ProposeListingChangeForm } from "@/features/agents/components/propose-listing-change-form";
import { ListingImagesForm } from "@/features/agents/components/listing-images-form";
import { isListingEditable } from "@/features/listings/editability";
import { formatListingStatus } from "@/features/listings/format";
import { isUuid } from "@/lib/api/identifiers";
import { getSupabaseAdminClient } from "@/lib/db/supabase";
import {
  getCurrentAgentListingForEdit,
  getCurrentAgentPendingRevision,
} from "@/server/services/agent-service";
import { signListingImagePaths } from "@/server/services/listing-media-service";

export const dynamic = "force-dynamic";

type EditListingPageProps = {
  params: Promise<{ listingId: string }>;
};

export default async function EditListingPage({ params }: EditListingPageProps) {
  const { listingId } = await params;

  // Checked before the query rather than after. A non-UUID would otherwise
  // reach Postgres and come back as a 500 for what is plainly a bad URL.
  if (!isUuid(listingId)) {
    notFound();
  }

  const listing = await getCurrentAgentListingForEdit(listingId).catch(() => null);

  // Not found and not yours are the same answer, deliberately. The lookup is
  // already scoped to the caller's own listings, so this leaks nothing about
  // whether the id exists.
  if (!listing) {
    notFound();
  }

  const editable = isListingEditable(listing.status);

  // A live listing is not edited in place — it is changed by proposal. See
  // migration 0023: the listing keeps the values a moderator approved until a
  // moderator approves the new ones.
  const isLive = listing.status === "approved";
  const pendingRevision = isLive
    ? await getCurrentAgentPendingRevision(listing.id).catch(() => null)
    : null;
  const images = (listing.listing_images ?? [])
    .filter((image) => !image.deleted_at)
    .sort((left, right) => left.position - right.position);

  // Signed at render time, never stored. The bucket is private, so a URL is a
  // short-lived capability rather than an address — see ADR-033.
  const signedImages = await signListingImagePaths(
    getSupabaseAdminClient(),
    images.map((image) => image.storage_path),
  );

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <section className="rounded-[2rem] border border-stone-900/10 bg-white/85 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
                {formatListingStatus(listing.status)}
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                {listing.title}
              </h1>
            </div>
            <Link
              className="rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700"
              href="/agent/listings"
            >
              Back to listings
            </Link>
          </div>
        </section>

        {/*
          The rejection reason, next to the thing being fixed.
          It was stored and shown only to admins, so an agent was told to change
          something and not told what. This is the single most useful sentence
          on this page and it belongs above the fields, not beside the status.
        */}
        {listing.status === "rejected" && listing.rejection_reason ? (
          <section className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-900">
              Why this was rejected
            </h2>
            <p className="mt-3 text-base leading-7 text-rose-900">
              {listing.rejection_reason}
            </p>
            <p className="mt-3 text-sm text-rose-800/80">
              Make the changes below, then submit it for review again.
            </p>
          </section>
        ) : null}

        {/*
          A rejection with no reason recorded. Saying so is better than an empty
          panel or no panel at all: the agent knows the rejection is real and
          that the explanation is missing, rather than wondering whether they
          missed it.
        */}
        {listing.status === "rejected" && !listing.rejection_reason ? (
          <section className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-900">
              Why this was rejected
            </h2>
            <p className="mt-3 text-base leading-7 text-rose-900">
              No reason was recorded. Contact support before resubmitting.
            </p>
          </section>
        ) : null}

        {editable ? (
          <>
            <section className="rounded-[1.75rem] border border-stone-900/10 bg-white/85 p-6">
              <h2 className="text-xl font-semibold">Listing details</h2>
              <p className="mt-1 text-sm text-stone-600">
                Changes are saved to your draft. They do not go live until the
                listing is submitted and approved.
              </p>
              <div className="mt-6">
                <ListingForm
                  listing={{
                    amenities: (listing.amenities as string[]) ?? [],
                    area: listing.area,
                    bathrooms: listing.bathrooms,
                    bedrooms: listing.bedrooms,
                    city: listing.city,
                    description: listing.description,
                    id: listing.id,
                    latitude: listing.latitude,
                    longitude: listing.longitude,
                    priceNaira: listing.price_naira,
                    propertyType: listing.property_type,
                    rentalDuration: listing.rental_duration,
                    state: listing.state,
                    subletMonths: listing.sublet_months,
                    title: listing.title,
                  }}
                />
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-stone-900/10 bg-white/85 p-6">
              <h2 className="text-xl font-semibold">Photos</h2>
              <p className="mt-1 text-sm text-stone-600">
                {images.length} image{images.length === 1 ? "" : "s"} on this
                listing. A listing needs at least three before it can be
                submitted.
              </p>
              <div className="mt-6 flex flex-col gap-6">
                <ListingImageManager
                  images={images.map((image) => ({
                    id: image.id,
                    isCover: image.id === listing.cover_image_id,
                    position: image.position,
                    url: signedImages.get(image.storage_path) ?? null,
                  }))}
                  listingId={listing.id}
                />
                <ListingImagesForm listingId={listing.id} />
              </div>
            </section>
          </>
        ) : isLive ? (
          <section className="rounded-[1.75rem] border border-stone-900/10 bg-white/85 p-6">
            <h2 className="text-xl font-semibold">Change this listing</h2>
            <p className="mt-1 text-sm text-stone-600">
              This listing is live. Changes go to a moderator before seekers see
              them.
            </p>
            <div className="mt-6">
              <ProposeListingChangeForm
                hasPendingRevision={Boolean(pendingRevision)}
                listing={{
                  amenities: (listing.amenities as string[]) ?? [],
                  description: listing.description,
                  id: listing.id,
                  priceNaira: listing.price_naira,
                  rentalDuration: listing.rental_duration,
                  subletMonths: listing.sublet_months,
                  title: listing.title,
                }}
              />
            </div>
          </section>
        ) : (
          /*
            The page still renders for a listing that cannot be edited, rather
            than 404ing. An agent following a link from their own list deserves
            to be told why the listing is locked, not shown a dead end.
          */
          <section className="rounded-[1.75rem] border border-stone-900/10 bg-white/85 p-6">
            <h2 className="text-xl font-semibold">This listing cannot be edited</h2>
            <p className="mt-3 text-sm leading-7 text-stone-700">
              Only drafts and rejected listings can be changed directly. This one
              is {formatListingStatus(listing.status).toLowerCase()}.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
