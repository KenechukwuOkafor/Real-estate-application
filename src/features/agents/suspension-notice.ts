/**
 * What a suspended agent reads. ADR-017-A1.
 *
 * Before 0044 a suspension, if anyone had made one by hand, changed the word on
 * four surfaces to "Suspended" and explained nothing: the agent's listings left
 * public view, submission stopped, and they would have concluded the product
 * broke. The message has three jobs, and the order matters:
 *
 *  1. WHY — the moderator's own words, verbatim.
 *  2. WHAT IT MEANS — hidden from seekers, and nothing can be sent for review.
 *     And just as plainly, what it does NOT mean: their conversations and
 *     inspections carry on, and seekers waiting on them are still waiting. An
 *     agent who assumes everything stopped would abandon exactly the people
 *     ADR-017-A1 keeps suspension from stranding.
 *  3. WHO TO ASK — a person, because nothing inside the product lifts it.
 *
 * Pure and in one place because the account page and the verification page both
 * show it, and the wording must not drift between them.
 */

export type SuspensionNotice = {
  heading: string;
  reasonLabel: string;
  reason: string;
  effects: string[];
  continues: string;
  nextStep: string;
};

const NO_REASON = "No details were recorded.";

export function suspensionNotice(reason: string | null | undefined): SuspensionNotice {
  return {
    continues:
      "Your conversations and inspections carry on as normal. Keep answering the seekers who are waiting on you.",
    effects: [
      "Your listings and your public page are hidden from seekers.",
      "You cannot send listings or changes for review.",
    ],
    heading: "Your account is suspended",
    nextStep: "Message us on WhatsApp to find out what happens next.",
    reason: reason?.trim() || NO_REASON,
    reasonLabel: "What a moderator wrote",
  };
}
