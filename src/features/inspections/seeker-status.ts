import type { InspectionStatus } from "@/features/inspections/expiry";

/**
 * The six states, written from the seeker's side.
 *
 * The agent inbox labels the same six, and every one reads differently here
 * because the question is different. An agent asks "what needs my response".
 * A seeker has nothing to respond to; they ask "did they reply, and is it
 * still live".
 *
 * `expired` carries the weight. The agent's label is "Expired — you did not
 * respond in time", an accusation they have earned. The seeker's cannot be
 * "your request expired": that blames a clock for a person's silence, and the
 * seeker's honest takeaway is about the agent, not about a deadline. So the
 * label is "No reply", and the sentence beneath it names who did not give one.
 */
export const SEEKER_STATUS_LABEL: Readonly<Record<InspectionStatus, string>> = {
  accepted: "Accepted",
  cancelled: "You cancelled this",
  completed: "Completed",
  declined: "Declined",
  expired: "No reply",
  requested: "Waiting for a reply",
};

export const SEEKER_STATUS_CLASSES: Readonly<Record<InspectionStatus, string>> =
  {
    accepted: "bg-emerald-50 text-emerald-900",
    cancelled: "bg-stone-100 text-stone-600",
    completed: "bg-stone-100 text-stone-700",
    declined: "bg-stone-100 text-stone-700",
    // Deliberately not red. An agent's silence is not the seeker's error, and
    // an alarm colour on a row the seeker did nothing wrong in would read as
    // one.
    expired: "bg-stone-100 text-stone-600",
    requested: "bg-amber-50 text-amber-900",
  };

/**
 * What the seeker is told happened, in a sentence, where a label is not enough.
 *
 * Only the two states where somebody else's decision closed the request. The
 * rest are either self-evident or the seeker's own doing.
 */
export function seekerStatusDetail(
  status: InspectionStatus,
  agentName: string,
): string | null {
  if (status === "expired") {
    return `${agentName} did not reply within 48 hours.`;
  }

  if (status === "declined") {
    return `${agentName} declined this request.`;
  }

  return null;
}
