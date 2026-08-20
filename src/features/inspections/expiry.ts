/**
 * When an inspection request has run out of time.
 *
 * `expires_at` has been written since 0005 and nothing has ever read it. Expiry
 * is evaluated ON READ rather than by a job — no cron, no background work, no
 * lane for a scheduler that does not yet run. A request is expired when its
 * deadline has passed, computed at the moment somebody looks.
 *
 * That choice has a consequence worth stating: the stored `status` stays
 * 'requested' forever. Anything asking "is this still open" must ask THIS, not
 * the column. Two places already got that wrong, and both were live defects:
 *
 *  - findActiveInspectionRequest blocked a re-request on
 *    status in ('requested','accepted') with no deadline check, so a request an
 *    agent simply ignored past 48 hours blocked that seeker from ever asking
 *    about that listing again. Permanently, from doing nothing.
 *  - respondToInspectionRequest allowed a response from status 'requested'
 *    alone, so an agent could accept five days late and commit a seeker who had
 *    long since moved on.
 *
 * One definition, imported by both, and by the inbox that displays it.
 */

export type InspectionStatus =
  | "requested"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"
  | "completed";

/**
 * The status as it actually stands, which is not always the stored one.
 *
 * Only 'requested' can expire. An accepted request has already had its
 * response — the deadline it carried was the agent's window to answer, and
 * answering ended it. Declining, cancelling and completing are all final.
 */
export function effectiveInspectionStatus(
  request: { expires_at: string | null; status: string },
  now: Date = new Date(),
): InspectionStatus {
  if (request.status !== "requested") {
    return request.status as InspectionStatus;
  }

  if (!request.expires_at) {
    // No deadline recorded. Treated as open rather than expired: guessing a
    // deadline that was never written would silently close requests nobody
    // meant to time out.
    return "requested";
  }

  return new Date(request.expires_at).getTime() <= now.getTime()
    ? "expired"
    : "requested";
}

/** Still awaiting an answer, and still able to receive one. */
export function isAwaitingResponse(
  request: { expires_at: string | null; status: string },
  now: Date = new Date(),
) {
  return effectiveInspectionStatus(request, now) === "requested";
}

/**
 * Whether this request should stop a seeker asking about the same listing again.
 *
 * An accepted request blocks regardless of its deadline — there is a live
 * conversation, and a second request would be noise. A request still awaiting
 * an answer blocks because one is already in flight. An expired one blocks
 * nothing, which is the fix.
 */
export function blocksNewRequest(
  request: { expires_at: string | null; status: string },
  now: Date = new Date(),
) {
  const status = effectiveInspectionStatus(request, now);

  return status === "accepted" || status === "requested";
}

export const MILLISECONDS_PER_MINUTE = 60_000;

/**
 * How long is left, in whole minutes, or null when the question does not apply.
 *
 * Never negative: a request past its deadline has no time remaining, it is
 * expired, and "-340 minutes left" is a countdown that has stopped being a
 * countdown.
 */
export function minutesRemaining(
  request: { expires_at: string | null; status: string },
  now: Date = new Date(),
): number | null {
  if (!isAwaitingResponse(request, now) || !request.expires_at) {
    return null;
  }

  const remaining = new Date(request.expires_at).getTime() - now.getTime();

  return Math.max(0, Math.floor(remaining / MILLISECONDS_PER_MINUTE));
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
