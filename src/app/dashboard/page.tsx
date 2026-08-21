import Link from "next/link";
import { redirect } from "next/navigation";

import { InspectionCountdown } from "@/features/inspections/components/inspection-countdown";
import { formatTimeRemaining } from "@/features/inspections/expiry";
import {
  SEEKER_STATUS_CLASSES,
  SEEKER_STATUS_LABEL,
  seekerStatusDetail,
} from "@/features/inspections/seeker-status";
import { listCurrentSeekerInspectionRequests } from "@/server/services/inspection-service";
import { getCurrentAppUser } from "@/server/services/user-sync-service";

export const dynamic = "force-dynamic";

function formatRequestedAt(value: string) {
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function roleShortcut(roles: string[]) {
  if (roles.includes("admin")) {
    return { href: "/admin/verification", label: "Admin review" };
  }

  if (roles.includes("agent")) {
    return { href: "/agent", label: "Agent workspace" };
  }

  return null;
}

/**
 * The seeker's home.
 *
 * This page was a 96-line stub: a welcome line, role chips, and four shortcut
 * links duplicating navigation the header's account menu already provides. It
 * answered "where can I go", which nobody was asking.
 *
 * A seeker's real question is what happened to the things they asked for. An
 * agent has had an inbox with countdowns and honest expiry since the last
 * slice; a seeker learned an agent had accepted by noticing a new conversation
 * appear, and learned one had expired by never hearing anything at all. So the
 * dashboard becomes that list rather than a page linking to it — a second page
 * would have left this one empty of content.
 *
 * The role shortcut survives as one link, because an agent still needs a way
 * across to their workspace.
 */
export default async function DashboardPage() {
  const result = await getCurrentAppUser();

  if (!result || result.roles.length === 0) {
    redirect("/onboarding");
  }

  const requests = await listCurrentSeekerInspectionRequests();
  const waiting = requests.filter(
    (request) => request.effectiveStatus === "requested",
  );
  const shortcut = roleShortcut(result.roles);

  return (
    <main className="px-5 py-8 text-stone-900 md:px-8 md:py-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <section className="rounded-[2rem] border border-stone-900/10 bg-white/85 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Your inspection requests
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            {waiting.length === 0
              ? "Nothing waiting on an answer."
              : `${waiting.length} ${waiting.length === 1 ? "request is" : "requests are"} waiting for a reply.`}
          </h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            An agent has 48 hours to answer. After that the request closes and
            you can ask again, or look elsewhere.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white"
              href="/"
            >
              Browse listings
            </Link>
            <Link
              className="rounded-full border border-stone-900/10 bg-white px-5 py-2.5 text-sm font-medium text-stone-800"
              href="/chats"
            >
              Chats
            </Link>
            {shortcut ? (
              <Link
                className="rounded-full border border-stone-900/10 bg-white px-5 py-2.5 text-sm font-medium text-stone-800"
                href={shortcut.href}
              >
                {shortcut.label}
              </Link>
            ) : null}
          </div>
        </section>

        {requests.length === 0 ? (
          <section className="rounded-[1.75rem] border border-dashed border-stone-900/15 bg-white/70 p-8 text-center">
            <p className="text-base font-medium text-stone-900">
              You have not asked to see anywhere yet.
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">
              Send an inspection request from any listing and it will appear
              here, with how long the agent has left to answer.
            </p>
            <Link
              className="mt-5 inline-block rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white"
              href="/"
            >
              Find a place
            </Link>
          </section>
        ) : null}

        <ul className="flex flex-col gap-4">
          {requests.map((request) => {
            const isWaiting = request.effectiveStatus === "requested";
            const isExpired = request.effectiveStatus === "expired";
            const isAccepted = request.effectiveStatus === "accepted";

            return (
              <li
                className={`rounded-[1.75rem] border border-stone-900/10 p-6 ${
                  isExpired ? "bg-white/50" : "bg-white/85"
                }`}
                key={request.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold text-stone-900">
                      {request.listingSlug ? (
                        <Link
                          className="underline underline-offset-4"
                          href={`/listings/${request.listingSlug}`}
                        >
                          {request.listingTitle}
                        </Link>
                      ) : (
                        request.listingTitle
                      )}
                    </p>
                    <p className="mt-1 text-sm text-stone-600">
                      You asked {request.agentName}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      Sent {formatRequestedAt(request.requestedAt)}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    <span
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        SEEKER_STATUS_CLASSES[request.effectiveStatus]
                      }`}
                    >
                      {SEEKER_STATUS_LABEL[request.effectiveStatus]}
                    </span>

                    {/*
                      The countdown a seeker has never been shown. It is the
                      honest version of what happens today, which is silence:
                      the request really is live, and it really does run out.
                    */}
                    {isWaiting && request.expiresAt ? (
                      <InspectionCountdown
                        expiresAt={request.expiresAt}
                        initialLabel={
                          formatTimeRemaining(request.minutesRemaining) ??
                          "Expired"
                        }
                      />
                    ) : null}
                  </div>
                </div>

                {isExpired ? (
                  /*
                    What a seeker does with silence.
                    
                    Re-requesting is possible again now that blocksNewRequest
                    ignores expired requests, so "Ask again" is offered — but
                    not first. A seeker whose request went unanswered has
                    learned something about this agent, and leading with "ask
                    again" would ask them to ignore it. Leading with somewhere
                    else to look does not.
                  */
                  <div className="mt-5 border-t border-stone-900/10 pt-4">
                    <p className="text-sm text-stone-600">
                      {seekerStatusDetail("expired", request.agentName)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Link
                        className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white"
                        href={`/?${request.similarListingsQuery}`}
                      >
                        See similar places
                      </Link>
                      {request.listingSlug ? (
                        <Link
                          className="rounded-full border border-stone-900/15 bg-white px-4 py-2 text-sm font-medium text-stone-800"
                          href={`/listings/${request.listingSlug}`}
                        >
                          Ask again
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {isAccepted && request.chatId ? (
                  <div className="mt-5 border-t border-stone-900/10 pt-4">
                    <Link
                      className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white"
                      href={`/chats/${request.chatId}`}
                    >
                      Open the conversation
                      {request.unreadMessageCount > 0 ? (
                        <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
                          {request.unreadMessageCount} new
                        </span>
                      ) : null}
                    </Link>
                  </div>
                ) : null}

                {request.effectiveStatus === "declined" ? (
                  <div className="mt-5 border-t border-stone-900/10 pt-4">
                    <p className="text-sm text-stone-600">
                      {seekerStatusDetail("declined", request.agentName)}
                    </p>
                    <Link
                      className="mt-3 inline-block rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white"
                      href={`/?${request.similarListingsQuery}`}
                    >
                      See similar places
                    </Link>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
