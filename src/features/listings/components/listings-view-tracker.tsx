"use client";

import { useEffect } from "react";

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
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  }, [publicId]);

  return null;
}
