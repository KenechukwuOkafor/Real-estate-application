import Link from "next/link";

import { DashboardChart } from "@/features/agents/components/dashboard-chart";
import { DashboardKpis } from "@/features/agents/components/dashboard-kpis";
import { DashboardListingsTable } from "@/features/agents/components/dashboard-listings-table";
import {
  DEFAULT_RANGE,
  RANGE_OPTIONS,
  type RangeDays,
} from "@/features/agents/dashboard/metrics";
import { formatTimeRemaining } from "@/features/inspections/expiry";
import { getAgentDashboard } from "@/server/services/agent-dashboard-service";

export const dynamic = "force-dynamic";

function parseRange(value: string | undefined): RangeDays {
  const parsed = Number(value);
  return RANGE_OPTIONS.includes(parsed as RangeDays)
    ? (parsed as RangeDays)
    : DEFAULT_RANGE;
}

const ACTION_TONE: Record<string, string> = {
  completion: "border-amber-200 bg-amber-50/70",
  rejection: "border-rose-200 bg-rose-50/60",
  request: "border-emerald-200 bg-emerald-50/60",
  revision: "border-rose-200 bg-rose-50/60",
  slots: "border-stone-200 bg-stone-50",
};

/**
 * Portal home: an agent's answer to "am I getting leads, and am I converting
 * them".
 *
 * ACTIONS ABOVE NUMBERS, on both breakpoints and in that order. An agent's
 * currency is inspection requests, and a request with two hours left on it
 * matters more than any KPI on the page. The previous version led with a
 * three-card status band, which said what state things were in but never what
 * to do about it.
 *
 * The mobile layout is the same content in the same order, not a reshuffle.
 */
