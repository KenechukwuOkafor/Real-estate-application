/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AgentProfileViewTracker } from "@/features/agents/components/agent-profile-view-tracker";
import { ShareProfileLink } from "@/features/agents/components/share-profile-link";
import { isWellFormedHandle } from "@/features/agents/handle";
import { ListingGrid } from "@/features/listings/components/listing-grid";
import { appEnv } from "@/lib/env";
import {
  type PublicAgentProfile,
  getPublicAgentProfile,
} from "@/server/services/public-agent-profile-service";

export const dynamic = "force-dynamic";

type AgentProfilePageProps = {
  params: Promise<{ handle: string }>;
};

/**
 * The status labels an agent sees on their own page.
 *
 * Deliberately the plain words, not the portal's chips. This is the page a
 * stranger sees with one extra section bolted below it, and dressing that
 * section up as a second dashboard would make an agent read the whole page as
 * a workspace — which is exactly the misreading that would stop them pasting
 * the link, because nobody shares their admin panel.
 */
const PRIVATE_STATUS_LABEL: Record<string, string> = {
  archived: "Removed",
  draft: "Draft",
  pending_review: "In review",
  rejected: "Changes needed",
  rented: "Taken",
};

async function loadProfile(handleParam: string) {
  // Rejected before a query. A malformed handle cannot match the unique index,
  // so asking the database is a round trip spent on a crawler.
  if (!isWellFormedHandle(handleParam)) {
    return null;
  }

  return getPublicAgentProfile(handleParam);
}

export async function generateMetadata({
  params,
}: AgentProfilePageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await loadProfile(handle);

  if (!profile) {
    return { title: "Agent unavailable · Ruvo" };
  }

  return {
    description:
      profile.bio ??
      `${profile.displayName} lists student housing on Ruvo.`,
    title: `${profile.displayName} · Ruvo`,
  };
}

export default async function AgentProfilePage({ params }: AgentProfilePageProps) {
  const { handle } = await params;
  const profile = await loadProfile(handle);

  if (!profile) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)] px-5 py-10 text-stone-900 md:px-8">
      {/*
        Owner views do not count. An agent checking their own page would
        otherwise be most of the traffic on it, and this data exists to answer
        whether SEEKERS arrive with a question the page cannot answer.
      */}
      {profile.isOwner ? null : <AgentProfileViewTracker handle={profile.handle} />}

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <ProfileHeader profile={profile} />
        {profile.isOwner ? <OwnerShareCard profile={profile} /> : null}
        <ApprovedListings profile={profile} />
        {profile.isOwner ? <PrivateListings profile={profile} /> : null}
      </div>
    </main>
  );
}

