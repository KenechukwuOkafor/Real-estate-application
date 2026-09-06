"use client";

import { useEffect } from "react";

import { getOrCreateViewSessionId } from "@/features/listings/view-session";

type AgentProfileViewTrackerProps = {
  /**
   * The handle, which is what the endpoint resolves by — the same value the
   * URL carries.
   *
   * Named for what it is rather than taking a generic id, for the reason the
   * listing tracker's prop comment records: that component was handed
   * `listing.id` where the endpoint wanted `public_uuid`, the values never
   * matched, and every view was silently dropped for months while the request
   * answered 200. A handle cannot be confused with a uuid at a glance, which
   * is most of the fix.
   */
  handle: string;
};

export function AgentProfileViewTracker({ handle }: AgentProfileViewTrackerProps) {
  useEffect(() => {
    void fetch(`/api/agents/${handle}/views`, {
      body: JSON.stringify({
        referrer: document.referrer || null,
        // Same session id as listing views use, deliberately: the question
        // this data answers is whether a profile view converts into a listing
        // view, and that comparison needs one identity across both.
        sessionId: getOrCreateViewSessionId(),
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  }, [handle]);

  return null;
}
