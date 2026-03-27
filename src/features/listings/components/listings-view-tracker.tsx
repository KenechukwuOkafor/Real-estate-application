"use client";

import { useEffect } from "react";

type ListingsViewTrackerProps = {
  listingId: string;
};

export function ListingViewTracker({ listingId }: ListingsViewTrackerProps) {
  useEffect(() => {
    void fetch(`/api/listings/${listingId}/views`, {
      body: JSON.stringify({
        referrer: document.referrer || null,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  }, [listingId]);

  return null;
}
