"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorCopyForResponse } from "@/features/errors/error-copy";

type AgentSuspensionControlProps = {
  agentName: string;
  agentProfileId: string;
  suspensionReason: string | null;
  verificationStatus: string;
};

/**
 * Suspend or reinstate the agent behind a listing. ADR-017-A1.
 *
 * Suspension hides the agent from seekers and stops them submitting listings or
 * changes; their conversations and inspections continue. The confirmation says
 * so, because a moderator who believes suspension cuts the agent off entirely
 * might reach for it in the wrong case — or hesitate in the right one.
 *
 * Two steps on purpose: the reason box opens first and is empty, like the
 * listing reasons. The agent reads it verbatim, so there is no stock sentence
 * to accept on a hurried click.
 */
export function AgentSuspensionControl({
  agentName,
  agentProfileId,
  suspensionReason,
  verificationStatus,
}: AgentSuspensionControlProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function send(action: "suspend" | "reinstate") {
    setIsSubmitting(true);
    setError(null);

    const response = await fetch(`/api/admin/agents/${agentProfileId}/${action}`, {
      body: action === "suspend" ? JSON.stringify({ reason }) : undefined,
      headers: action === "suspend" ? { "Content-Type": "application/json" } : undefined,
      method: "POST",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: string; message?: string } }
        | null;
      setError(errorCopyForResponse(payload));
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setOpen(false);
    setReason("");
    router.refresh();
  }

  if (verificationStatus === "suspended") {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950">
        <p>
          <span className="font-semibold">{agentName} is suspended.</span>{" "}
          {suspensionReason ? `“${suspensionReason}”` : "No reason was recorded."}
        </p>
        <button
          className="self-start rounded-full border border-rose-300 bg-white px-4 py-2 font-medium text-rose-900 disabled:opacity-60"
          disabled={isSubmitting}
          onClick={() => send("reinstate")}
          type="button"
        >
          {isSubmitting ? "Reinstating…" : "Reinstate"}
        </button>
        {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      </div>
    );
  }

  if (verificationStatus !== "verified") {
    // Only a verified agent can be suspended (0044). Refusing verification is
    // the action for anyone else, and it lives on the verification page.
    return null;
  }

  if (!open) {
    return (
      <button
        className="self-start text-sm font-medium text-stone-600 underline underline-offset-4"
        onClick={() => setOpen(true)}
        type="button"
      >
        Suspend {agentName}…
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm">
      <p className="text-stone-700">
        Suspending hides {agentName} and all their listings from seekers, and stops them
        submitting listings or changes. Their conversations and inspections carry on.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className="font-medium text-stone-800">Reason the agent will read</span>
        <textarea
          className="min-h-20 rounded-2xl border border-stone-900/10 bg-white px-4 py-3"
          onChange={(event) => setReason(event.target.value)}
          placeholder="Required. Say what happened and what would resolve it — the agent sees exactly this."
          value={reason}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-full bg-rose-700 px-4 py-2 font-medium text-white disabled:opacity-60"
          disabled={isSubmitting}
          onClick={() => send("suspend")}
          type="button"
        >
          {isSubmitting ? "Suspending…" : `Suspend ${agentName}`}
        </button>
        <button
          className="rounded-full border border-stone-900/15 bg-white px-4 py-2 font-medium text-stone-700"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          type="button"
        >
          Cancel
        </button>
      </div>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
