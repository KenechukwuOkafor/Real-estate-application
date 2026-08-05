"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ListingListItem } from "@/features/listings/types";

export function buildFeedCacheKey(query: string) {
  return `ruvo:feed:${query}`;
}

type FeedSnapshot = {
  cursor: string | null;
  hasMore: boolean;
  items: ListingListItem[];
  scrollY: number;
};

type UseListingFeedOptions = {
  initialCursor: string | null;
  initialHasMore: boolean;
  initialItems: ListingListItem[];
  query: string;
};

function isFeedSnapshotShape(value: unknown): value is FeedSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    Array.isArray(candidate.items) &&
    typeof candidate.hasMore === "boolean" &&
    typeof candidate.scrollY === "number" &&
    (candidate.cursor === null || typeof candidate.cursor === "string")
  );
}

/**
 * Decides, from a raw (untrusted) parsed value, whether it represents a
 * usable snapshot worth restoring. This is the single source of truth for
 * the restore-vs-reset decision: it doubles as the shape guard for
 * `JSON.parse` output (a snapshot is never trusted before this returns
 * true) and as the "is there more to restore than the server already gave
 * us" check. Kept pure and DOM-free so it is unit-testable under Vitest's
 * node environment without jsdom.
 */
export function shouldRestoreSnapshot(
  snapshot: unknown,
  initialItemCount: number,
): snapshot is FeedSnapshot {
  return isFeedSnapshotShape(snapshot) && snapshot.items.length > initialItemCount;
}

function readRawSnapshot(key: string): unknown {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistSnapshot(key: string, snapshot: FeedSnapshot) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // sessionStorage can be full or blocked (e.g. private browsing);
    // restoration is a nicety, never a reason to break the feed.
  }
}

