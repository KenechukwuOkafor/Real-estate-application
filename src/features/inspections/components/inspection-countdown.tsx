"use client";

import { useEffect, useState } from "react";

import {
  formatTimeRemaining,
  minutesRemaining,
} from "@/features/inspections/expiry";

type InspectionCountdownProps = {
  expiresAt: string;
  /**
   * What the server computed, rendered first.
   *
   * Recomputing on the client during the initial render would produce different
   * text from the server's and trip hydration. The server's number is correct at
   * the moment the page was built; this component's job is to stop it going
   * stale, not to disagree with it.
   */
  initialLabel: string;
};

/**
 * A countdown that stays true while the page is open.
 *
 * The deadline is evaluated on read, and a page left open on a desk is a read
 * that happened hours ago. Without this, an agent glancing at a tab from this
 * morning would see "3 hours left" on a request that expired at lunchtime, and
 * would click accept on the strength of it.
 *
 * A minute is the right interval because the text is coarse — it changes at
 * most once a minute, and only in the last hour does it change that often.
 */
export function InspectionCountdown({
  expiresAt,
  initialLabel,
}: InspectionCountdownProps) {
  const [label, setLabel] = useState(initialLabel);

  useEffect(() => {
    function recompute() {
      const remaining = minutesRemaining({
        expires_at: expiresAt,
        status: "requested",
      });

      setLabel(formatTimeRemaining(remaining) ?? "Expired");
    }

    recompute();
    const timer = window.setInterval(recompute, 60_000);

    return () => window.clearInterval(timer);
  }, [expiresAt]);

  return (
    <span
      className={
        label === "Expired"
          ? "text-sm font-medium text-stone-500"
          : "text-sm font-medium text-amber-800"
      }
    >
      {label}
    </span>
  );
}
