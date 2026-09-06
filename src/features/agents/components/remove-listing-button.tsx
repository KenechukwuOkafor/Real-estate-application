"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorCopyForResponse } from "@/features/errors/error-copy";

type RemoveListingButtonProps = {
  listingId: string;
  listingTitle: string;
};

/**
 * "Remove listing" — permanent, and now labelled as such.
 *
 * IT USED TO SAY "MARK AS RENTED", and it archived. Archived is terminal at
 * the database, so an agent whose property was simply let destroyed the
 * listing and spent another submission slot to put it back up. The button was
 * the most expensive lie in the portal, and this file is half of the fix; the
 * other half is MarkTakenButton, which does what this one claimed to.
 *
 * Two steps, and the second one is the point. This is irreversible, it does not
 * return the submission slot, and relisting means creating the listing again
 * from nothing. An agent who discovers all of that afterwards has been misled by
 * a button, so the confirmation says it before rather than a toast saying it
 * after.
 *
 * The confirmation is rendered inline rather than through window.confirm: a
 * native dialog cannot say four sentences legibly, and it reads as a
 * formality — which is exactly the wrong register for something that cannot be
 * undone.
 */
export function RemoveListingButton({
  listingId,
  listingTitle,
}: RemoveListingButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setIsRemoving(true);
    setError(null);

    const response = await fetch(`/api/agent/listings/${listingId}/archive`, {
      method: "POST",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;

      setError(errorCopyForResponse(payload));
      setIsRemoving(false);
      return;
    }

    setIsRemoving(false);
    setConfirming(false);
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        className="rounded-full border border-stone-900/15 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition-colors hover:bg-stone-50"
        onClick={() => setConfirming(true)}
        type="button"
      >
        Remove listing
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-950">
        Remove “{listingTitle}” for good?
      </p>

      {/*
        Three separate consequences, listed rather than run together, because
        the third one is the expensive surprise and it is the one most likely to
        be skimmed past in a paragraph.
      */}
      <ul className="mt-3 flex flex-col gap-1.5 text-sm leading-6 text-amber-900">
        <li>• Seekers will no longer see it. It disappears from search straight away.</li>
        <li>• This cannot be undone.</li>
        <li>
          • To list this property again you will need to create a new listing,
          which uses another submission slot.
        </li>
        {/*
          The fourth bullet, and the one that exists because this button used
          to be the only option. An agent whose property was merely let has a
          free, reversible action available and should be sent to it rather
          than talked out of this one in the abstract.
        */}
        <li>
          • If the place is just let for now, use{" "}
          <strong className="font-semibold">Mark as taken</strong> instead — it
          is free, reversible, and keeps the listing.
        </li>
      </ul>

      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={isRemoving}
          onClick={onConfirm}
          type="button"
        >
          {isRemoving ? "Removing..." : "Yes, remove it"}
        </button>
        <button
          className="rounded-full border border-stone-900/15 bg-white px-4 py-2 text-sm font-medium text-stone-700 disabled:opacity-60"
          disabled={isRemoving}
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          type="button"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
