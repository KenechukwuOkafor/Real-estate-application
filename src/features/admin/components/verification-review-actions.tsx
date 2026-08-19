"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type VerificationReviewActionsProps = {
  submissionId: string;
};

export function VerificationReviewActions({
  submissionId,
}: VerificationReviewActionsProps) {
  const router = useRouter();
  const [reason, setReason] = useState("Verification evidence was insufficient.");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(action: "approve" | "reject") {
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    const response = await fetch(
      `/api/admin/verification-submissions/${submissionId}/${action}`,
      {
        body: action === "reject" ? JSON.stringify({ reason }) : undefined,
        headers: action === "reject" ? { "Content-Type": "application/json" } : undefined,
        method: "POST",
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;

    if (!response.ok) {
      setError(
        payload?.error?.message ??
          `Unable to ${action} verification submission.`,
      );
      setIsSubmitting(false);
      return;
    }

    setMessage(
      action === "approve"
        ? "Agent verification approved."
        : "Agent verification rejected.",
    );
    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={isSubmitting}
          onClick={() => submit("approve")}
          type="button"
        >
          Approve
        </button>
        <button
          className="rounded-full bg-rose-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={isSubmitting}
          onClick={() => submit("reject")}
          type="button"
        >
          Reject
        </button>
      </div>

      <textarea
        className="min-h-24 rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm"
        onChange={(event) => setReason(event.target.value)}
        value={reason}
      />

      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
    </div>
  );
}
