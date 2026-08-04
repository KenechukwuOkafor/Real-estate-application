"use client";

import { useAuth } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function useEffectiveAuth() {
  const { isSignedIn } = useAuth();
  const pathname = usePathname();
  const isDevAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH === "true";
  const [hasDevAuth, setHasDevAuth] = useState(false);

  useEffect(() => {
    if (!isDevAuthEnabled || isSignedIn) {
      setHasDevAuth(false);
      return;
    }

    let cancelled = false;

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
      }
    }

    void loadDevAuthState();

    return () => {
      cancelled = true;
    };
  }, [isDevAuthEnabled, isSignedIn, pathname]);

  return {
    isDevAuthEnabled,
    isDevSignedIn: hasDevAuth,
    isSignedIn: isSignedIn || hasDevAuth,
  };
}
