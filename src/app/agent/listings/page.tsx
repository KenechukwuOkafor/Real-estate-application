import Link from "next/link";
import { redirect } from "next/navigation";

import { ListingImagesForm } from "@/features/agents/components/listing-images-form";
import { SubmitListingReviewButton } from "@/features/agents/components/submit-listing-review-button";
import { formatListingStatus, formatPriceNaira } from "@/features/listings/format";
import { getCurrentAgentListingsOverview } from "@/server/services/agent-service";

export const dynamic = "force-dynamic";

export default async function AgentListingsPage() {
  const overview = await getCurrentAgentListingsOverview().catch(() => null);

  if (!overview) {
    redirect("/dashboard");
  }

  const { entitlement, listings } = overview;

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

        <section className="rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-6">
          <div className="flex flex-wrap items-center gap-3">
            {!entitlement.isVerified ? (
              <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">
                Not yet verified
              </span>
            ) : entitlement.activeSubscription ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900">
                {entitlement.activeSubscription.plan.charAt(0).toUpperCase() + entitlement.activeSubscription.plan.slice(1)} plan active
              </span>
            ) : entitlement.freeListingQuota > 0 ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900">
                {entitlement.freeListingQuota} submission slot{entitlement.freeListingQuota === 1 ? "" : "s"} remaining
              </span>
            ) : (
              <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800">
                No submission slots
              </span>
            )}
          </div>
          <p className="mt-3 text-sm leading-7 text-stone-700">
            {!entitlement.isVerified ? (
              <>
                Drafts are free and unlimited. To submit one for review you need
                identity verification —{" "}
                <Link className="font-medium underline" href="/agent/verification">
                  start verification
                </Link>
                .
              </>
            ) : entitlement.activeSubscription ? (
              "Your subscription covers listing submissions. Drafts are always free."
            ) : entitlement.freeListingQuota > 0 ? (
              "One slot is used each time you submit a listing for review. Drafts are always free."
            ) : (
              "You have no submission slots left. Drafts are still free and unlimited, and existing listings are not affected."
            )}
          </p>
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
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                      {formatListingStatus(listing.status)}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold">{listing.title}</h2>
                    <p className="mt-2 text-sm leading-7 text-stone-700 line-clamp-3">
                      {listing.description}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600">
                      <span>{listing.area}, {listing.city}</span>
                      <span className="font-medium text-stone-900">{formatPriceNaira(listing.price_naira)}</span>
                      <span>{imageCount} image{imageCount === 1 ? "" : "s"}</span>
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
