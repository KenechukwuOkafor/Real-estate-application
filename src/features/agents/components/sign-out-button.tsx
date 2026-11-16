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
        className="w-full rounded-tile border border-line-strong px-5 py-3 text-left text-sm font-medium text-body transition-colors hover:bg-line-faint"
        type="button"
      >
        Sign out
      </button>
    </SignOutButton>
  );
}