export default async function AgentHomePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rangeParam } = await searchParams;
  const dashboard = await getAgentDashboard(parseRange(rangeParam));

  if (!dashboard) {
    return (
      <main className="px-5 py-8 md:px-8 md:py-10">
        <div className="mx-auto w-full max-w-4xl">
          <h1 className="text-2xl font-semibold">Create your agent profile</h1>
          <Link className="mt-3 inline-block underline underline-offset-4" href="/agent/profile">
            Set up your profile
          </Link>
        </div>
      </main>
    );
  }

  if (dashboard.state === "first_run") {
    return <FirstRun verificationStatus={dashboard.entitlement.verificationStatus} />;
  }

  const rangeLabel = `${dashboard.range} days`;

  return (
    <main className="px-5 py-8 text-stone-900 md:px-8 md:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Your workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            {dashboard.actions.length > 0
              ? "A few things need you."
              : dashboard.state === "dormant"
                ? "Nothing of yours is live."
                : "Everything is running."}
          </h1>
        </header>

        {dashboard.actions.length > 0 ? (
          <section aria-label="Needs you now" className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Needs you now</h2>
            <ul className="flex flex-col gap-3">
              {dashboard.actions.map((action) => (
                <li
                  className={`rounded-2xl border p-4 ${ACTION_TONE[action.kind] ?? "border-stone-200 bg-white"}`}
                  key={`${action.kind}-${action.href ?? "none"}-${action.title}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">{action.title}</p>
                    {action.minutesLeft !== null ? (
                      <span className="text-sm font-medium text-stone-700">
                        {formatTimeRemaining(action.minutesLeft)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-stone-700">{action.detail}</p>
                  {/*
                    No link when there is nowhere to go. An agent out of
                    submission slots has no destination — there is no billing
                    surface yet — and a button leading somewhere unhelpful is
                    worse than the sentence above it.
                  */}
                  {action.href && action.hrefLabel ? (
                    <Link
                      className="mt-2 inline-block text-sm font-medium underline underline-offset-4"
                      href={action.href}
                    >
                      {action.hrefLabel}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {dashboard.state === "dormant" ? (
          <Dormant />
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Last {rangeLabel}</h2>
                <nav aria-label="Period" className="flex gap-1">
                  {RANGE_OPTIONS.map((option) => (
                    <Link
                      // "true", not "page". These are filters, not
                      // destinations — and the shell's rendered test counts
                      // aria-current="page" to prove exactly one nav tab is
                      // marked, so reusing it here would make a range filter
                      // look like a second current page.
                      aria-current={option === dashboard.range ? "true" : undefined}
                      className={`rounded-full px-3 py-1 text-sm ${
                        option === dashboard.range
                          ? "bg-stone-900 text-white"
                          : "border border-stone-300 text-stone-700"
                      }`}
                      href={`/agent?range=${option}`}
                      key={option}
                      // The default is 30, not 90: 0033 measured the view
                      // aggregate at roughly 140ms over 30 days against 400ms
                      // over 90, and this runs on every page load.
                      prefetch={false}
                    >
                      {option}d
                    </Link>
                  ))}
                </nav>
              </div>

              <DashboardKpis kpis={dashboard.kpis} />
            </section>

            <section aria-label="Over time" className="rounded-[1.5rem] border border-stone-900/10 bg-white/85 p-5">
              <h2 className="text-lg font-semibold">Views and requests</h2>
              <div className="mt-4">
                <DashboardChart points={dashboard.chart} />
              </div>
            </section>
          </>
        )}

        <section aria-label="Per listing" className="rounded-[1.5rem] border border-stone-900/10 bg-white/85 p-5">
          <h2 className="text-lg font-semibold">
            {dashboard.state === "dormant" ? "How they did" : "Each listing"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Views with no requests is a price or a photo problem. No views at
            all is a visibility problem. They are not the same fix.
          </p>
          <div className="mt-4">
            <DashboardListingsTable rows={dashboard.perListing} />
          </div>
        </section>

        {dashboard.activity.length > 0 ? (
          <section aria-label="Recent activity" className="rounded-[1.5rem] border border-stone-900/10 bg-white/85 p-5">
            <h2 className="text-lg font-semibold">Recently</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {dashboard.activity.map((item) => (
                <li className="flex flex-col gap-0.5" key={`${item.kind}-${item.at}-${item.title}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link className="font-medium underline underline-offset-4" href={item.href}>
                      {item.title}
                    </Link>
                    <time className="text-xs text-stone-500" dateTime={item.at}>
                      {new Date(item.at).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                      })}
                    </time>
                  </div>
                  <p className="text-sm leading-6 text-stone-600">{item.detail}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <AccountStrip
          freeListingQuota={dashboard.entitlement.freeListingQuota}
          hasSubscription={Boolean(dashboard.entitlement.activeSubscription)}
          verificationStatus={dashboard.entitlement.verificationStatus}
        />
      </div>
    </main>
  );
}

/**
 * The third state, and the one that was unhandled.
 *
 * An agent whose listings are all archived or rejected is not new — there is
 * history worth reading — and not active, because nothing they own can receive
 * a view or a request. Their KPIs going forward are structurally zero, and
 * showing "0 views, down 100%" invites them to fix a listing problem when the
 * truth is that there is no listing.
 *
 * Archiving is terminal (0022: "relisting means creating a new listing"), so
 * there is no restore to offer. The only route out is a new listing, which is
 * what this says. The per-listing table stays visible below as history —
 * knowing how the archived one did is the most useful thing available before
 * writing the next.
 */
function Dormant() {
  return (
    <section className="rounded-[1.5rem] border border-stone-900/10 bg-white/85 p-6">
      <h2 className="text-lg font-semibold">No live listings</h2>
      <p className="mt-2 text-sm leading-6 text-stone-700">
        Nothing of yours can be found by seekers right now, so there are no
        views or requests to report. Archived listings cannot be brought back —
        putting a property up again means creating a new listing.
      </p>
      <Link
        className="mt-3 inline-block rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white"
        href="/agent/listings/new"
      >
        Start a new listing
      </Link>
    </section>
  );
}

/**
 * First run: a checklist instead of a wall of zeros.
 *
 * Every number on this page is zero for a brand-new agent, and zero reads as
 * failure rather than as absence. Three steps in order, because they are
 * genuinely sequential — a listing cannot be submitted before verification.
 */
function FirstRun({ verificationStatus }: { verificationStatus: string }) {
  const steps = [
    {
      done: true,
      href: "/agent/profile",
      label: "Create your agent profile",
    },
    {
      done: verificationStatus === "verified",
      href: "/agent/verification",
      label:
        verificationStatus === "pending_review"
          ? "Verification submitted — we are reviewing it"
          : "Get verified so you can submit listings",
    },
    { done: false, href: "/agent/listings/new", label: "Put up your first listing" },
  ];

  return (
    <main className="px-5 py-8 text-stone-900 md:px-8 md:py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Your workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            Let&apos;s get your first listing up.
          </h1>
          <p className="mt-3 text-sm leading-6 text-stone-700">
            Numbers appear here once you have a listing people can find. Three
            steps, in this order.
          </p>
        </header>

        <ol className="flex flex-col gap-3">
          {steps.map((step, index) => (
            <li
              className="flex items-start gap-3 rounded-2xl border border-stone-900/10 bg-white/85 p-4"
              key={step.href}
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  step.done ? "bg-emerald-600 text-white" : "bg-stone-200 text-stone-700"
                }`}
              >
                {step.done ? "✓" : index + 1}
              </span>
              <Link className="font-medium underline underline-offset-4" href={step.href}>
                {step.label}
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}

function AccountStrip({
  freeListingQuota,
  hasSubscription,
  verificationStatus,
}: {
  freeListingQuota: number;
  hasSubscription: boolean;
  verificationStatus: string;
}) {
  return (
    <section
      aria-label="Account"
      className="grid gap-3 rounded-[1.5rem] border border-stone-900/10 bg-white/85 p-5 sm:grid-cols-3"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Verification
        </p>
        <p className="mt-1 text-sm text-stone-800">
          {verificationStatus === "verified" ? "Verified" : verificationStatus.replace(/_/g, " ")}
        </p>
        {verificationStatus !== "verified" ? (
          <Link className="text-sm underline underline-offset-4" href="/agent/verification">
            Continue
          </Link>
        ) : null}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Submission slots
        </p>
        <p className="mt-1 text-sm text-stone-800">
          {hasSubscription ? "Included with your plan" : `${freeListingQuota} left`}
        </p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Public profile
        </p>
        <Link className="mt-1 inline-block text-sm underline underline-offset-4" href="/agent/profile">
          Preview how seekers see you
        </Link>
      </div>
    </section>
  );
}
