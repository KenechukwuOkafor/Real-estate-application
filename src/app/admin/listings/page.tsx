import Image from "next/image";
import { redirect } from "next/navigation";

import {
  ListingModerationActions,
  type ModerationListingStatus,
} from "@/features/admin/components/listing-moderation-actions";
import { formatListingStatus, formatPriceNaira } from "@/features/listings/format";
import { listAdminModerationQueue } from "@/server/services/admin-service";
import { getSupabaseAdminClient } from "@/lib/db/supabase";
import { signListingImagePaths } from "@/server/services/listing-media-service";

export const dynamic = "force-dynamic";

const moderationSections = [
  {
    description: "New submissions waiting for an approval decision.",
    status: "pending_review",
    title: "Pending review",
  },
  {
    description: "Listings that need additional manual review before they can return live.",
    status: "flagged",
    title: "Flagged",
  },
  {
    description: "Listings hidden while ownership or trust concerns are resolved.",
    status: "under_dispute",
    title: "Under dispute",
  },
] as const;

export default async function AdminListingsPage() {
  const listings = await listAdminModerationQueue().catch(() => null);

  if (!listings) {
    redirect("/dashboard");
  }

  // Moderation reviews listings before they are approved, so these images are
  // exactly the ones the public storage policy withholds. Signed with the
  // service-role client because that is what admin-service already uses for
  // the queue itself; the admin storage policy would permit it either way.
  const signedImages = await signListingImagePaths(
    getSupabaseAdminClient(),
    listings.flatMap((listing) =>
      (listing.listing_images ?? []).map((image) => image.storage_path),
    ),
  );

  const listingsByStatus = Object.fromEntries(
    moderationSections.map((section) => [
      section.status,
      listings
        .filter((listing) => listing.status === section.status)
        .sort((a, b) => {
          const left = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
          const right = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
          return left - right;
        }),
    ]),
  ) as Record<(typeof moderationSections)[number]["status"], typeof listings>;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="rounded-[2rem] border border-stone-900/10 bg-white/85 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Admin moderation
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Pending review queue.
          </h1>
        </section>

        {listings.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-stone-900/15 bg-white/75 p-8 text-stone-600">
            No listings currently require moderation.
          </div>
        ) : null}

        {moderationSections.map((section) => {
          const sectionListings = listingsByStatus[section.status];

          return (
            <section key={section.status} className="flex flex-col gap-4">
              <div className="rounded-[1.75rem] border border-stone-900/10 bg-white/70 px-6 py-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
                    <p className="mt-1 text-sm text-stone-600">{section.description}</p>
                  </div>
                  <p className="rounded-full bg-stone-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                    {sectionListings.length} listing
                    {sectionListings.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              {sectionListings.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-stone-900/15 bg-white/70 p-6 text-sm text-stone-500">
                  Nothing in this queue right now.
                </div>
              ) : null}

              {sectionListings.map((listing) => {
                const activeImages = (listing.listing_images ?? [])
                  .filter((image) => !image.deleted_at)
                  .sort((left, right) => left.position - right.position);

                return (
                  <article
                    key={listing.id}
                    className="rounded-[1.75rem] border border-stone-900/10 bg-white/85 p-6 shadow-[0_16px_40px_rgba(48,38,24,0.06)]"
                  >
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-3xl">
                        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                          <span>{formatListingStatus(listing.status)}</span>
                          <span>{listing.property_type.replaceAll("_", " ")}</span>
                          <span>{listing.bedrooms} bed</span>
                          <span>{listing.bathrooms} bath</span>
                          <span>{activeImages.length} image{activeImages.length === 1 ? "" : "s"}</span>
                        </div>
                        <h3 className="mt-2 text-2xl font-semibold">{listing.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-stone-700">
                          {listing.description}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-600">
                          <span>
                            Agent: {listing.agent_profiles?.display_name ?? "Unknown"}
                          </span>
                          <span>Area: {listing.area}</span>
                          <span>
                            Location: {listing.city}, {listing.state}
                          </span>
                          <span>Price: {formatPriceNaira(listing.price_naira)}</span>
                          <span>
                            Submitted: {listing.submitted_at ?? "Not submitted"}
                          </span>
                        </div>
                        {listing.rejection_reason ? (
                          <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
                            Rejection reason: {listing.rejection_reason}
                          </p>
                        ) : null}
                        {listing.flag_reason ? (
                          <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            Flag reason: {listing.flag_reason}
                          </p>
                        ) : null}
                        {listing.dispute_reason ? (
                          <p className="mt-4 rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-800">
                            Dispute reason: {listing.dispute_reason}
                          </p>
                        ) : null}
                        {activeImages.length > 0 ? (
                          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {activeImages.slice(0, 6).map((image) => (
                              <Image
                                key={image.id}
                                alt={`${listing.title} preview`}
                                className="aspect-[4/3] rounded-2xl object-cover"
                                src={signedImages.get(image.storage_path) ?? ""}
                                width={640}
                                height={480}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="min-w-[320px] lg:max-w-sm">
                        <ListingModerationActions
                          listingId={listing.id}
                          listingStatus={listing.status as ModerationListingStatus}
                        />
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </main>
  );
}
