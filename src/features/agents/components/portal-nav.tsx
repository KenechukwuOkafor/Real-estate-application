"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type PortalNavCounts = {
  /** Inspection requests still awaiting an answer. */
  incomingRequests: number;
  /** Messages this agent has not read. */
  unreadMessages: number;
};

type NavItem = {
  badge?: keyof PortalNavCounts;
  href: string;
  icon: React.ReactNode;
  label: string;
  /** Sub-routes belong to this tab. `/agent` would otherwise match everything. */
  match: (pathname: string) => boolean;
};

const iconProps = {
  "aria-hidden": true,
  className: "h-6 w-6 md:h-5 md:w-5",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  viewBox: "0 0 24 24",
} as const;

/**
 * The portal's destinations, in one list.
 *
 * Both layouts render from this array — the bottom bar and the sidebar are the
 * same five items with different CSS, not two navigations kept in step by hand.
 * Adding a destination is one entry.
 *
 * Five is the ceiling, and it is the mobile bar that sets it: a sixth tab makes
 * every target too narrow to hit on a phone held one-handed. That constraint is
 * why Account absorbs profile, verification and sign-out rather than each
 * claiming a tab of its own.
 */
const NAV_ITEMS: NavItem[] = [
  {
    href: "/agent",
    icon: (
      <svg {...iconProps}>
        <path
          d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    label: "Home",
    match: (pathname) => pathname === "/agent",
  },
  {
    href: "/agent/listings",
    icon: (
      <svg {...iconProps}>
        <rect height="6" rx="1.5" width="16" x="4" y="4" />
        <rect height="6" rx="1.5" width="16" x="4" y="14" />
      </svg>
    ),
    label: "Listings",
    match: (pathname) => pathname.startsWith("/agent/listings"),
  },
  {
    badge: "incomingRequests",
    href: "/agent/inspections",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    label: "Requests",
    match: (pathname) => pathname.startsWith("/agent/inspections"),
  },
  {
    badge: "unreadMessages",
    href: "/chats",
    icon: (
      <svg {...iconProps}>
        <path
          d="M4 5.5h16v10a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5V17H5.5A1.5 1.5 0 0 1 4 15.5v-10Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    label: "Chats",
    match: (pathname) => pathname.startsWith("/chats"),
  },
  {
    href: "/agent/account",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 19c1.6-3.2 4-4.8 7-4.8s5.4 1.6 7 4.8" strokeLinecap="round" />
      </svg>
    ),
    label: "Account",
    match: (pathname) => pathname.startsWith("/agent/account"),
  },
];

function Badge({ count }: { count: number }) {
  if (count < 1) {
    return null;
  }

  return (
    <span
      // Announced as part of the link's name, so a screen reader hears
      // "Requests, 3 waiting" rather than "Requests 3".
      className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-stone-900 px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none text-white"
    >
      {count > 9 ? "9+" : count}
      <span className="sr-only"> waiting</span>
    </span>
  );
}

/**
 * The portal navigation: a bottom bar on a phone, a sidebar on a desktop.
 *
 * Mobile is the primary layout and desktop is the enhancement (ADR-008), which
 * is not only a rendering order — most Nsukka agents work from a phone, so the
 * phone layout is the one that has to be right and the sidebar is what the extra
 * width is spent on.
 *
 * Two elements rather than one repositioned element, because a bottom bar and a
 * sidebar want genuinely different markup: the bar is icon-over-label and fixed
 * to the viewport, the sidebar is icon-beside-label and scrolls with the page.
 * What is shared — the destinations, the active rule, the badges — lives in
 * NAV_ITEMS above, which is the part that could drift.
 */
export function PortalNav({ counts }: { counts: PortalNavCounts }) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop: a sidebar. Hidden below md, where the bar takes over. */}
      <nav
        aria-label="Agent portal sidebar"
        className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:gap-1 md:border-r md:border-stone-900/10 md:bg-white/60 md:px-4 md:py-6"
      >
        <Link
          className="mb-4 px-3 text-lg font-semibold tracking-tight text-stone-900"
          href="/agent"
        >
          Ruvo
        </Link>

        {NAV_ITEMS.map((item) => {
          const isActive = item.match(pathname);

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-stone-900 text-white"
                  : "text-stone-600 hover:bg-stone-900/5 hover:text-stone-900"
              }`}
              href={item.href}
              key={item.href}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge ? <Badge count={counts[item.badge]} /> : null}
            </Link>
          );
        })}
      </nav>

      {/*
        Mobile: a fixed bottom bar.
        pb-[env(safe-area-inset-bottom)] keeps the targets clear of the home
        indicator on a modern phone, where the last 20-odd pixels are not
        reliably tappable.
      */}
      <nav
        aria-label="Agent portal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-900/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="flex items-stretch">
          {NAV_ITEMS.map((item) => {
            const isActive = item.match(pathname);

            return (
              <li className="flex-1" key={item.href}>
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.6875rem] font-medium transition-colors ${
                    isActive ? "text-stone-900" : "text-stone-500"
                  }`}
                  href={item.href}
                >
                  <span className="relative">
                    {item.icon}
                    {item.badge && counts[item.badge] > 0 ? (
                      <span className="absolute -right-2 -top-1">
                        <Badge count={counts[item.badge]} />
                      </span>
                    ) : null}
                  </span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
