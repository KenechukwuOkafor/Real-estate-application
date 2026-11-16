"use client";

import { useState } from "react";

import { SupportWhatsAppLink } from "@/components/support-whatsapp-link";
import {
  errorCopyForResponse,
  supportTopicForResponse,
} from "@/features/errors/error-copy";
import type { SupportTopic } from "@/lib/support-contact";

type SubmitListingReviewButtonProps = {
  listingId: string;
};

export function SubmitListingReviewButton({
  listingId,
}: SubmitListingReviewButtonProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supportTopic, setSupportTopic] = useState<SupportTopic | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onClick() {
    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    setSupportTopic(null);

    const response = await fetch(`/api/agent/listings/${listingId}/submit`, {
      method: "POST",
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;

    if (!response.ok) {
      // Five separate gates can refuse a submission — profile, verification,
      // state, photo count and entitlement — and each has its own code, so the
      // copy names the one that actually fired instead of a generic refusal.
      setError(errorCopyForResponse(payload));
      // A suspended agent's refusal says "message us on WhatsApp"; this is the
      // link that makes that sentence true.
      setSupportTopic(supportTopicForResponse(payload));
      setIsSubmitting(false);
      return;
    }

    setMessage("Listing submitted for review.");
    setIsSubmitting(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        className="self-start rounded-full bg-action px-4 py-2 text-sm font-medium text-on-action disabled:opacity-60"
        disabled={isSubmitting}
        onClick={onClick}
        type="button"
      >
        {isSubmitting ? "Submitting..." : "Submit for review"}
      </button>
      {error ? <p className="text-xs text-fix">{error}</p> : null}
      {error && supportTopic ? (
        <SupportWhatsAppLink
          className="text-xs font-medium text-fix-strong underline underline-offset-4"
          topic={supportTopic}
        />
      ) : null}
      {message ? <p className="text-xs text-verified">{message}</p> : null}
    </div>
  );
}
