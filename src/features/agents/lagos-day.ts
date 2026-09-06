/**
 * Africa/Lagos calendar days, because that is what 0033 buckets by.
 *
 * Extracted from agent-dashboard-service so the listings page can measure the
 * same window. Two copies of this would be two chances to compute the boundary
 * in UTC and pass it to a function that groups in WAT — an off-by-one that only
 * appears in the hour before midnight, and only on the first and last day of a
 * range, which is the kind of bug that survives for months.
 *
 * The dashboard and the listings page must agree about a listing's numbers.
 * They are the same numbers, and an agent who sees 4 requests on one screen and
 * 3 on the other has no way to know which to believe.
 */

/** The Lagos calendar date `offsetDays` ago, as YYYY-MM-DD. */
export function lagosDay(offsetDays: number, now: number = Date.now()) {
  const at = new Date(now - offsetDays * 24 * 60 * 60 * 1000);
  return at.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
}

/** Midnight at the start of a Lagos day, as an instant. */
export function lagosDayStart(day: string) {
  // Africa/Lagos is UTC+1 year round — no DST — so a fixed offset is correct
  // rather than merely convenient.
  return new Date(`${day}T00:00:00+01:00`);
}

/** The Lagos day an instant falls in. */
export function lagosDayOf(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
}
