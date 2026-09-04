/**
 * When an inspection has run out of time — in either of the two ways it can.
 *
 * Expiry is evaluated ON READ rather than by a job — no cron, no background
 * work, no lane for a scheduler that does not yet run. A deadline has passed
 * when it has passed, computed at the moment somebody looks.
 *
 * That choice has a consequence worth stating: the stored `status` never moves
 * on its own. Anything asking "is this still open" must ask THIS, not the
 * column. Two places already got that wrong, and both were live defects:
 *
 *  - findActiveInspectionRequest blocked a re-request on
 *    status in ('requested','accepted') with no deadline check, so a request an
 *    agent simply ignored past 48 hours blocked that seeker from ever asking
 *    about that listing again. Permanently, from doing nothing.
 *  - respondToInspectionRequest allowed a response from status 'requested'
 *    alone, so an agent could accept five days late and commit a seeker who had
 *    long since moved on.
 *
 * THERE ARE NOW TWO WINDOWS, AND ONE DEFINITION OF THEM.
 *
 * An earlier version of this file said only 'requested' could run out of time,
 * because "the deadline it carried was the agent's window to answer, and
 * answering ended it". That is no longer true. Accepting starts a second
 * window: the agent has four days to mark the inspection complete, and an
 * inspection they never mark has LAPSED. The two windows differ only in which
 * column carries the deadline and what the miss is called, so they are one
 * table here rather than two branches — a second definition is how the two
 * defects above happened.
 */

/**
 * The statuses Postgres can actually hold — public.inspection_status, verbatim.
 */
export type StoredInspectionStatus =
  | "requested"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"
  | "completed";

/**
 * What a reader sees, which includes one state the database cannot hold.
 *
 * 'lapsed' is derived and never written. It is deliberately NOT a member of the
 * Postgres enum: nothing would ever write it, and this table already carries
 * enum values nobody writes. Keeping it out of the database is also what makes
 * "a lapse is recorded by nothing" true — a lapsed inspection is an accepted
 * row whose deadline passed, countable by query, invisible to any writer.
 */
export type InspectionStatus = StoredInspectionStatus | "lapsed";

/**
 * Anything carrying the two deadlines and a stored status.
 *
 * `completion_deadline` is required rather than optional on purpose. A caller
 * that forgets to select it would otherwise get a silent "never lapses" for
 * every accepted row, which is the failure this module exists to prevent.
 */
export type DeadlineBearing = {
  completion_deadline: string | null;
  expires_at: string | null;
  status: string;
};

/**
 * The two windows, as data.
 *
 * A status not named here is final: declined, cancelled and completed are
 * endings, and 'expired' is itself already a miss.
 */
const WINDOWS = {
  accepted: { deadline: "completion_deadline", missed: "lapsed" },
  requested: { deadline: "expires_at", missed: "expired" },
} as const satisfies Record<
  string,
  { deadline: keyof DeadlineBearing; missed: InspectionStatus }
>;

function runningWindow(request: DeadlineBearing) {
  const window = WINDOWS[request.status as keyof typeof WINDOWS];

  if (!window) {
    return null;
  }

  const deadline = request[window.deadline];

  if (!deadline) {
    // No deadline recorded. Treated as open rather than missed: guessing a
    // deadline that was never written would silently close inspections nobody
    // meant to time out. Accepted rows from before the completion window
    // existed land here, and stay accepted.
    return null;
  }

  return { deadline, missed: window.missed };
}

/**
 * The status as it actually stands, which is not always the stored one.
 */
export function effectiveInspectionStatus(
  request: DeadlineBearing,
  now: Date = new Date(),
): InspectionStatus {
  const window = runningWindow(request);

  if (!window) {
    return request.status as InspectionStatus;
  }

  return new Date(window.deadline).getTime() <= now.getTime()
    ? window.missed
    : (request.status as InspectionStatus);
}

/** Still awaiting an answer, and still able to receive one. */
export function isAwaitingResponse(
  request: DeadlineBearing,
  now: Date = new Date(),
) {
  return effectiveInspectionStatus(request, now) === "requested";
}

/**
 * Accepted, unmarked, and still inside the four days.
 *
 * The agent's own question: is there anything left for me to do here. False
 * once it is marked complete and false once it has lapsed — a lapse cannot be
 * cured by marking it late, which is what makes the deadline mean anything.
 */
export function isAwaitingCompletion(
  request: DeadlineBearing,
  now: Date = new Date(),
) {
  return effectiveInspectionStatus(request, now) === "accepted";
}

/**
 * Whether this request should stop a seeker asking about the same listing again.
 *
 * An accepted request blocks because there is a live conversation and a second
 * request would be noise. One still awaiting an answer blocks because one is
 * already in flight. An expired one blocks nothing, which was the fix — and a
 * LAPSED one blocks nothing for exactly the same reason: the seeker would
 * otherwise be locked out of a listing by an agent's silence. That falls out of
 * reading the effective status rather than the column, and is tested.
 */
export function blocksNewRequest(
  request: DeadlineBearing,
  now: Date = new Date(),
) {
  const status = effectiveInspectionStatus(request, now);

  return status === "accepted" || status === "requested";
}

/**
 * Whether there is a live conversation attached to this inspection.
 *
 * Accepting opens the chat, and NOTHING AFTERWARDS CLOSES IT. A lapse in
 * particular must not: the conversation has its own lifetime, and hiding it
 * because the agent forgot to mark a visit would punish the seeker for the
 * agent's silence — they may well have rearranged in that very chat, which is
 * the likeliest reason the mark was never made.
 *
 * Completed keeps it for the same reason: the visit happening is not a reason
 * to take away the thread it was arranged in.
 *
 * A request nobody has answered has a chat row (it is created with the
 * request) but nothing to attend to yet, and a declined or expired one never
 * became a conversation at all.
 */
export function conversationExists(status: InspectionStatus) {
  return status === "accepted" || status === "lapsed" || status === "completed";
}

export const MILLISECONDS_PER_MINUTE = 60_000;

/**
 * Whole minutes until a deadline, or null once it has passed.
 *
 * The primitive underneath minutesRemaining, exported because the countdown
 * component has a deadline in hand and no row to ask about — fabricating a row
 * around it was how that component ended up hardcoding `status: "requested"`
 * and quietly refusing to count anything else.
 */
export function minutesUntil(deadline: string, now: Date = new Date()) {
  const remaining = new Date(deadline).getTime() - now.getTime();

  if (remaining <= 0) {
    return null;
  }

  return Math.floor(remaining / MILLISECONDS_PER_MINUTE);
}

/**
 * How long is left on whichever window is running, or null when none is.
 *
 * Never negative: something past its deadline has no time remaining, it has
 * missed it, and "-340 minutes left" is a countdown that has stopped being a
 * countdown.
 */
export function minutesRemaining(
  request: DeadlineBearing,
  now: Date = new Date(),
): number | null {
  const window = runningWindow(request);

  if (!window) {
    return null;
  }

  return minutesUntil(window.deadline, now);
}

/**
 * The countdown, in words.
 *
 * Coarse on purpose. A seeker is waiting on a person, not a process, and
 * "1 day left" is what an agent needs to prioritise — second-by-second
 * precision would imply the deadline is enforced to the second, which it is
 * not: it is checked whenever somebody reads.
 */
export function formatTimeRemaining(minutes: number | null): string | null {
  if (minutes === null) {
    return null;
  }

  if (minutes < 1) {
    return "less than a minute left";
  }

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} left`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} left`;
  }

  const days = Math.floor(hours / 24);

  return `${days} day${days === 1 ? "" : "s"} left`;
}