export function useListingFeed({
  initialCursor,
  initialHasMore,
  initialItems,
  query,
}: UseListingFeedOptions) {
  const cacheKey = buildFeedCacheKey(query);

  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The query the current client state belongs to. Compared against the
  // *query*, never against `initialItems` by reference — `/listings/page.tsx`
  // is force-dynamic and re-fetches on every render, and `router.refresh()`
  // is called from several places in this app. Any of those hands this
  // component a brand-new `initialItems` array for the SAME query, and
  // reacting to that identity change would silently truncate a feed the
  // seeker has already scrolled past page 1 of.
  const currentQueryRef = useRef<string | null>(null);

  // Mirrors the latest props into a ref every render so the query-change
  // effect below can read "the initial page the server just sent" without
  // listing initialItems/initialCursor/initialHasMore in its dependency
  // array — which is what would make it re-fire on the identity churn
  // described above.
  const latestInitialRef = useRef({ initialCursor, initialHasMore, initialItems });
  useEffect(() => {
    latestInitialRef.current = { initialCursor, initialHasMore, initialItems };
  });

  // Mirrors current items/cursor/hasMore/cacheKey into refs so loadMore and
  // the persistence effect below can read the latest values without
  // depending on state that changes on every append (which would otherwise
  // force loadMore to be re-created, or the persist effect to fire, more
  // often than necessary).
  const itemsRef = useRef(items);
  const cursorRef = useRef(cursor);
  const hasMoreRef = useRef(hasMore);
  const cacheKeyRef = useRef(cacheKey);
  useEffect(() => {
    itemsRef.current = items;
    cursorRef.current = cursor;
    hasMoreRef.current = hasMore;
    cacheKeyRef.current = cacheKey;
  });

  // Set when a restore supplies a scrollY to apply once the restored items
  // have actually been committed to the DOM (see the effect below).
  const pendingScrollYRef = useRef<number | null>(null);

  // A synchronous lock for loadMore, independent of the `isLoading` state
  // used for rendering. State updates are asynchronous, so two
  // IntersectionObserver callbacks firing in quick succession could both
  // read `isLoading === false` before the first one's setState commits and
  // both fetch the same page. The ref is set before any `await`, so the
  // second call always sees it.
  const lockRef = useRef(false);

  // Independent, continuously-updated scroll position. Only capturing
  // scrollY when loadMore fires would restore the seeker to wherever page N
  // *resolved*, not to wherever they actually scrolled to afterwards.
  const scrollYRef = useRef(0);

  // Restore-or-reset, decided once per genuine query change. A query change
  // (not an initialItems identity change) is the only thing that means "this
  // is a different feed." Deciding in one place, on one trigger, is what
  // keeps restoration and the reset from racing each other — the previous
  // version had two effects that both fired on mount in the same passive
  // effects flush, and the reset always won because it ran second.
  useEffect(() => {
    if (currentQueryRef.current === query) {
      return;
    }

    currentQueryRef.current = query;

    const {
      initialCursor: latestCursor,
      initialHasMore: latestHasMore,
      initialItems: latestItems,
    } = latestInitialRef.current;

    const parsedSnapshot = readRawSnapshot(cacheKey);

    if (shouldRestoreSnapshot(parsedSnapshot, latestItems.length)) {
      setItems(parsedSnapshot.items);
      setCursor(parsedSnapshot.cursor);
      setHasMore(parsedSnapshot.hasMore);
      pendingScrollYRef.current = parsedSnapshot.scrollY;
    } else {
      setItems(latestItems);
      setCursor(latestCursor);
      setHasMore(latestHasMore);
    }

    setError(null);
  }, [cacheKey, query]);

  // Applies a pending restored scroll position once the restored items have
  // actually rendered, so we scroll against the DOM height they produce
  // rather than the pre-restore (shorter) list.
  useEffect(() => {
    if (pendingScrollYRef.current === null) {
      return;
    }

    const targetScrollY = pendingScrollYRef.current;
    pendingScrollYRef.current = null;

    window.requestAnimationFrame(() => {
      window.scrollTo(0, targetScrollY);
    });
  }, [items]);

  // Tracks scroll position continuously (throttled to one read per frame)
  // rather than only at the moment loadMore happens to fire.
  useEffect(() => {
    let ticking = false;

    function handleScroll() {
      if (ticking) {
        return;
      }

      ticking = true;
      window.requestAnimationFrame(() => {
        scrollYRef.current = window.scrollY;
        ticking = false;
      });
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Persists the latest snapshot when the seeker actually leaves the page
  // (backgrounding, navigating away, closing the tab), so a scroll that
  // happened after the last loadMore is still captured.
  useEffect(() => {
    function persistCurrentSnapshot() {
      persistSnapshot(cacheKeyRef.current, {
        cursor: cursorRef.current,
        hasMore: hasMoreRef.current,
        items: itemsRef.current,
        scrollY: scrollYRef.current,
      });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        persistCurrentSnapshot();
      }
    }

    window.addEventListener("pagehide", persistCurrentSnapshot);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      // Also persist on unmount, not just on pagehide/visibilitychange.
      // Clicking into a listing is a same-document App Router navigation —
      // no full page unload, so neither of those events fires. The feed
      // page's component tree unmounts instead, and this cleanup is the
      // only remaining hook for "the seeker is about to leave the feed."
      // Without it, a scroll that happened after the last loadMore (but
      // before clicking a listing) would be lost, reproducing the original
      // bug through a different door.
      persistCurrentSnapshot();
      window.removeEventListener("pagehide", persistCurrentSnapshot);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (lockRef.current || !hasMore || !cursor) {
      return;
    }

    lockRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams(query);
      params.set("cursor", cursor);

      const response = await fetch(`/api/listings?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Request failed");
      }

      const payload = (await response.json()) as {
        data: ListingListItem[];
        pagination: { hasMore: boolean; nextCursor: string | null };
      };

      const nextItems = [...itemsRef.current, ...payload.data];

      setItems(nextItems);
      setCursor(payload.pagination.nextCursor);
      setHasMore(payload.pagination.hasMore);

      // Computed and persisted outside of any setState updater — updaters
      // must stay pure, and React may invoke them more than once (Strict
      // Mode, replayed renders).
      persistSnapshot(cacheKeyRef.current, {
        cursor: payload.pagination.nextCursor,
        hasMore: payload.pagination.hasMore,
        items: nextItems,
        scrollY: scrollYRef.current,
      });
    } catch {
      setError("We could not load more listings. Check your connection and try again.");
    } finally {
      lockRef.current = false;
      setIsLoading(false);
    }
  }, [cursor, hasMore, query]);

  return { error, hasMore, isLoading, items, loadMore };
}
