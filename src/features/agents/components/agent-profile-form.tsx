"use client";

import { useState } from "react";

type AgentProfileFormProps = {
  initialBio?: string | null;
  initialDisplayName?: string;
};

export function AgentProfileForm({
  initialBio,
  initialDisplayName,
}: AgentProfileFormProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  const [bio, setBio] = useState(initialBio ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    setError(null);

    const response = await fetch("/api/agent/profile", {
      body: JSON.stringify({ bio, displayName }),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;

    if (!response.ok) {
      setError(payload?.error?.message ?? "Unable to save agent profile.");
      setIsSaving(false);
      return;
    }

    setMessage("Agent profile saved.");
    setIsSaving(false);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={onSubmit}>
      <label className="flex flex-col gap-2 text-sm text-stone-700">
        <span>Display name</span>
        <input
          className="h-12 rounded-2xl border border-stone-900/10 bg-white px-4"
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Prime Homes Nsukka"
          value={displayName}
        />
      </label>

      <label className="flex flex-col gap-2 text-sm text-stone-700">
        <span>Bio</span>
        <textarea
          className="min-h-32 rounded-2xl border border-stone-900/10 bg-white px-4 py-3"
          onChange={(event) => setBio(event.target.value)}
          placeholder="Briefly describe your rental focus and service area."
          value={bio}
        />
      </label>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <div className="flex justify-end">
        <button
          className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
          disabled={isSaving}
          type="submit"
        >
          {isSaving ? "Saving..." : "Save profile"}
        </button>
      </div>
    </form>
  );
}
