"use client";

import { useEffect } from "react";

import { getOrCreateViewSessionId } from "@/features/listings/view-session";

type ListingsViewTrackerProps = {
  /**
   * The listing's `public_uuid`, NOT its primary key.
   *
   * These are both UUIDs and both live on the same row, which is exactly why
   * this went wrong: the page passed `listing.id`, the endpoint resolves by
   * `public_uuid`, the values never matched, and every view was silently
   * dropped for months while the request returned HTTP 200.
   *
   * The prop is named for the column so the call site has to say which UUID it
   * means. Passing the primary key here records nothing and reports success.
   */
  publicId: string;
};

export function ListingViewTracker({ publicId }: ListingsViewTrackerProps) {
  useEffect(() => {
    void fetch(`/api/listings/${publicId}/views`, {
      body: JSON.stringify({
        referrer: document.referrer || null,
        // The column has existed since 0001 and been null on every row. Without
        // it a refresh is a second person, and the per-listing conversion ratio
        // — the most actionable number on the agent dashboard — divides requests
        // by page loads instead of by people. See 0033.
        sessionId: getOrCreateViewSessionId(),
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  }, [publicId]);

  return null;
}
