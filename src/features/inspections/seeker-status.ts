import type { InspectionStatus } from "@/features/inspections/expiry";

/**
 * The states, written from the seeker's side.
 *
 * The agent inbox labels the same set, and every one reads differently here
 * because the question is different. An agent asks "what needs my response".
 * A seeker has nothing to respond to; they ask "did they reply, and is it
 * still live".
 *
 * `expired` carries the weight. The agent's label is "Expired — you did not
 * respond in time", an accusation they have earned. The seeker's cannot be
 * "your request expired": that blames a clock for a person's silence, and the
 * seeker's honest takeaway is about the agent, not about a deadline. So the
 * label is "No reply", and the sentence beneath it names who did not give one.
 *
 * `lapsed` is the same problem one step later, and takes the same treatment.
 * The agent accepted and then never marked the inspection complete. "Expired"
 * would be wrong twice over: it blames a clock again, and it implies the visit
 * did not happen, which nobody knows — it may well have gone ahead with the
 * agent simply never saying so. "Not confirmed" is the only thing that is
 * certainly true, and the sentence beneath it says who did not confirm.
 */
export const SEEKER_STATUS_LABEL: Readonly<Record<InspectionStatus, string>> = {
  accepted: "Accepted",
  cancelled: "You cancelled this",
  completed: "Completed",
  declined: "Declined",
  expired: "No reply",
  lapsed: "Not confirmed",
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
    // Neutral for the same reason as expired: the seeker did nothing wrong
    // here either, and may not even know anything is amiss.
    lapsed: "bg-stone-100 text-stone-600",
    requested: "bg-amber-50 text-amber-900",
  };

/**
 * What the seeker is told happened, in a sentence, where a label is not enough.
 *
 * Only the states where somebody else's decision — or silence — closed the
 * request. The rest are either self-evident or the seeker's own doing.
 */
export function seekerStatusDetail(
  status: InspectionStatus,
  agentName: string,
): string | null {
  if (status === "expired") {
    return `${agentName} did not reply within 48 hours.`;
  }

  if (status === "completed") {
    // Attributed, not stated as fact. The seeker was never asked to confirm
    // this, and "Completed" alone could read as something they agreed to.
    // Naming who recorded it is what makes a later dispute coherent.
    return `${agentName} marked this inspection complete.`;
  }

  if (status === "lapsed") {
    return `${agentName} did not confirm this inspection took place.`;
  }

  if (status === "declined") {
    return `${agentName} declined this request.`;
  }

  return null;
}
