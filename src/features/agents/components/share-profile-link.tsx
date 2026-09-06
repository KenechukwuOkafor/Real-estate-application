"use client";

import { useState } from "react";

type ShareProfileLinkProps = {
  url: string;
};

/**
 * The share affordance, and it is the reason this page exists.
 *
 * The URL is shown in full rather than hidden behind a button. An agent about
 * to paste something into a WhatsApp bio wants to SEE what they are pasting —
 * a bare "Copy link" gives them no way to check it says their business name,
 * which is the whole argument for a handle over a uuid.
 */
export function ShareProfileLink({ url }: ShareProfileLinkProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Older Android WebViews and any non-secure context. The agents this is
      // for are disproportionately on exactly those, so the fallback is not
      // decoration.
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-900/10 bg-stone-50 p-2 pl-4">
      <span className="min-w-0 flex-1 truncate font-mono text-sm text-stone-700">
        {url.replace(/^https?:\/\//, "")}
      </span>
      <button
        className="shrink-0 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white"
        onClick={copy}
        type="button"
      >
        {copied ? "Copied ✓" : "Copy link"}
      </button>
    </div>
  );
}
