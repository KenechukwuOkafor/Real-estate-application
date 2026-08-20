import Link from "next/link";
import { redirect } from "next/navigation";

import { InspectionCountdown } from "@/features/inspections/components/inspection-countdown";
import { RespondToInspection } from "@/features/inspections/components/respond-to-inspection";
import { formatTimeRemaining } from "@/features/inspections/expiry";
import { listCurrentAgentInspectionRequests } from "@/server/services/inspection-service";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  accepted: "Accepted",
  cancelled: "Cancelled by the seeker",
  completed: "Completed",
  declined: "Declined",
  expired: "Expired — you did not respond in time",
  requested: "Waiting for your answer",
};

function formatRequestedAt(value: string) {
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The inspection inbox.
 *
 * Accept and decline existed only inside a chat thread, which meant an agent
 * found out somebody had asked to see a property by noticing an unfamiliar row
 * in their conversations. A request that nobody notices expires, and expiring is
 * indistinguishable to the seeker from being ignored.
 *
 * Expired requests stay in the list, greyed and labelled. Hiding them would
 * make the surface flattering and useless: an agent's real answer to "am I
 * responsive" lives in the ones they missed.
 */
export default async function AgentInspectionsPage() {
  /**
   * Only an access failure sends someone to the dashboard.
   *
   * A blanket `.catch(() => null)` here was how an ambiguous PostgREST embed
   * spent an afternoon looking like an auth problem: every failure, including a
   * plain query bug, rendered as a silent redirect. Anything that is not "you
   * are not an agent" is rethrown so it reaches the error boundary and the
   * logs, where it can be read.
   */
  const requests = await listCurrentAgentInspectionRequests().catch(
    (error: unknown) => {
      const code = (error as { code?: string })?.code;

      if (
        code === "UNAUTHENTICATED" ||
        code === "UNAUTHORIZED" ||
        code === "AGENT_PROFILE_NOT_FOUND"
      ) {
        return null;
      }

      throw error;
    },
  );

  if (!requests) {
    redirect("/dashboard");
  }

  const awaiting = requests.filter(
    (request) => request.effectiveStatus === "requested",
  );

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <section className="rounded-[2rem] border border-stone-900/10 bg-white/85 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Inspection requests
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {awaiting.length === 0
              ? "Nothing waiting on you."
              : `${awaiting.length} ${awaiting.length === 1 ? "request needs" : "requests need"} an answer.`}
          </h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Seekers have 48 hours to hear back from you. After that the request
            closes on its own and they have to start again.
          </p>
        </section>

        {requests.length === 0 ? (
          <section className="rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-8">
            <p className="text-sm leading-6 text-stone-600">
              No one has asked to see your properties yet. Requests appear here
              as soon as they do.
            </p>
          </section>
        ) : null}

        <ul className="flex flex-col gap-4">
          {requests.map((request) => {
            const isExpired = request.effectiveStatus === "expired";
            const isAwaiting = request.effectiveStatus === "requested";

            return (
              <li
                className={`rounded-[1.75rem] border border-stone-900/10 p-6 ${
                  isExpired ? "bg-white/50 text-stone-500" : "bg-white/85"
                }`}
                key={request.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p
                      className={`text-lg font-semibold ${isExpired ? "text-stone-600" : "text-stone-900"}`}
                    >
                      {request.requesterName}
                    </p>
                    <p className="mt-1 text-sm">
                      asked about{" "}
                      {request.listingSlug ? (
                        <Link
                          className="font-medium underline underline-offset-4"
                          href={`/listings/${request.listingSlug}`}
                        >
                          {request.listingTitle}
                        </Link>
                      ) : (
                        <span className="font-medium">{request.listingTitle}</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {formatRequestedAt(request.requestedAt)}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        isAwaiting
                          ? "bg-amber-50 text-amber-900"
                          : request.effectiveStatus === "accepted"
                            ? "bg-emerald-50 text-emerald-900"
                            : "bg-stone-100 text-stone-600"
                      }`}
                    >
                      {STATUS_LABEL[request.effectiveStatus] ??
                        request.effectiveStatus}
                    </span>
                    {isAwaiting && request.expiresAt ? (
                      <InspectionCountdown
                        expiresAt={request.expiresAt}
                        initialLabel={
                          formatTimeRemaining(request.minutesRemaining) ?? ""
                        }
                      />
                    ) : null}
                  </div>
                </div>

                {request.message ? (
                  <p className="mt-4 rounded-2xl bg-stone-50 p-4 text-sm leading-6 text-stone-700">
                    {request.message}
                  </p>
                ) : null}

                <div className="mt-4">
                  {isAwaiting ? (
                    <RespondToInspection
                      inspectionRequestId={request.id}
                      listingTitle={request.listingTitle}
                      requesterName={request.requesterName}
                    />
                  ) : null}

                  {request.effectiveStatus === "accepted" && request.chatId ? (
                    <Link
                      className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white"
                      href={`/chats/${request.chatId}`}
                    >
                      Open chat
                      {request.unreadMessageCount > 0 ? (
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-stone-900">
                          {request.unreadMessageCount} unread
                        </span>
                      ) : null}
                    </Link>
                  ) : null}

                  {isExpired ? (
                    <p className="text-sm leading-6">
                      This one closed without an answer. {request.requesterName}{" "}
                      can ask again if they are still looking.
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
