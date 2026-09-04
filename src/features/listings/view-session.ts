/**
 * The id that makes a view count as a person rather than a page load.
 *
 * listing_views has carried a session_id column since 0001 and it has been
 * NULL on every row ever written, because nothing ever sent one. The whole
 * chain existed — client to route to service to repository, and 0028 even
 * grants insert on the column — with the first link missing. So a refresh, a
 * back navigation and a StrictMode remount were three views by three people.
 *
 * TWO KINDS OF ID, AND THE DIFFERENCE IS DELIBERATE.
 *
 * Persistent (localStorage): the same visitor keeps one id across days, so the
 * daily dedup in agent_listing_view_counts counts them once per day and twice
 * across two days. Two days of interest IS two days of interest; that is the
 * signal, not noise.
 *
 * Ephemeral (in-memory, storage unavailable): a fresh id per page load, so
 * each load counts as a new viewer. This over-counts a small minority, and
 * that is the direction chosen. The alternative — falling back to the server's
 * ip_hash — would deduplicate everyone behind one shared address into a single
 * view, and Nsukka runs on shared NAT: campus wifi, hostel connections, a
 * tethered phone passed around. That under-counts hardest on the listings
 * being looked at most, which is the one error an agent acts on and cannot
 * see. See 0033.
 *
 * sessionStorage is NOT used. It resets per tab, so opening a listing in three
 * tabs would be three people.
 */

const STORAGE_KEY = "ruvo:view-session";

function randomId() {
  // randomUUID needs a secure context. Available on https and on localhost,
  // absent on a plain-http LAN address — which is how the app gets opened on a
  // phone for testing, so the fallback is not hypothetical.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/**
 * The visitor's view-session id, persisted when that is possible.
 *
 * Every storage access is wrapped. Private modes, browsers set to block site
 * data, and embedded webviews all throw on `localStorage` rather than
 * returning null, and a beacon that throws is a beacon that stops recording —
 * BR-ANA-003 says analytics must never break the page it measures, and this
 * runs on the listing detail view.
 */
export function getOrCreateViewSessionId() {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);

    if (existing) {
      return existing;
    }

    const created = randomId();
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    // Ephemeral. Counted raw, on purpose — see the module comment.
    return randomId();
  }
}
