"use client";

import { SignOutButton } from "@clerk/nextjs";

/**
 * Sign out, as an ordinary row on the Account screen.
 *
 * Clerk owns the actual sign-out — including for the dev personas, which are
 * real Clerk sessions. This is only the control, placed where somebody would
 * look for it now that the header avatar has gone.
 */
export function PortalSignOutButton() {
  return (
    <SignOutButton redirectUrl="/">
      <button
        className="w-full rounded-2xl border border-stone-900/15 px-5 py-3 text-left text-sm font-medium text-stone-700 transition-colors hover:bg-stone-900/5"
        type="button"
      >
        Sign out
      </button>
    </SignOutButton>
  );
}
