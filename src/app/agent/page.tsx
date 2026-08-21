import Link from "next/link";

import { agentStatusBand, type StatusTone } from "@/features/agents/status-band";
import { getCurrentAgentListingsOverview } from "@/server/services/agent-service";
import { getAgentPortalCounts } from "@/server/services/inspection-service";

export const dynamic = "force-dynamic";

const TONE_STYLES: Record<StatusTone, string> = {
  attention: "border-amber-300/70 bg-amber-50/80",
  blocked: "border-rose-300/70 bg-rose-50/80",
  good: "border-emerald-300/70 bg-emerald-50/80",
  neutral: "border-stone-900/10 bg-white/85",
};

const TONE_VALUE_STYLES: Record<StatusTone, string> = {
  attention: "text-amber-950",
  blocked: "text-rose-900",
  good: "text-emerald-900",
  neutral: "text-stone-900",
};

/**
 * Portal home.
 *
 * The status band sits above everything because the three facts on it —
 * verified, slots, requests — decide what an agent can actually do today.
 * The old version of this page opened with five identical cards linking to five
 * screens, which told an agent where things were but never what state they were
 * in; the commonest question here is "why can I not submit this", and that used
 * to be answerable only by trying.
 */
export default async function AgentHomePage() {
  const [overview, counts] = await Promise.all([
    getCurrentAgentListingsOverview(),
    getAgentPortalCounts(),
  ]);

  const band = agentStatusBand({
    activeSubscriptionPlan: overview.entitlement.activeSubscription?.plan ?? null,
    freeListingQuota: overview.entitlement.freeListingQuota,
    incomingRequests: counts.incomingRequests,
    listings: overview.listings,
    verificationStatus: overview.entitlement.verificationStatus,
  });

  const liveCount = overview.listings.filter(
    (listing) => listing.status === "approved",
  ).length;

  return (
    <main className="px-5 py-8 text-stone-900 md:px-8 md:py-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Your workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            {band.attention.length > 0 || counts.incomingRequests > 0
              ? "A few things need you."
              : liveCount > 0
                ? "Everything is running."
                : "Let's get your first listing up."}
          </h1>
        </header>

        {/*
          One column on a phone, three across on a desktop. The order is the
          order they matter in, and it is the same order in both — the mobile
          layout is not a reshuffle of the desktop one.
        */}
        <section aria-label="Status" className="grid gap-3 md:grid-cols-3">
          {band.facts.map((fact) => (
            <div
              className={`rounded-[1.5rem] border p-5 ${TONE_STYLES[fact.tone]}`}
              key={fact.label}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                {fact.label}
              </p>
              <p
                className={`mt-2 text-2xl font-semibold tracking-tight ${TONE_VALUE_STYLES[fact.tone]}`}
              >
                {fact.value}
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-700">{fact.detail}</p>
              {fact.href ? (
                <Link
                  className="mt-3 inline-block text-sm font-medium underline underline-offset-4"
                  href={fact.href}
                >
                  {fact.hrefLabel}
                </Link>
              ) : null}
            </div>
          ))}
        </section>

        {band.attention.length > 0 ? (
          <section
            aria-label="Needs attention"
            className="rounded-[1.75rem] border border-stone-900/10 bg-white/85 p-6"
          >
            <h2 className="text-lg font-semibold">Needs your attention</h2>
            <ul className="mt-4 flex flex-col gap-4">
              {band.attention.map((item) => (
                <li
                  className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4"
                  key={item.href}
                >
                  <p className="font-medium text-stone-900">{item.title}</p>
                  {/*
                    The reason inline, not a link to go and read it. A moderator
                    already wrote the sentence that says what to change; making
                    an agent navigate to find it is how a rejection turns into a
                    resubmission of the same listing unchanged.
                  */}
                  <p className="mt-1 text-sm leading-6 text-stone-700">
                    {item.detail}
                  </p>
                  <Link
                    className="mt-2 inline-block text-sm font-medium underline underline-offset-4"
                    href={item.href}
                  >
                    {item.hrefLabel}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section
          aria-label="Shortcuts"
          className="grid gap-3 sm:grid-cols-2"
        >
          <Link
            className="rounded-[1.5rem] border border-stone-900/10 bg-white/85 p-5 transition-transform hover:-translate-y-0.5"
            href="/agent/listings/new"
          >
            <h2 className="text-lg font-semibold">Start a new draft</h2>
            <p className="mt-1.5 text-sm leading-6 text-stone-700">
              Drafts are free and unlimited. Nothing is submitted until you say so.
            </p>
          </Link>
          <Link
            className="rounded-[1.5rem] border border-stone-900/10 bg-white/85 p-5 transition-transform hover:-translate-y-0.5"
            href="/agent/listings"
          >
            <h2 className="text-lg font-semibold">Your listings</h2>
            <p className="mt-1.5 text-sm leading-6 text-stone-700">
              {overview.listings.length === 0
                ? "Nothing here yet."
                : `${overview.listings.length} in total, ${liveCount} live.`}
            </p>
          </Link>
        </section>
      </div>
    </main>
  );
}
