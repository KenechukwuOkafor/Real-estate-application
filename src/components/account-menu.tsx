"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SignInButton, UserButton } from "@clerk/nextjs";

import { useEffectiveAuth } from "@/lib/auth/use-effective-auth";

export function AccountMenu() {
  const router = useRouter();
  const { isDevSignedIn, isSignedIn } = useEffectiveAuth();
  const [isOpen, setIsOpen] = useState(false);

  async function signOutDevUser() {
    await fetch("/api/dev-auth/logout", { method: "POST" });
    setIsOpen(false);
    router.push("/");
    router.refresh();
  }

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <button
          aria-label="Sign in"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition-colors hover:bg-stone-200"
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
    );
  }

  // Clerk owns the menu for real sessions; the dev harness needs its own.
  if (!isDevSignedIn) {
    return <UserButton />;
  }

  return (
    <div className="relative">
      <button
        aria-expanded={isOpen}
        aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-600"
        onClick={() => setIsOpen((current) => !current)}
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

      {isOpen ? (
        <div className="absolute right-0 top-11 z-50 w-44 rounded-2xl border border-stone-900/10 bg-white p-2 shadow-lg">
          <Link
            className="block rounded-xl px-3 py-2 text-sm text-stone-800 hover:bg-stone-50"
            href="/dashboard"
            onClick={() => setIsOpen(false)}
          >
            Dashboard
          </Link>
          <Link
            className="block rounded-xl px-3 py-2 text-sm text-stone-800 hover:bg-stone-50"
            href="/chats"
            onClick={() => setIsOpen(false)}
          >
            Chats
          </Link>
          <button
            className="block w-full rounded-xl px-3 py-2 text-left text-sm text-stone-800 hover:bg-stone-50"
            onClick={signOutDevUser}
            type="button"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
