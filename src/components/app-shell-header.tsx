"use client";

import Link from "next/link";

import { AccountMenu } from "@/components/account-menu";

export function AppShellHeader() {
  return (
    <header className="border-b border-stone-900/10 bg-white/75 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
        <Link
          className="text-lg font-semibold tracking-tight text-stone-900"
          href="/"
        >
          Ruvo
        </Link>

        <div className="flex items-center gap-2">
          <Link
            className="rounded-full px-3 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
            href="/listings"
          >
            Browse
          </Link>

          {/*
            The dev-auth harness must not appear in the product surface.
            /dev-login remains reachable by typing the URL.
          */}
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
