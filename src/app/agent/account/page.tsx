import Link from "next/link";

import { PortalSignOutButton } from "@/features/agents/components/sign-out-button";
import {
  getAgentOnboardingContext,
  getCurrentAgentListingsOverview,
} from "@/server/services/agent-service";

export const dynamic = "force-dynamic";

const VERIFICATION_COPY: Record<string, { detail: string; label: string }> = {
  not_submitted: {
    detail: "Verification is what lets you submit listings for review.",
    label: "Not started",
  },
  pending_review: {
    detail: "We are checking your documents. Nothing more is needed from you.",
    label: "Being checked",
  },
  rejected: {
    detail: "Something was wrong with your documents. Send them again to continue.",
    label: "Not accepted",
  },
  suspended: {
    detail: "Your account cannot submit listings. Contact support.",
    label: "Suspended",
  },
  verified: {
    detail: "You can submit listings for review.",
    label: "Verified",
  },
};

/**
 * Account.
 *
 * One destination for everything about the agent rather than about their
 * listings: the public profile, verification, and signing out. Those were
 * previously three separate cards on the workspace home, plus a fourth entry
 * point in the header avatar menu — which is what made two of them feel like
 * different features.
 *
 * Verification is reached from here rather than being a tab of its own. It is
 * something an agent does once, and a permanent tab spends the mobile bar's
 * scarcest resource on it forever.
 */
export default async function AgentAccountPage() {
  const [overview, context] = await Promise.all([
    getCurrentAgentListingsOverview(),
    getAgentOnboardingContext(),
  ]);
  const status = overview.entitlement.verificationStatus;
  const handle = context.agentProfile?.handle ?? null;
  const verification = VERIFICATION_COPY[status] ?? VERIFICATION_COPY.not_submitted;
  const isVerified = status === "verified";

  return (
    <main className="px-5 py-8 text-stone-900 md:px-8 md:py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <header>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Account
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            You and your details.
          </h1>
        </header>

        <section className="rounded-[1.75rem] border border-stone-900/10 bg-white/85 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Verification</h2>
              <p className="mt-1.5 text-sm leading-6 text-stone-700">
                {verification.detail}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                isVerified
                  ? "bg-emerald-50 text-emerald-900"
                  : status === "rejected" || status === "suspended"
                    ? "bg-rose-50 text-rose-800"
                    : "bg-amber-50 text-amber-900"
              }`}
            >
              {verification.label}
            </span>
          </div>
          {status !== "suspended" ? (
            <Link
              className="mt-3 inline-block text-sm font-medium underline underline-offset-4"
              href="/agent/verification"
            >
              {isVerified ? "View your verification" : "Go to verification"}
            </Link>
          ) : null}
        </section>

        {/*
          THE LINK GOES TO THE PAGE, NOT THE FORM.

          This card used to send an agent to /agent/profile — an editor — and
          described it as "the name, photo and contact details seekers see on
          every one of your listings". Every part of that was wrong: there was
          no photo, there were no contact details, and what a seeker actually
          saw was a display name and a tick in two tiles of a listing page.

          An agent could not see their own public presence at all, which is the
          gap this slice exists to close. So the primary action is now VIEW,
          and editing is the secondary link from there — the page is the thing
          they are being asked to share, and they will not share what they have
          not seen.
        */}
        <section className="rounded-[1.75rem] border border-stone-900/10 bg-white/85 p-6">
          <h2 className="text-lg font-semibold">Public profile</h2>
          <p className="mt-1.5 text-sm leading-6 text-stone-700">
            {handle
              ? "One link with your photo, your verified mark and everything you have available. Made to paste into WhatsApp."
              : "Create your profile to get a link you can share."}
          </p>
          <div className="mt-3 flex flex-wrap gap-4">
            {handle ? (
              <Link
                className="text-sm font-medium underline underline-offset-4"
                href={`/a/${handle}`}
              >
                See your public page
              </Link>
            ) : null}
            <Link
              className="text-sm font-medium underline underline-offset-4"
              href="/agent/profile"
            >
              {handle ? "Edit photo, name and bio" : "Create your profile"}
            </Link>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-stone-900/10 bg-white/85 p-6">
          <h2 className="text-lg font-semibold">Session</h2>
          <p className="mt-1.5 mb-4 text-sm leading-6 text-stone-700">
            Signing out ends this session on this device only.
          </p>
          <PortalSignOutButton />
        </section>
      </div>
    </main>
  );
}
