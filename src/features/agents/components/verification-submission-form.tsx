"use client";

import { useState } from "react";

export function VerificationSubmissionForm() {
  const [fullLegalName, setFullLegalName] = useState("");
  const [notes, setNotes] = useState("");
  const [documents, setDocuments] = useState("id_card|https://example.com/id");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    const parsedDocuments = documents
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [type, url] = line.split("|");

        return {
          type: type ?? "",
          url: url ?? "",
        };
      });

    const response = await fetch("/api/agent/verification-submissions", {
      body: JSON.stringify({
        documents: parsedDocuments,
        fullLegalName,
        notes,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;

    if (!response.ok) {
      setError(payload?.error?.message ?? "Unable to submit verification.");
      setIsSubmitting(false);
      return;
    }

    setMessage("Verification submitted for review.");
    setIsSubmitting(false);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={onSubmit}>
      <label className="flex flex-col gap-2 text-sm text-stone-700">
        <span>Full legal name</span>
        <input
          className="h-12 rounded-2xl border border-stone-900/10 bg-white px-4"
          onChange={(event) => setFullLegalName(event.target.value)}
          placeholder="Agent legal name"
          value={fullLegalName}
        />
      </label>

      <label className="flex flex-col gap-2 text-sm text-stone-700">
        <span>Documents</span>
        <textarea
          className="min-h-32 rounded-2xl border border-stone-900/10 bg-white px-4 py-3 font-mono text-sm"
          onChange={(event) => setDocuments(event.target.value)}
          placeholder={"id_card|https://...\nlicense|https://..."}
          value={documents}
        />
      </label>

      <label className="flex flex-col gap-2 text-sm text-stone-700">
        <span>Notes</span>
        <textarea
          className="min-h-28 rounded-2xl border border-stone-900/10 bg-white px-4 py-3"
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional explanation for the review team."
          value={notes}
        />
      </label>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <div className="flex justify-end">
        <button
          className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Submitting..." : "Submit verification"}
        </button>
      </div>
    </form>
  );
}
