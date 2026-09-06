/**
 * The agent handle: the readable half of a URL an agent pastes into WhatsApp.
 *
 * ===========================================================================
 * WHY NOT slug--public_uuid, WHICH LISTINGS ALREADY USE
 * ===========================================================================
 *
 * A listing link is CLICKED. It arrives in a feed or a message, nobody reads
 * it, and the uuid tail costs nothing — it buys a stable identity that
 * survives a retitled listing, and `parseListingIdentifier` splits it on the
 * final double dash so the slug can drift freely.
 *
 * An agent profile link is TYPED, forwarded, and put in a WhatsApp bio. It is
 * read by a stranger deciding whether this person is real. Those two jobs pull
 * in opposite directions:
 *
 *   /listings/modern-flat--0198c1f2-3a4b-7c8d-9e0f-1a2b3c4d5e6f   fine
 *   /a/prime-homes-nsukka--0198c1f2-3a4b-7c8d-9e0f-1a2b3c4d5e6f   not fine
 *
 * The second is 57 characters, cannot be repeated aloud, and looks generated —
 * on a page whose entire purpose is looking legitimate. So this is one of the
 * places the listing pattern does not transfer, and the reason it does not is
 * that the identifier stops being plumbing and becomes part of the pitch.
 *
 * ===========================================================================
 * WHAT REPLACES IT, AND HOW STABILITY IS BOUGHT WITHOUT A UUID
 * ===========================================================================
 *
 * A handle: unique across all agents, derived from the display name ONCE at
 * profile creation, and never re-derived.
 *
 * Derive-once is what makes it stable when a display name changes — which is
 * the requirement the uuid was serving. It is a stronger guarantee than the
 * listing scheme gives, not a weaker one: a listing's slug drifts and the uuid
 * carries resolution, whereas a handle simply does not move. Renaming
 * "Prime Homes Nsukka" to "Prime Property Group" leaves prime-homes-nsukka
 * working, because every link already pasted resolves to the same row.
 *
 * The cost is a global namespace, and it is a real cost: two agents cannot
 * both be prime-homes. That is handled by a counter rather than a random
 * suffix, because prime-homes-2 tells the agent something true — somebody got
 * there first — while prime-homes-x7f tells them nothing and looks like an
 * error. Reserved words are refused outright: a handle is a URL a stranger
 * reads, and /a/support must not be an agent.
 *
 * NOT USER-EDITABLE in this slice. A handle that can change is a link that can
 * break, and every previously pasted URL is somebody else's message history.
 * Changing one is an admin action when it becomes one, the same shape as
 * clearing an avatar.
 */

/**
 * Thirty characters.
 *
 * Long enough for "nsukka-student-accommodation" and short enough to stay on
 * one line beside a domain in a WhatsApp bio. The names that overflow it are
 * the ones nobody types in full anyway.
 */
export const HANDLE_MAX_LENGTH = 30;

/** Below this a handle is not recognisable as a name. */
export const HANDLE_MIN_LENGTH = 3;

/**
 * Words that must not be somebody's handle.
 *
 * These read as Ruvo speaking rather than as a business: a stranger seeing
 * /a/support or /a/verified draws a conclusion the tick is supposed to earn,
 * and that is the whole risk a global namespace carries on a page whose job is
 * establishing trust.
 *
 * "agent" is deliberately NOT on the list. It is not an impersonation risk —
 * nobody reads /a/agent as Ruvo — and it is the fallback stem for a display
 * name that yields no latin characters at all, which reserving it would break.
 */
export const RESERVED_HANDLES = [
  "about",
  "admin",
  "api",
  "auth",
  "contact",
  "dashboard",
  "help",
  "listing",
  "listings",
  "login",
  "me",
  "new",
  "official",
  "ruvo",
  "settings",
  "signup",
  "staff",
  "support",
  "verified",
  "verify",
] as const;

const RESERVED = new Set<string>(RESERVED_HANDLES);

const WELL_FORMED = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A display name reduced to handle characters, or "" when nothing survives.
 *
 * Deliberately returns empty rather than a fallback. Inventing a handle here
 * would hide the case from the caller, and the caller is the one that knows
 * whether it is choosing a first candidate or validating something a person
 * typed.
 */
export function slugifyAgentHandle(displayName: string): string {
  const stripped = displayName
    // Accents to their base letter, so a name typed with them keeps its
    // syllables instead of losing whole characters to the filter below.
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (stripped.length <= HANDLE_MAX_LENGTH) {
    return stripped;
  }

  /**
   * Cut at a word boundary when there is one, rather than mid-word.
   *
   * "nsukka-student-accommodation-serv" reads as a typo of the business name;
   * "nsukka-student" reads as a shortening of it. Only the second is something
   * an agent will paste without explaining.
   */
  const cut = stripped.slice(0, HANDLE_MAX_LENGTH + 1);
  const lastBoundary = cut.lastIndexOf("-");

  return (lastBoundary > 0 ? cut.slice(0, lastBoundary) : cut.slice(0, HANDLE_MAX_LENGTH))
    .replace(/-+$/g, "");
}

/** Shape and namespace, not availability — that is a question for the database. */
export function isWellFormedHandle(handle: string): boolean {
  return (
    handle.length >= HANDLE_MIN_LENGTH &&
    handle.length <= HANDLE_MAX_LENGTH &&
    WELL_FORMED.test(handle) &&
    !RESERVED.has(handle)
  );
}

/** Enough attempts to clear any realistic pile-up on one business name. */
const CANDIDATE_COUNT = 25;

/**
 * Handles to try, in order, for a new profile.
 *
 * Always returns usable candidates. The caller takes the first one the
 * database accepts, so uniqueness is settled by the unique index rather than
 * by a read — a check-then-insert would race two agents registering the same
 * business name in the same second.
 */
export function agentHandleCandidates(displayName: string): string[] {
  const slug = slugifyAgentHandle(displayName);
  // "agent" is itself reserved, so a nameless stem starts at agent-2 unless it
  // is padded first. Padding keeps the first candidate readable.
  const stem = slug.length >= HANDLE_MIN_LENGTH ? slug : padStem(slug);

  const candidates: string[] = [];

  for (let n = 1; candidates.length < CANDIDATE_COUNT; n += 1) {
    const candidate = n === 1 ? stem : withCounter(stem, n);

    if (isWellFormedHandle(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

/**
 * A stem too short to stand alone.
 *
 * A two-letter business name is real ("Ac Homes" abbreviated to "Ac"), and it
 * cannot be a handle. Appending rather than replacing keeps what the agent
 * actually wrote in the URL.
 */
function padStem(slug: string): string {
  return slug.length === 0 ? "agent" : `${slug}-homes`.slice(0, HANDLE_MAX_LENGTH);
}

/** `stem-n`, shortening the stem so the counter always fits. */
function withCounter(stem: string, n: number): string {
  const suffix = `-${n}`;
  const room = HANDLE_MAX_LENGTH - suffix.length;

  return `${stem.slice(0, room).replace(/-+$/g, "")}${suffix}`;
}
