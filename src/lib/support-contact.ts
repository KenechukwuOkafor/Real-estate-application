/**
 * The route to a human.
 *
 * Verification is manual and rejections are judgement calls, so a person is
 * already in the loop. Until this existed, six sentences in the portal sent an
 * agent to support and nothing in the product said how to reach it. That is the
 * defect this module exists to close, and it closes it in two directions:
 *
 *  1. Every link carries a prefilled message saying who is writing and what
 *     about, so whoever answers does not start by asking.
 *  2. The number is REQUIRED configuration. A production build without it
 *     fails (see next.config.ts), and a request without it throws, exactly as
 *     the other required variables in env.ts do. A value that silently
 *     defaulted to empty would put "Message us" back on the page with nothing
 *     behind it — the same defect, reintroduced by a fallback.
 *
 * WhatsApp rather than a page or a ticket system because that is where agents
 * in Nsukka already are, and it costs nothing to run.
 *
 * No path aliases in this file: next.config.ts imports it at build time.
 */

export const SUPPORT_WHATSAPP_ENV_KEY = "NEXT_PUBLIC_SUPPORT_WHATSAPP";

/**
 * What the person is writing about. Each topic is one sentence a moderator can
 * act on without asking a follow-up question.
 */
export type SupportTopic =
  | "general"
  | "account_suspended"
  | "listing_rejected_without_reason"
  | "role_not_self_service";

export type SupportContext = {
  topic: SupportTopic;
  /** Who is writing. Absent before an agent profile exists. */
  agent?: { displayName: string | null; handle: string | null } | null;
  /** What it is about, when it is about one listing. */
  listing?: { title: string } | null;
};

/**
 * The number in the only form wa.me accepts: country code and digits, no plus,
 * no spaces, no leading zero.
 *
 * Returns null for anything that would produce a link that opens WhatsApp and
 * then fails, which is worse than no link: a local-format number (0803...) is
 * the likeliest mistake and is rejected rather than guessed at, because the
 * country it belongs to is not ours to assume.
 */
export function normalizeSupportNumber(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();

  // Only digits, spaces, dashes, dots, brackets and one leading plus.
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) {
    return null;
  }

  const digits = trimmed.replace(/\D/g, "");

  // E.164 allows at most 15 digits; anything under 10 cannot carry a country
  // code and a subscriber number. A leading 0 is a trunk prefix, not a country.
  if (digits.length < 10 || digits.length > 15 || digits.startsWith("0")) {
    return null;
  }

  return digits;
}

/**
 * Why the configured value is unusable, or null when it is usable.
 *
 * Shared by the build-time check and the runtime getter so the two cannot
 * disagree about what counts as configured.
 */
export function supportNumberProblem(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) {
    return `${SUPPORT_WHATSAPP_ENV_KEY} is not set. Every "message us" link in the product points at it.`;
  }

  if (!normalizeSupportNumber(raw)) {
    return `${SUPPORT_WHATSAPP_ENV_KEY} must be an international number with its country code and no leading zero, e.g. +234 803 000 0000.`;
  }

  return null;
}

/**
 * Fail the production build when the number is missing or malformed.
 *
 * Called from next.config.ts in the production-build phase only, so `next dev`
 * still starts and reports the problem per request instead.
 */
export function assertSupportContactConfigured(
  env: Record<string, string | undefined>,
): void {
  const problem = supportNumberProblem(env[SUPPORT_WHATSAPP_ENV_KEY]);

  if (problem) {
    throw new Error(`Build refused: ${problem}`);
  }
}

/**
 * The configured number, or a thrown error.
 *
 * The property access is written out literally on purpose. Next.js inlines
 * NEXT_PUBLIC_ variables into client bundles only where it can see
 * `process.env.NEXT_PUBLIC_...` spelled out; a computed key would be undefined
 * in the browser.
 */
export function supportWhatsappNumber(): string {
  const raw = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP;
  const problem = supportNumberProblem(raw);

  if (problem) {
    // Not AppError: this module is imported by next.config.ts, which cannot
    // resolve the path alias AppError lives behind. The message is for us, and
    // the code is in it so logs can be searched for it.
    throw new Error(`CONFIG_ENV_VAR_MISSING: ${problem}`);
  }

  return normalizeSupportNumber(raw) as string;
}

function who(agent: SupportContext["agent"]): string {
  const name = agent?.displayName?.trim();
  const handle = agent?.handle?.trim();

  if (name && handle) {
    return `I'm ${name} (profile: ${handle})`;
  }

  if (name) {
    return `I'm ${name}`;
  }

  return "I'm an agent on Ruvo";
}

/**
 * The prefilled message. Written in the first person because the agent sends
 * it, and specific because the person answering should be able to act on the
 * first message.
 */
export function supportMessage(context: SupportContext): string {
  const opener = `Hi Ruvo, ${who(context.agent)}.`;

  switch (context.topic) {
    case "account_suspended":
      return `${opener} My account shows as suspended. Can you tell me why, and what I can do?`;
    case "listing_rejected_without_reason":
      return context.listing
        ? `${opener} My listing "${context.listing.title}" was rejected, but no reason was recorded. What should I change before I resubmit?`
        : `${opener} One of my listings was rejected, but no reason was recorded. What should I change before I resubmit?`;
    case "role_not_self_service":
      // Before a profile exists there is nobody to name, so this one does not
      // pretend to know who is writing.
      return "Hi Ruvo, I tried to choose an account type that isn't offered on sign-up. Can you help?";
    case "general":
    default:
      return `${opener} I have a question about my account.`;
  }
}

/** A wa.me link to the support number with the context already typed. */
export function supportWhatsappUrl(context: SupportContext): string {
  return `https://wa.me/${supportWhatsappNumber()}?text=${encodeURIComponent(
    supportMessage(context),
  )}`;
}
