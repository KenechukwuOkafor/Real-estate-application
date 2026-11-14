"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin/listings", label: "Listing queue" },
  { href: "/admin/verification", label: "Verification" },
] as const;

/**
 * The two admin pages, linked to each other.
 *
 * Until this existed nothing linked to /admin/listings at all: the dashboard's
 * admin shortcut went to /admin/verification, which linked nowhere. The listing
 * moderation queue — the surface the product's promise rests on — was reachable
 * only by typing its URL, and suspension (ADR-017-A1) lives on it. A suspension
 * control behind an unreachable page would have been a second unreachable page.
 */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin"
      className="border-b border-stone-900/10 bg-white/90 px-6 py-3 text-sm"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2">
        <span className="font-semibold uppercase tracking-[0.18em] text-stone-500">Admin</span>
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "font-semibold text-stone-900 underline underline-offset-4"
                  : "font-medium text-stone-600 hover:text-stone-900"
              }
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
