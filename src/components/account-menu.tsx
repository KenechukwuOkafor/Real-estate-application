"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";

import { useEffectiveAuth } from "@/lib/auth/use-effective-auth";

const DashboardIcon = (
  <svg
    aria-hidden="true"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    viewBox="0 0 24 24"
  >
    <rect height="7" rx="1.5" width="7" x="3.5" y="3.5" />
    <rect height="7" rx="1.5" width="7" x="13.5" y="3.5" />
    <rect height="7" rx="1.5" width="7" x="3.5" y="13.5" />
    <rect height="7" rx="1.5" width="7" x="13.5" y="13.5" />
  </svg>
);

const ChatsIcon = (
  <svg
    aria-hidden="true"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    viewBox="0 0 24 24"
  >
    <path
      d="M4 5.5h16v10a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5V17H5.5A1.5 1.5 0 0 1 4 15.5v-10Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function AccountMenu() {
  const router = useRouter();
  const { isSignedIn } = useEffectiveAuth();

  // `page.tsx` branches signed-in vs signed-out server-side via
  // getAuthContext(). SignInButton resolves client-side, so nothing tells
  // that server component to re-render when Clerk flips from signed-out to
  // signed-in mid-session — the header updates to UserButton but the body
  // keeps showing the signed-out hero until a hard reload. Watch Clerk's own
  // isSignedIn (not the dev-auth-blended one from useEffectiveAuth) and
  // force a refresh on that specific transition.
  const { isSignedIn: isClerkSignedIn } = useAuth();
  const previousClerkSignedInRef = useRef(isClerkSignedIn);

  useEffect(() => {
    if (
      previousClerkSignedInRef.current === false &&
      isClerkSignedIn === true
    ) {
      router.refresh();
    }

    previousClerkSignedInRef.current = isClerkSignedIn;
  }, [isClerkSignedIn, router]);

  if (!isSignedIn) {
    return (
      <div className="flex items-center gap-1.5">
        <SignUpButton mode="modal">
          <button
            className="whitespace-nowrap rounded-full bg-stone-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-stone-800"
            type="button"
          >
            Get started
          </button>
        </SignUpButton>

        <SignInButton mode="modal">
          <button
            aria-label="Sign in"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition-colors hover:bg-stone-200"
            type="button"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 19c1.6-3.2 4-4.8 7-4.8s5.4 1.6 7 4.8" strokeLinecap="round" />
            </svg>
          </button>
        </SignInButton>
      </div>
    );
  }

  // Clerk owns the menu for every session, including dev personas — they are
  // real Clerk sessions now, so there is no bespoke harness menu to maintain
  // and sign-out is Clerk's.
  return (
    <UserButton>
      <UserButton.MenuItems>
        <UserButton.Link href="/dashboard" label="Dashboard" labelIcon={DashboardIcon} />
        <UserButton.Link href="/chats" label="Chats" labelIcon={ChatsIcon} />
      </UserButton.MenuItems>
    </UserButton>
  );
}
