"use client";

import Link from "next/link";

import { SignInButton, SignUpButton, useAuth } from "@clerk/nextjs";

export function HomeHeroActions() {
  const { isSignedIn } = useAuth();

  if (isSignedIn) {
    return (
      <div className="flex flex-wrap gap-3">
        <Link
          className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white"
          href="/listings"
        >
          Browse listings
        </Link>
        <Link
          className="rounded-full border border-stone-900/10 bg-white px-5 py-3 text-sm font-medium text-stone-800"
          href="/dashboard"
        >
          Continue to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Link
        className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white"
        href="/listings"
      >
        Browse listings
      </Link>

      <SignUpButton mode="modal">
        <button className="rounded-full border border-stone-900/10 bg-white px-5 py-3 text-sm font-medium text-stone-800">
          Create account
        </button>
      </SignUpButton>

      <SignInButton mode="modal">
        <button className="rounded-full border border-stone-900/10 bg-stone-50 px-5 py-3 text-sm font-medium text-stone-700">
          Sign in
        </button>
      </SignInButton>
    </div>
  );
}
