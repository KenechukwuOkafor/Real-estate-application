"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useEffectiveAuth } from "@/lib/auth/use-effective-auth";

type SaveListingButtonProps = {
  listingPublicId: string;
  listingTitle: string;
};

export function SaveListingButton({
  listingPublicId,
  listingTitle,
}: SaveListingButtonProps) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useEffectiveAuth();
  // No savedByViewer field exists on the listing payload, so the control always
  // starts unfilled. A signed-in user who already saved this listing will see
  // it unfilled until they tap. Fixing that needs a new endpoint.
  const [isSaved, setIsSaved] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function toggleSaved() {
    if (!isLoaded) {
      // Clerk reports isSignedIn === undefined until it hydrates. Routing on
      // an unsettled value would treat a genuinely signed-in user as
      // signed-out and bounce them out of the feed via /onboarding. Do
      // nothing rather than guess — the control stays visible and tappable
      // again the moment auth settles.
      return;
    }

    if (!isSignedIn) {
      // Tapping save is the moment to ask for an account — never on arrival.
      router.push("/onboarding");
      return;
    }

    setIsPending(true);
    const nextSaved = !isSaved;
    setIsSaved(nextSaved);

    try {
      const response = await fetch(
        nextSaved
          ? "/api/saved-listings"
          : `/api/saved-listings/${listingPublicId}`,
        {
          body: nextSaved ? JSON.stringify({ listingId: listingPublicId }) : null,
          headers: { "Content-Type": "application/json" },
          method: nextSaved ? "POST" : "DELETE",
        },
      );

      if (!response.ok) {
        setIsSaved(!nextSaved);
      }
    } catch {
      setIsSaved(!nextSaved);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <button
      aria-label={isSaved ? `Remove ${listingTitle} from saved` : `Save ${listingTitle}`}
      aria-pressed={isSaved}
      className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-stone-700 shadow-sm backdrop-blur transition-colors hover:bg-white disabled:opacity-60"
      disabled={isPending}
      onClick={toggleSaved}
      type="button"
    >
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        fill={isSaved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.8}
        viewBox="0 0 24 24"
      >
        <path
          d="M12 20.3 4.6 13a4.6 4.6 0 1 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
