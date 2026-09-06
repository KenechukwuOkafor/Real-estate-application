"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";

import { errorCopyForResponse } from "@/features/errors/error-copy";
import { createSupabaseBrowserClient } from "@/lib/db/supabase/browser";

type AgentAvatarFormProps = {
  initialAvatarUrl: string | null;
};

/**
 * The MIME allowlist the bucket enforces (0039).
 *
 * Repeated here to give the agent a sentence instead of a storage error, not
 * to be the enforcement. The bucket refuses anything else regardless of what
 * this input accepts, which is the point of putting the limit there.
 */
const ACCEPTED = "image/jpeg,image/png,image/webp";

/** 2 MB, matching the bucket. Same relationship: message here, refusal there. */
const MAX_BYTES = 2 * 1024 * 1024;

export function AgentAvatarForm({ initialAvatarUrl }: AgentAvatarFormProps) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError(null);

    if (file.size > MAX_BYTES) {
      setError("That photo is over 2 MB. Try a smaller one.");
      return;
    }

    setIsBusy(true);

    // 1. A signed target under this agent's own prefix.
    const targetResponse = await fetch("/api/agent/avatar/upload-url", {
      body: JSON.stringify({ contentType: file.type, fileName: file.name }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const targetPayload = (await targetResponse.json().catch(() => null)) as
      | { data?: { path: string; token: string }; error?: { message?: string } }
      | null;

    if (!targetResponse.ok || !targetPayload?.data) {
      setError(errorCopyForResponse(targetPayload));
      setIsBusy(false);
      return;
    }

    // 2. Straight into the private bucket. The token is the only thing that
    //    authorises this path, and it was issued for this profile's folder.
    const supabase = createSupabaseBrowserClient();
    const uploaded = await supabase.storage
      .from("agent-avatars")
      .uploadToSignedUrl(targetPayload.data.path, targetPayload.data.token, file, {
        contentType: file.type,
      });

    if (uploaded.error) {
      setError(`Upload rejected: ${uploaded.error.message}`);
      setIsBusy(false);
      return;
    }

    // 3. Adopt it. The server checks the object is really there before storing
    //    the pointer, so a failed upload cannot leave a broken picture on the
    //    public page.
    const saveResponse = await fetch("/api/agent/avatar", {
      body: JSON.stringify({ avatarPath: targetPayload.data.path }),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    });
    const savePayload = (await saveResponse.json().catch(() => null)) as
      | { data?: { avatarPath: string | null }; error?: { message?: string } }
      | null;

    if (!saveResponse.ok) {
      setError(errorCopyForResponse(savePayload));
      setIsBusy(false);
      return;
    }

    // Reload rather than guessing a URL: the object is in a private bucket and
    // only the server can sign a readable link to it.
    window.location.reload();
  }

  async function clear() {
    setIsBusy(true);
    setError(null);

    const response = await fetch("/api/agent/avatar", { method: "DELETE" });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(errorCopyForResponse(payload));
      setIsBusy(false);
      return;
    }

    setAvatarUrl(null);
    setIsBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      {avatarUrl ? (
        <img
          alt=""
          className="h-20 w-20 rounded-full object-cover"
          src={avatarUrl}
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-20 w-20 items-center justify-center rounded-full bg-[linear-gradient(135deg,_#d9d2c4,_#ece6d8)] text-sm uppercase tracking-[0.2em] text-stone-600"
        >
          Ruvo
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={isBusy}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {isBusy ? "Working..." : avatarUrl ? "Change photo" : "Add a photo"}
          </button>
          {avatarUrl ? (
            <button
              className="rounded-full border border-stone-900/10 px-4 py-2 text-sm font-medium text-stone-700 disabled:opacity-60"
              disabled={isBusy}
              onClick={clear}
              type="button"
            >
              Remove
            </button>
          ) : null}
        </div>
        {/*
          Says what to expect rather than what to supply. Most agents will use
          a shop logo, and the honest instruction is that it will be cropped to
          a circle — not a specification nobody can meet from a phone.
        */}
        <p className="text-xs leading-5 text-stone-600">
          JPG, PNG or WebP, up to 2 MB. It is shown as a circle, so anything
          near the edges gets cropped.
        </p>
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      </div>

      <input
        accept={ACCEPTED}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
        ref={inputRef}
        type="file"
      />
    </div>
  );
}
