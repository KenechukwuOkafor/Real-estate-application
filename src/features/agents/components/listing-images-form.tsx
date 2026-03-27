"use client";

import { useState } from "react";

type ListingImagesFormProps = {
  listingId: string;
};

export function ListingImagesForm({ listingId }: ListingImagesFormProps) {
  const [rows, setRows] = useState(
    "https://example.com/cover.webp|seed/path/cover.webp|image/webp|180000",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    const images = rows
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [publicUrl, storagePath, mimeType, sizeBytes] = line.split("|");

        return {
          mimeType: mimeType ?? "",
          position: index,
          publicUrl: publicUrl ?? "",
          sizeBytes: Number(sizeBytes ?? "0"),
          storagePath: storagePath ?? "",
        };
      });

    const response = await fetch(`/api/agent/listings/${listingId}/images`, {
      body: JSON.stringify({ images }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const payload = (await response.json().catch(() => null)) as
      | { data?: { count?: number }; error?: { message?: string } }
      | null;

    if (!response.ok) {
      setError(payload?.error?.message ?? "Unable to register listing images.");
      setIsSubmitting(false);
      return;
    }

    setMessage(`Images registered. Active image count: ${payload?.data?.count ?? 0}.`);
    setIsSubmitting(false);
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <textarea
        className="min-h-28 rounded-2xl border border-stone-900/10 bg-white px-4 py-3 font-mono text-xs"
        onChange={(event) => setRows(event.target.value)}
        placeholder="publicUrl|storagePath|mimeType|sizeBytes"
        value={rows}
      />
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
      <button
        className="self-start rounded-full border border-stone-900/10 bg-white px-4 py-2 text-sm font-medium text-stone-800 disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Adding..." : "Register images"}
      </button>
    </form>
  );
}
