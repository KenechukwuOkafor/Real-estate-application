import Link from "next/link";
import { redirect } from "next/navigation";

import { ArchiveListingButton } from "@/features/agents/components/archive-listing-button";
import { SubmitReadinessChecklist } from "@/features/agents/components/submit-readiness-checklist";
import { submitReadiness } from "@/features/agents/submit-readiness";
import { ListingImagesForm } from "@/features/agents/components/listing-images-form";
import { SubmitListingReviewButton } from "@/features/agents/components/submit-listing-review-button";
import { groupAgentListings } from "@/features/agents/listing-groups";
import { isListingEditable } from "@/features/listings/editability";
import { formatListingStatus, formatPriceNaira } from "@/features/listings/format";
import { getCurrentAgentListingsOverview } from "@/server/services/agent-service";

export const dynamic = "force-dynamic";

export default async function AgentListingsPage() {
  const overview = await getCurrentAgentListingsOverview().catch(() => null);

  if (!overview) {
    redirect("/dashboard");
  }

  const { entitlement, listings } = overview;

  const groups = groupAgentListings(listings);

  return (
    <main className="px-5 py-8 text-stone-900 md:px-8 md:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
              Your listings
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Grouped by what needs doing.
            </h1>
          </div>
          <Link
            className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white"
            href="/agent/listings/new"
          >
            New draft
          </Link>
        </header>

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

        {listings.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-stone-900/15 bg-white/75 p-8 text-stone-600">
            No listings yet. Create your first draft to begin.
          </div>
        ) : null}

        {groups.map((group) => (
        <section className="grid gap-4" key={group.key}>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {group.title}
              {group.listings.length > 0 ? (
                <span className="ml-2 text-base font-medium text-stone-500">
                  {group.listings.length}
                </span>
              ) : null}
            </h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">{group.subtitle}</p>
          </div>

          {group.listings.length === 0 ? (
            <p className="rounded-[1.5rem] border border-dashed border-stone-900/15 bg-white/60 p-5 text-sm text-stone-600">
              {group.emptyDetail}
            </p>
          ) : null}

          {group.listings.map((listing) => {
            const imageCount = (listing.listing_images ?? []).filter((image) => !image.deleted_at).length;

            // Only meaningful where submission is the next step. An approved or
            // archived listing has nothing outstanding.
            const readiness =
              listing.status === "draft" || listing.status === "rejected"
                ? submitReadiness({
                    activeImageCount: imageCount,
                    area: listing.area,
                    freeListingQuota: entitlement.freeListingQuota,
                    hasActiveSubscription: Boolean(entitlement.activeSubscription),
                    priceNaira: listing.price_naira,
                    verificationStatus: entitlement.verificationStatus,
                  })
                : null;

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
                    {/*
                      A one-line trail of the rejection reason. The full text
                      lives on the edit page next to the fields being fixed;
                      this is here so an agent scanning the list can see which
                      listing needs attention and why.
                    */}
                    {/*
                      An archived listing is over. Saying so on the row stops an
                      agent waiting for it to come back, and stops them looking
                      for the action that would bring it back.
                    */}
                    {listing.status === "archived" ? (
                      <p className="mt-3 rounded-2xl bg-stone-100 px-4 py-3 text-sm leading-6 text-stone-700">
                        Taken down. This listing is no longer visible to seekers
                        and cannot be restored — list the property again to bring
                        it back.
                      </p>
                    ) : null}

                    {listing.status === "rejected" && listing.rejection_reason ? (
                      <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
                        Rejected: {listing.rejection_reason}
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600">
                      <span>{listing.area}, {listing.city}</span>
                      <span className="font-medium text-stone-900">{formatPriceNaira(listing.price_naira)}</span>
                      <span>{imageCount} image{imageCount === 1 ? "" : "s"}</span>
                    </div>
                  </div>

                  <div className="flex min-w-[300px] flex-col gap-4">
                    {/*
                      Only offered where the write path will accept it. The link
                      and the guard read the same predicate, so this cannot
                      advertise an edit the server refuses.
                    */}
                    {/*
                      A live listing gets the same link, to a different action:
                      changes are proposed rather than applied. Offering it here
                      is what makes edit-with-re-review discoverable at all.
                    */}
                    {listing.status === "approved" ? (
                      <Link
                        className="rounded-full border border-stone-900/15 bg-white px-5 py-3 text-center text-sm font-medium text-stone-900 transition-colors hover:bg-stone-50"
                        href={`/agent/listings/${listing.id}/edit`}
                      >
                        Change details
                      </Link>
                    ) : null}
                    {isListingEditable(listing.status) ? (
                      <Link
                        className="rounded-full border border-stone-900/15 bg-white px-5 py-3 text-center text-sm font-medium text-stone-900 transition-colors hover:bg-stone-50"
                        href={`/agent/listings/${listing.id}/edit`}
                      >
                        {listing.status === "rejected"
                          ? "Fix and edit"
                          : "Edit listing"}
                      </Link>
                    ) : null}
                    <ListingImagesForm listingId={listing.id} />
                    {readiness ? (
                      <SubmitReadinessChecklist items={readiness} />
                    ) : null}
                    <SubmitListingReviewButton listingId={listing.id} />
                    {/*
                      Only on a live listing. It is the only status this can act
                      on, and offering it anywhere else would advertise a
                      transition the function refuses.
                    */}
                    {listing.status === "approved" ? (
                      <ArchiveListingButton
                        listingId={listing.id}
                        listingTitle={listing.title}
                      />
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
        ))}
      </div>
    </main>
  );
}
