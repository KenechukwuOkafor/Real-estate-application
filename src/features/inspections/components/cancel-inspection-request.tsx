"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorCopyForResponse } from "@/features/errors/error-copy";

type CancelInspectionRequestProps = {
  agentName: string;
  inspectionRequestId: string;
  /**
   * Whether the agent had already accepted.
   *
   * Withdrawing from something somebody agreed to is a different act from
   * withdrawing a request nobody has answered, and the confirmation says so.
   * The first ends an arrangement another person is holding a slot for; the
   * second ends only the asking.
   */
  wasAccepted: boolean;
};

/**
 * The seeker withdraws.
 *
 * A second step, matching the agent's controls. It is not undoable and the
 * other party sees it, which are the two things that earn a confirmation here.
 *
 * The copy does not apologise on the seeker's behalf or imply they have done
 * something wrong. Not attending is ordinary; the reason this exists at all is
 * that its absence made honest seekers look like absent agents.
 */
export function CancelInspectionRequest({
  agentName,
  inspectionRequestId,
  wasAccepted,
}: CancelInspectionRequestProps) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setIsSubmitting(true);
    setError(null);

    const response = await fetch(
      `/api/inspection-requests/${inspectionRequestId}/cancel`,
      { method: "POST" },
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: string; details?: unknown; message?: string } }
        | null;

      setError(errorCopyForResponse(payload));
      setIsSubmitting(false);
      setIsConfirming(false);
      return;
    }

    setIsSubmitting(false);
    setIsConfirming(false);
    router.refresh();
  }

  if (isConfirming) {
    return (
      <div className="rounded-2xl border border-stone-900/15 bg-stone-50 p-4">
        <p className="text-sm font-semibold text-stone-900">
          {wasAccepted
            ? `Tell ${agentName} you cannot make this inspection?`
            : "Withdraw this request?"}
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-sm leading-6 text-stone-700">
          {wasAccepted ? (
            <li>
              • {agentName} agreed to show you the property. They will see that
              you are no longer coming.
            </li>
          ) : (
            <li>• {agentName} will no longer see this request.</li>
          )}
          <li>• Your conversation stays open either way.</li>
          <li>• You can ask about this property again later.</li>
        </ul>
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => confirm()}
            type="button"
          >
            {isSubmitting
              ? "Cancelling..."
              : wasAccepted
                ? "Yes, I cannot make it"
                : "Yes, withdraw it"}
          </button>
          <button
            className="rounded-full border border-stone-900/15 px-5 py-2.5 text-sm font-medium text-stone-700 disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => setIsConfirming(false)}
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
      <button
        className="self-start rounded-full border border-stone-900/15 bg-white px-4 py-2 text-sm font-medium text-stone-700"
        onClick={() => setIsConfirming(true)}
        type="button"
      >
        {wasAccepted ? "I cannot make it" : "Withdraw this request"}
      </button>
    </div>
  );
}
