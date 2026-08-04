"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

import { useEffectiveAuth } from "@/lib/auth/use-effective-auth";

export function AppShellHeader() {
  const router = useRouter();
  const { isDevAuthEnabled, isDevSignedIn, isSignedIn } = useEffectiveAuth();

  async function logoutDevUser() {
    await fetch("/api/dev-auth/logout", {
      method: "POST",
    });

    router.push("/");
    router.refresh();
  }

  return (
    <header className="border-b border-stone-900/10 bg-white/75 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight text-stone-900">
          Ruvo
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Link
            className="rounded-full px-4 py-2 text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
            href="/listings"
          >
            Browse
          </Link>

          {!isSignedIn ? (
            <>
              <span className="mx-1 text-stone-300">|</span>
              {isDevAuthEnabled ? (
                <Link
                  className="rounded-full border border-stone-900/10 bg-white px-4 py-2 font-medium text-stone-800 shadow-sm"
                  href="/dev-login"
                >
                  Dev login
                </Link>
              ) : (
                <>
                  <SignInButton mode="modal">
                    <button className="rounded-full px-4 py-2 font-medium text-stone-700 transition-colors hover:bg-stone-100">
                      Sign in
                    </button>
                  </SignInButton>

                  <SignUpButton mode="modal">
                    <button className="rounded-full bg-stone-900 px-4 py-2 font-medium text-white transition-colors hover:bg-stone-800">
                      Get started
                    </button>
                  </SignUpButton>
                </>
              )}
            </>
          ) : null}

          {isSignedIn ? (
            <>
              <Link
                className="rounded-full px-4 py-2 text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
                href="/chats"
              >
                Chats
              </Link>
              <Link
                className="rounded-full border border-stone-900/10 bg-white px-4 py-2 font-medium text-stone-800 shadow-sm transition-colors hover:bg-stone-50"
                href="/dashboard"
              >
                Dashboard
              </Link>
              {isDevSignedIn ? (
                <button
                  className="rounded-full bg-stone-900 px-4 py-2 font-medium text-white transition-colors hover:bg-stone-800"
                  onClick={logoutDevUser}
                  type="button"
                >
                  Sign out
                </button>
              ) : (
                <UserButton />
              )}
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
