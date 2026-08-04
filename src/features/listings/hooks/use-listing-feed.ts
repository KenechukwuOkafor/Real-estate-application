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

function readSnapshot(key: string): FeedSnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as FeedSnapshot) : null;
  } catch {
    return null;
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
  const hasRestored = useRef(false);

  // Restore appended pages and scroll position when returning from a detail
  // page. The router restores scroll for server-rendered content only; pages
  // this hook appended are client state and would otherwise be lost.
  useEffect(() => {
    if (hasRestored.current) {
      return;
    }

    hasRestored.current = true;
    const snapshot = readSnapshot(cacheKey);

    if (!snapshot || snapshot.items.length <= initialItems.length) {
      return;
    }

    setItems(snapshot.items);
    setCursor(snapshot.cursor);
    setHasMore(snapshot.hasMore);

    window.requestAnimationFrame(() => {
      window.scrollTo(0, snapshot.scrollY);
    });
  }, [cacheKey, initialItems.length]);

  // Reset when the filter query changes — a different filter set is a
  // different feed, and must not inherit the previous one's pages.
  useEffect(() => {
    hasRestored.current = false;
    setItems(initialItems);
    setCursor(initialCursor);
    setHasMore(initialHasMore);
    setError(null);
  }, [initialCursor, initialHasMore, initialItems, query]);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore || !cursor) {
      return;
    }

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

      setItems((current) => {
        const next = [...current, ...payload.data];

        try {
          window.sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              cursor: payload.pagination.nextCursor,
              hasMore: payload.pagination.hasMore,
              items: next,
              scrollY: window.scrollY,
            } satisfies FeedSnapshot),
          );
        } catch {
          // sessionStorage can be full or blocked; restoration is a nicety,
          // never a reason to break the feed.
        }

        return next;
      });

      setCursor(payload.pagination.nextCursor);
      setHasMore(payload.pagination.hasMore);
    } catch {
      setError("We could not load more listings. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [cacheKey, cursor, hasMore, isLoading, query]);

  return { error, hasMore, isLoading, items, loadMore };
}
