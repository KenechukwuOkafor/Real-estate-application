"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorCopyForResponse } from "@/features/errors/error-copy";

type RespondToInspectionProps = {
  inspectionRequestId: string;
  listingTitle: string;
  requesterName: string;
};

type Pending = "accepted" | "declined" | null;

/**
 * Accept or decline, with the consequence said first.
 *
 * Accepting is not an acknowledgement. It opens a conversation the seeker can
 * see and treats the visit as agreed — and under ADR-031 it will also hand over
 * the exact address, which cannot be taken back once sent. That makes it worth
 * a second step even though it costs a click, and it means the confirmation has
 * to say what happens rather than ask "are you sure?", which tells nobody
 * anything.
 *
 * An inline panel rather than window.confirm: a native dialog cannot name the
 * listing or the seeker, and this is a list where the wrong row is one pixel
 * away.
 */
export function RespondToInspection({
  inspectionRequestId,
  listingTitle,
  requesterName,
}: RespondToInspectionProps) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(decision: "accepted" | "declined") {
    setIsSubmitting(true);
    setError(null);

    const response = await fetch(
      `/api/inspection-requests/${inspectionRequestId}/respond`,
      {
        body: JSON.stringify({ decision }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: string; details?: unknown; message?: string } }
        | null;

      setError(errorCopyForResponse(payload));
      setIsSubmitting(false);
      setPending(null);
      return;
    }

    setIsSubmitting(false);
    setPending(null);
    // The row's status, its countdown and the whole list's ordering are all
    // server-derived, so the server is the thing to re-ask.
    router.refresh();
  }

  if (pending === "accepted") {
    return (
      <div className="rounded-2xl border border-stone-900/15 bg-stone-50 p-4">
        <p className="text-sm font-semibold text-stone-900">
          Accepting opens the chat with {requesterName}
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-sm leading-6 text-stone-700">
          <li>• They can message you about {listingTitle} straight away.</li>
          <li>• They will be given the exact address of the property.</li>
          <li>
            • You are agreeing to meet them there. Only accept if you can show
            them the property.
          </li>
        </ul>
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => confirm("accepted")}
            type="button"
          >
            {isSubmitting ? "Accepting..." : "Yes, accept and open the chat"}
          </button>
          <button
            className="rounded-full border border-stone-900/15 px-5 py-2.5 text-sm font-medium text-stone-700 disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => setPending(null)}
            type="button"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (pending === "declined") {
    return (
      <div className="rounded-2xl border border-stone-900/15 bg-stone-50 p-4">
        <p className="text-sm font-semibold text-stone-900">
          Decline this request?
        </p>
        <p className="mt-2 text-sm leading-6 text-stone-700">
          {requesterName} will be told you are not available for this one. No
          chat is opened and your address is not shared. They can ask again
          later.
        </p>
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => confirm("declined")}
            type="button"
          >
            {isSubmitting ? "Declining..." : "Yes, decline"}
          </button>
          <button
            className="rounded-full border border-stone-900/15 px-5 py-2.5 text-sm font-medium text-stone-700 disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => setPending(null)}
            type="button"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white"
          onClick={() => setPending("accepted")}
          type="button"
        >
          Accept
        </button>
        <button
          className="rounded-full border border-stone-900/15 px-5 py-2.5 text-sm font-medium text-stone-700"
          onClick={() => setPending("declined")}
          type="button"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
