"use client";

import Link from "next/link";

import {
  SignInButton,
  SignUpButton,
  useAuth,
  UserButton,
} from "@clerk/nextjs";

export function AppShellHeader() {
  const { isSignedIn } = useAuth();

  return (
    <header className="border-b border-stone-900/10 bg-white/75 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight text-stone-900">
          Ruvo
        </Link>

        <nav className="flex items-center gap-3 text-sm">
          <Link
            className="rounded-full px-4 py-2 text-stone-700 transition-colors hover:bg-stone-100"
            href="/listings"
          >
            Listings
          </Link>

          {!isSignedIn ? (
            <>
            <SignInButton mode="modal">
              <button className="rounded-full border border-stone-900/10 bg-white px-4 py-2 font-medium text-stone-800">
                Sign in
              </button>
            </SignInButton>

            <SignUpButton mode="modal">
              <button className="rounded-full bg-stone-900 px-4 py-2 font-medium text-white">
                Create account
              </button>
            </SignUpButton>
            </>
          ) : null}

          {isSignedIn ? (
            <>
            <Link
              className="rounded-full border border-stone-900/10 bg-white px-4 py-2 font-medium text-stone-800"
              href="/dashboard"
            >
              Dashboard
            </Link>
            <UserButton />
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
