import Link from "next/link";
import { redirect } from "next/navigation";

import { ListingImagesForm } from "@/features/agents/components/listing-images-form";
import { SubmitListingReviewButton } from "@/features/agents/components/submit-listing-review-button";
import { listCurrentAgentListings } from "@/server/services/agent-service";

export const dynamic = "force-dynamic";

export default async function AgentListingsPage() {
  const listings = await listCurrentAgentListings().catch(() => null);

  if (!listings) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="rounded-[2rem] border border-stone-900/10 bg-white/85 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
                Agent listings
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">
                Manage drafts and submissions.
              </h1>
            </div>
            <Link
              className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white"
              href="/agent/listings/new"
            >
              New draft
            </Link>
          </div>
        </section>

        <section className="grid gap-5">
          {listings.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-stone-900/15 bg-white/75 p-8 text-stone-600">
              No listings yet. Create your first draft to begin.
            </div>
          ) : null}

          {listings.map((listing) => {
            const imageCount = (listing.listing_images ?? []).filter((image) => !image.deleted_at).length;

            return (
              <article
                key={listing.id}
                className="rounded-[1.75rem] border border-stone-900/10 bg-white/85 p-6 shadow-[0_16px_40px_rgba(48,38,24,0.06)]"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
                      {listing.status}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold">{listing.title}</h2>
                    <p className="mt-2 text-sm leading-7 text-stone-700">
                      {listing.description}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-sm text-stone-600">
                      <span>{listing.area}</span>
                      <span>{listing.city}</span>
                      <span>{listing.price_naira} NGN</span>
                      <span>{imageCount} images</span>
                    </div>
                  </div>

                  <div className="flex min-w-[300px] flex-col gap-4">
                    <ListingImagesForm listingId={listing.id} />
                    <SubmitListingReviewButton listingId={listing.id} />
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
