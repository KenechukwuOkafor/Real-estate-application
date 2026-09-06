import Link from "next/link";
import { redirect } from "next/navigation";

import { AgentListingsList } from "@/features/agents/components/agent-listings-list";
import { parseListingFilters } from "@/features/agents/listing-cards";
import { LISTING_GROUPS } from "@/features/agents/listing-groups";
import { getCurrentAgentListingCards } from "@/server/services/agent-service";

export const dynamic = "force-dynamic";

type AgentListingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AgentListingsPage({
  searchParams,
}: AgentListingsPageProps) {
  const overview = await getCurrentAgentListingCards().catch(() => null);

  if (!overview) {
    redirect("/dashboard");
  }

  const { cards, entitlement, windowDays } = overview;

  /*
    A query parameter rather than a hash fragment, and the difference matters.

    A hash never reaches the server, so a link to a listing the page filters out
    by default — a removed one, or one hidden behind an active filter — would
    land on a page that scrolls to nothing, with no way for the agent to tell
    that is what happened. The list forces the focused listing to be visible
    whatever the filters say.

    This is what the dashboard's per-listing table and activity feed point at.
    They previously linked to /agent/listings/[listingId], which has never
    existed: an agent clicking their own listing's title got a 404.
  */
  const resolved = await searchParams;
  const focusParam = resolved.focus;
  const focusId = (Array.isArray(focusParam) ? focusParam[0] : focusParam) ?? null;

  // Parsed here rather than in the client component so a shared or refreshed
  // URL paints the filtered list on the first render. See parseListingFilters.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined) params.set(key, single);
  }
  const initial = parseListingFilters(
    params,
    LISTING_GROUPS.map((group) => group.key),
  );

  return (
    <main className="px-5 py-8 text-stone-900 md:px-8 md:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
              Your listings
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              What each one is doing.
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
                {entitlement.activeSubscription.plan.charAt(0).toUpperCase() +
                  entitlement.activeSubscription.plan.slice(1)}{" "}
                plan active
              </span>
            ) : entitlement.freeListingQuota > 0 ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900">
                {entitlement.freeListingQuota} submission slot
                {entitlement.freeListingQuota === 1 ? "" : "s"} remaining
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
              "One slot is used each time you submit a listing for review. Marking a listing as taken costs nothing, in either direction."
            ) : (
              "You have no submission slots left. Drafts are still free and unlimited, and existing listings are not affected."
            )}
          </p>
        </section>

        {cards.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-stone-900/15 bg-white/75 p-8 text-stone-600">
            No listings yet. Create your first draft to begin.
          </div>
        ) : (
          <AgentListingsList
            cards={cards}
            entitlement={{
              freeListingQuota: entitlement.freeListingQuota,
              hasActiveSubscription: Boolean(entitlement.activeSubscription),
              verificationStatus: entitlement.verificationStatus,
            }}
            focusId={focusId}
            initial={initial}
            windowDays={windowDays}
          />
        )}
      </div>
    </main>
  );
}
