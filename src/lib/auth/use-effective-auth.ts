"use client";

import { useAuth } from "@clerk/nextjs";

/**
 * Thin pass-through over Clerk's useAuth.
 *
 * This used to blend two auth states: Clerk's, and a dev-auth one discovered by
 * probing /api/me for a fabricated cookie session. That second state is gone —
 * dev personas hold real Clerk sessions — so there is nothing left to blend.
 *
 * Kept as a named hook rather than inlining useAuth at each call site because
 * the comment below is the part that matters and is easy to lose.
 */
export function useEffectiveAuth() {
  const { isLoaded, isSignedIn } = useAuth();

  return {
    // Clerk reports isSignedIn === undefined until it hydrates. Callers that
    // gate a state-changing action (e.g. save) on isSignedIn must also check
    // isLoaded, or they will treat a genuinely signed-in user as signed-out
    // during that window.
    isLoaded,
    isSignedIn: Boolean(isSignedIn),
  };
}
