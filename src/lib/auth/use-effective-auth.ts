"use client";

import { useAuth } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function useEffectiveAuth() {
  const { isLoaded: isClerkLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();
  const isDevAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH === "true";
  const [hasDevAuth, setHasDevAuth] = useState(false);
  // Settled state for the dev-auth check specifically, separate from
  // Clerk's own isLoaded. Starts true when dev auth is off (there is
  // nothing to check), so isLoaded below does not wait forever on a check
  // that will never run.
  const [isDevAuthChecked, setIsDevAuthChecked] = useState(!isDevAuthEnabled);

  useEffect(() => {
    if (!isDevAuthEnabled || isSignedIn) {
      setIsDevAuthChecked(true);
      return;
    }

    let cancelled = false;
    setIsDevAuthChecked(false);

    async function loadDevAuthState() {
      try {
        const response = await fetch("/api/me", {
          cache: "no-store",
          credentials: "same-origin",
        });

        if (!cancelled) {
          setHasDevAuth(response.ok);
        }
      } catch {
        if (!cancelled) {
          setHasDevAuth(false);
        }
      } finally {
        if (!cancelled) {
          setIsDevAuthChecked(true);
        }
      }
    }

    void loadDevAuthState();

    return () => {
      cancelled = true;
    };
  }, [isDevAuthEnabled, isSignedIn, pathname]);

  const isDevSignedIn = isDevAuthEnabled && !isSignedIn && hasDevAuth;

  return {
    isDevAuthEnabled,
    isDevSignedIn,
    // Clerk reports isSignedIn === undefined until it hydrates. Callers that
    // gate a state-changing action (e.g. save) on isSignedIn must also check
    // isLoaded, or they will treat a genuinely signed-in user as signed-out
    // during that window.
    isLoaded: isClerkLoaded && isDevAuthChecked,
    isSignedIn: isSignedIn || isDevSignedIn,
  };
}
