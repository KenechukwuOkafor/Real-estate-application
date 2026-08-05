"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

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
  const { isDevSignedIn, isSignedIn } = useEffectiveAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  async function signOutDevUser() {
    await fetch("/api/dev-auth/logout", { method: "POST" });
    setIsOpen(false);
    router.push("/");
    router.refresh();
  }

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

  // Clerk owns the menu for real sessions; the dev harness needs its own.
  if (!isDevSignedIn) {
    return (
      <UserButton>
        <UserButton.MenuItems>
          <UserButton.Link href="/dashboard" label="Dashboard" labelIcon={DashboardIcon} />
          <UserButton.Link href="/chats" label="Chats" labelIcon={ChatsIcon} />
        </UserButton.MenuItems>
      </UserButton>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
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