function ProfileHeader({ profile }: { profile: PublicAgentProfile }) {
  return (
    <header className="rounded-[2rem] border border-stone-900/10 bg-white/85 p-6 shadow-[0_20px_80px_rgba(48,38,24,0.08)] md:p-9">
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <Avatar profile={profile} />

        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            {profile.displayName}
          </h1>

          {/*
            THE LOUDEST ELEMENT ON THE PAGE, and it is meant to be. It is the
            one thing a Facebook housing group cannot give an agent, and the
            reason this link is worth pasting anywhere.
          */}
          {profile.isVerified ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-base font-semibold text-white shadow-[0_8px_24px_rgba(5,120,85,0.25)]">
              <span aria-hidden="true">✓</span>
              Verified by Ruvo
            </div>
          ) : (
            /*
              Only ever seen by the agent themselves — an unverified profile is
              invisible to every other viewer under the row policy. So this is
              not a badge of doubt shown to strangers; it is the one place an
              agent finds out their page is not live yet.
            */
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              <p className="font-semibold">This page is not public yet.</p>
              <p className="mt-1">
                Only you can see it. Finish verification and it goes live at the
                link below, with the verified mark on it.{" "}
                <Link className="underline underline-offset-4" href="/agent/verification">
                  Go to verification
                </Link>
              </p>
            </div>
          )}

          {profile.isVerified && profile.verifiedAt ? (
            <p className="mt-2 text-sm text-stone-600">
              Verified since {formatVerifiedSince(profile.verifiedAt)}
            </p>
          ) : null}

          {profile.bio ? (
            <p className="mt-4 max-w-2xl whitespace-pre-line text-base leading-7 text-stone-700">
              {profile.bio}
            </p>
          ) : null}

          {/*
            Rendered only when there is a record worth publishing, and rendered
            as NOTHING otherwise. Not a placeholder: an absent element reads as
            neutral, while "not enough data yet" reads as a warning about an
            agent who has done nothing wrong.
          */}
          {profile.responseRate ? (
            <div className="mt-5 inline-flex flex-col rounded-2xl bg-stone-100 px-4 py-3">
              <span className="text-base font-semibold text-stone-900">
                {profile.responseRate.label}
              </span>
              {/*
                Says what it measures and no more. This counts replies, not
                outcomes: an agent who accepts everything and completes nothing
                scores full marks here, and the copy must not let a seeker read
                it as anything else.
              */}
              <span className="mt-0.5 text-xs text-stone-600">
                Counts replies to inspection requests, not what happened after.
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/**
 * A circle, and whatever is inside it is inside it.
 *
 * Expect low-resolution logos with text baked in, because that is what a small
 * Nsukka rental business has. `object-cover` crops rather than letterboxing:
 * a letterboxed logo on a coloured field looks broken, while a cropped one
 * looks like a cropped logo.
 */
function Avatar({ profile }: { profile: PublicAgentProfile }) {
  if (profile.avatarUrl) {
    return (
      <img
        alt=""
        className="h-24 w-24 shrink-0 rounded-full object-cover md:h-28 md:w-28"
        src={profile.avatarUrl}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,_#d9d2c4,_#ece6d8)] text-2xl font-semibold text-stone-600 md:h-28 md:w-28"
    >
      {profile.displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}

function OwnerShareCard({ profile }: { profile: PublicAgentProfile }) {
  const url = `${appEnv.appUrl()}/a/${profile.handle}`;

  return (
    <section className="rounded-[1.75rem] border border-stone-900/10 bg-white/85 p-6">
      <h2 className="text-lg font-semibold">Your link</h2>
      <p className="mt-1.5 mb-4 text-sm leading-6 text-stone-700">
        Paste this anywhere — a WhatsApp bio, a status, a flyer. It always shows
        whatever you have available right now, and it does not change when you
        change your display name.
      </p>
      <ShareProfileLink url={url} />
    </section>
  );
}

function ApprovedListings({ profile }: { profile: PublicAgentProfile }) {
  if (profile.listings.length > 0) {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold tracking-tight">Available now</h2>
        <ListingGrid listings={profile.listings} />
      </section>
    );
  }

  /*
    THE EMPTY CASE IS NOT AN EDGE CASE.

    This page shows availability, so a busy agent between tenancies has an
    empty grid despite a strong record — and their link is already sitting in
    somebody's WhatsApp. A bare empty grid would read as "this person has
    nothing and never did", which is both false and the opposite of what the
    link was pasted to say.

    The response rate above survives this, which is most of why it is on the
    page at all.
  */
  return (
    <section className="rounded-[1.75rem] border border-stone-900/10 bg-white/85 p-8 text-center">
      <h2 className="text-xl font-semibold tracking-tight">
        Nothing available right now
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-700">
        {profile.isOwner
          ? "Your page is live and this is what a seeker sees today. Anything you get approved appears here automatically."
          : `${profile.displayName} has no rooms free at the moment. Places usually come back between tenancies, so this link is worth keeping.`}
      </p>
      {profile.isOwner ? (
        <Link
          className="mt-6 inline-flex rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white"
          href="/agent/listings/new"
        >
          Add a listing
        </Link>
      ) : (
        <Link
          className="mt-6 inline-flex rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white"
          href="/listings"
        >
          Browse other listings
        </Link>
      )}
    </section>
  );
}

/**
 * Everything a seeker does not see.
 *
 * Populated only for the owner — and the service returns an empty array for
 * every other viewer regardless of what RLS handed back, so an admin holding a
 * read-all policy cannot end up with somebody's drafts rendered here.
 */
function PrivateListings({ profile }: { profile: PublicAgentProfile }) {
  if (profile.privateListings.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[1.75rem] border border-dashed border-stone-900/20 bg-white/60 p-6">
      <h2 className="text-lg font-semibold">Not on your public page</h2>
      <p className="mt-1.5 mb-4 text-sm leading-6 text-stone-700">
        Only you can see these. Drafts and listings in review appear above once
        approved; taken and removed ones do not.
      </p>

      <ul className="flex flex-col divide-y divide-stone-900/10">
        {profile.privateListings.map((listing) => (
          <li
            key={listing.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{listing.title}</p>
              <p className="text-sm text-stone-600">{listing.area}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                {PRIVATE_STATUS_LABEL[listing.status] ?? listing.status}
              </span>
              <Link
                className="text-sm font-medium underline underline-offset-4"
                href={`/agent/listings?focus=${listing.id}`}
              >
                Manage
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * "March 2026", in Lagos time.
 *
 * Month rather than a full date: the claim is tenure, and a day-level date
 * invites a stranger to compute how many days old the account is, which is a
 * sharper number than the evidence supports.
 */
function formatVerifiedSince(verifiedAt: string) {
  return new Intl.DateTimeFormat("en-NG", {
    month: "long",
    timeZone: "Africa/Lagos",
    year: "numeric",
  }).format(new Date(verifiedAt));
}
