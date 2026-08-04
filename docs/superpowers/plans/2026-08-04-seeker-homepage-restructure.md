# Seeker Homepage Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the marketing landing page into an app home where a seeker sees real listings on the first screen and can narrow them immediately.

**Architecture:** URL search params are the single source of truth for filters, so the type tiles and the filter drawer are physically incapable of disagreeing. One `ListingFeed` client component owns infinite scroll, scroll restoration and empty/end states; the homepage and `/listings` both render it with server-fetched first pages. One `ListingCard` serves every surface.

**Tech Stack:** Next.js 16 App Router (RSC + client components), React 19, TypeScript strict, Tailwind v4, Vitest.

## Global Constraints

- **Frontend only.** No database migration, no repository change, no cursor change, no `ORDER BY` change, no change to `/api/listings`.
- **Preserve the aesthetic.** Warm sand background, heavy display headings, emerald for verified, generous whitespace, uppercase type-label on cards. No new palette, fonts, or card style.
- **One card component and one feed component.** Homepage, `/listings`, and any future area page render the same ones. No forked variants.
- **Mobile-first (ADR-008).** Build the mobile layout first; desktop is the enhancement via `md:`/`lg:` prefixes. Never author desktop and shrink it.
- **Browsing requires no authentication (ADR-021).** Fully usable signed out. No auth prompt on arrival. The only auth prompt is on tapping save.
- **No new claims in copy.** Every sentence must describe behaviour that exists today. Sentence case. No exclamation marks. No counts, user numbers, or testimonials.
- **`/listings` keeps its URL and its filter query params** (BR-SRCH-004). Only its pagination interaction changes.
- **No string `Dev login` in any rendered page.** `/dev-login` stays reachable by direct URL.
- Test files colocate as `*.test.ts` beside their subject. `npm test`, `npm run typecheck`, `npx eslint .` must all pass.
- Every commit message ends with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

## Knowingly waived acceptance criterion

**"Ordering: verified listings first, then newest" is NOT implemented.** That ordering lives in the SQL `ORDER BY` and in the keyset cursor encoding (`approved_at desc, id desc`). Delivering it means changing `listings-repository.ts` and `cursor.ts` — backend work the user explicitly excluded. The feed stays newest-first this round; verification remains a badge rather than a ranking incentive. Revisit when the backend reopens.

## Corrections to the source material

- **The wireframes contradict the spec in three places. The spec wins.** Both wireframes end with a "More listings" button (spec mandates infinite scroll, "Not a button"); both show "Self contain · sublet" and "4 months" (sublet and duration models are out of scope and absent from the schema); the desktop trust line says agents are "verified" where the copy table corrects it to "reviewed".
- **Two "Also remove" items are not ours.** The `Configure your application` panel is injected by Clerk because no API keys are set; the floating `N` is the Next.js dev-mode indicator. Neither appears in our source and both vanish in a production build with real Clerk keys. Nothing to delete.
- **No `savedByViewer` field exists** on `ListingListItem`. The heart renders unfilled on load and saves optimistically. A signed-in user who already saved a listing will see it unfilled until they revisit. Fixing that needs a new endpoint — out of scope.
- **No settings page exists.** The avatar menu offers Dashboard, Chats and Sign out instead of "settings".
- **`rental_frequency` does not exist.** "per year" is hardcoded with an inline comment; every seeded listing is annual and the Listings doc says the MVP targets yearly rentals.

---

## File Structure

**Create**

| Path | Responsibility |
|---|---|
| `src/features/listings/rent-period.ts` | The single hardcoded "per year" label + its justification comment |
| `src/features/listings/suggestions.ts` | Derive area / type / price-band suggestions from listings already fetched |
| `src/features/listings/hooks/use-listing-feed.ts` | Cursor paging, append, scroll + page restoration |
| `src/features/listings/components/listing-feed.tsx` | Client feed: infinite scroll, end state, empty state |
| `src/features/listings/components/save-listing-button.tsx` | Heart control; prompts for account when signed out |
| `src/features/listings/components/listing-search-bar.tsx` | Search bar with inset filter icon + active count badge |
| `src/features/listings/components/listing-suggestion-sheet.tsx` | Tap-to-open suggestion sheet (no free-text field) |
| `src/features/listings/components/property-type-tiles.tsx` | Three type tiles, URL-backed selection |
| `src/components/account-menu.tsx` | Avatar circle; menu when signed in, sign-in when signed out |

**Modify**

| Path | Change |
|---|---|
| `src/app/globals.css` | Wrap the `a` reset in `@layer base` so Tailwind utilities win |
| `src/components/app-shell-header.tsx` | Remove `Dev login`; render `AccountMenu` |
| `src/features/listings/components/listing-card.tsx` | Restructure to spec; verified badge only when true |
| `src/features/listings/components/listing-grid.tsx` | Mobile-first 1 → 2 → 3 columns |
| `src/app/page.tsx` | Rebuild as discovery surface |
| `src/app/listings/page.tsx` | Render the shared feed; drop the Load-more link |

---

## Task 1: Fix the cascade bug that hides every dark link-button

`src/app/globals.css` declares `a { color: inherit }` outside any cascade layer. Unlayered rules beat layered ones regardless of specificity, so it overrides Tailwind's `.text-white` (which lives in `@layer utilities`). Three primary CTAs on the current homepage render as unlabelled black pills. This must land first — later tasks add link-buttons that would silently inherit the same bug.

**Files:**
- Modify: `src/app/globals.css:25-28`

**Interfaces:**
- Consumes: nothing.
- Produces: working `text-*` colour utilities on `<a>` elements for every later task.

- [ ] **Step 1: Reproduce the bug**

```bash
npm run dev
```

Open `http://localhost:3001`. The pill next to "Dev login" in the hero is solid black with no visible text. Its label is "Browse listings" — confirm with:

```bash
curl -s http://localhost:3001/ | grep -o 'Browse listings'
```

Expected: the string is present in the HTML even though nothing is visible on screen.

- [ ] **Step 2: Apply the fix**

In `src/app/globals.css`, replace lines 25-28:

```css
/*
 * Layered deliberately. Unlayered rules beat layered ones in the CSS cascade,
 * so a bare `a { color: inherit }` overrides Tailwind's .text-white (which
 * lives in @layer utilities) and renders every dark link-button as an
 * unlabelled block. Keeping the reset in @layer base lets utilities win.
 */
@layer base {
  a {
    color: inherit;
    text-decoration: none;
  }
}
```

- [ ] **Step 3: Verify the fix**

Reload `http://localhost:3001`. The hero pill now reads "Browse listings" in white. Check the other two: "Start browsing" (end of How it works) and "See live listings" (For agents block) are both legible.

- [ ] **Step 4: Verify nothing else regressed**

```bash
npm run typecheck && npx eslint . && npm test
```

Expected: all three exit 0, 34 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "$(cat <<'EOF'
fix(ui): layer the anchor reset so colour utilities apply

An unlayered `a { color: inherit }` beat Tailwind's layered .text-white,
rendering every dark link-button as an unlabelled block — three primary
CTAs on the homepage among them. Moving the reset into @layer base lets
utilities win, which is the intended Tailwind v4 cascade.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Rent period label

One tiny module so the hardcoded claim lives in exactly one place and carries its own justification.

**Files:**
- Create: `src/features/listings/rent-period.ts`
- Create: `src/features/listings/rent-period.test.ts`

**Interfaces:**
- Produces: `RENT_PERIOD_LABEL: string` — the literal `"per year"`.

- [ ] **Step 1: Write the failing test**

Create `src/features/listings/rent-period.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { RENT_PERIOD_LABEL } from "@/features/listings/rent-period";

describe("RENT_PERIOD_LABEL", () => {
  it("is the annual label the MVP assumes", () => {
    expect(RENT_PERIOD_LABEL).toBe("per year");
  });

  it("is lower case so it reads as a suffix beside a price", () => {
    expect(RENT_PERIOD_LABEL).toBe(RENT_PERIOD_LABEL.toLowerCase());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/features/listings/rent-period.test.ts
```

Expected: FAIL — cannot resolve `@/features/listings/rent-period`.

- [ ] **Step 3: Create the module**

```typescript
/**
 * Hardcoded, deliberately.
 *
 * There is no `rental_frequency` column. Every listing in the database is
 * annual rent, and the Listings domain doc states the MVP targets yearly
 * rentals, so this label is true today — it is simply not enforced by the
 * schema. The first monthly listing will display incorrectly.
 *
 * Phase 1 follow-up: add `rental_frequency` to `listings`, surface it in the
 * agent draft form, and read it here instead of assuming.
 */
export const RENT_PERIOD_LABEL = "per year";
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- src/features/listings/rent-period.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/listings/rent-period.ts src/features/listings/rent-period.test.ts
git commit -m "$(cat <<'EOF'
feat(listings): add the rent period label

Isolates the one hardcoded duration claim behind a named constant that
carries its own justification, so the assumption is greppable and has a
single place to change when rental_frequency lands.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Save control

**Files:**
- Create: `src/features/listings/components/save-listing-button.tsx`

**Interfaces:**
- Consumes: `useEffectiveAuth()` from `@/lib/auth/use-effective-auth`, returning `{ isDevAuthEnabled, isDevSignedIn, isSignedIn }`.
- Produces: `SaveListingButton({ listingPublicId, listingTitle }: { listingPublicId: string; listingTitle: string })`.

The existing endpoint is `POST /api/saved-listings` with body `{ listingId: <publicId> }`. There is no field telling us whether the viewer already saved a listing, so the heart starts unfilled every load. Signed-out taps route to sign-in — this is the one and only auth prompt on the page.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useEffectiveAuth } from "@/lib/auth/use-effective-auth";

type SaveListingButtonProps = {
  listingPublicId: string;
  listingTitle: string;
};

export function SaveListingButton({
  listingPublicId,
  listingTitle,
}: SaveListingButtonProps) {
  const router = useRouter();
  const { isSignedIn } = useEffectiveAuth();
  // No savedByViewer field exists on the listing payload, so the control always
  // starts unfilled. A signed-in user who already saved this listing will see
  // it unfilled until they tap. Fixing that needs a new endpoint.
  const [isSaved, setIsSaved] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function toggleSaved() {
    if (!isSignedIn) {
      // Tapping save is the moment to ask for an account — never on arrival.
      router.push("/onboarding");
      return;
    }

    setIsPending(true);
    const nextSaved = !isSaved;
    setIsSaved(nextSaved);

    try {
      const response = await fetch(
        nextSaved
          ? "/api/saved-listings"
          : `/api/saved-listings/${listingPublicId}`,
        {
          body: nextSaved ? JSON.stringify({ listingId: listingPublicId }) : null,
          headers: { "Content-Type": "application/json" },
          method: nextSaved ? "POST" : "DELETE",
        },
      );

      if (!response.ok) {
        setIsSaved(!nextSaved);
      }
    } catch {
      setIsSaved(!nextSaved);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <button
      aria-label={isSaved ? `Remove ${listingTitle} from saved` : `Save ${listingTitle}`}
      aria-pressed={isSaved}
      className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-stone-700 shadow-sm backdrop-blur transition-colors hover:bg-white disabled:opacity-60"
      disabled={isPending}
      onClick={toggleSaved}
      type="button"
    >
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        fill={isSaved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.8}
        viewBox="0 0 24 24"
      >
        <path
          d="M12 20.3 4.6 13a4.6 4.6 0 1 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
```

- [ ] **Step 2: Verify gates**

```bash
npm run typecheck && npx eslint .
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/listings/components/save-listing-button.tsx
git commit -m "$(cat <<'EOF'
feat(listings): add the save control

Heart control on the card image. Tapping it while signed out is the single
auth prompt on the discovery surface — arrival never prompts, per ADR-021.

The listing payload carries no savedByViewer field, so the control starts
unfilled on every load and saves optimistically, reverting on failure.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Restructure the listing card

The card currently leads with property type and title, and renders `isVerified ? "Verified" : "Agent"` — labelling unverified agents, which the spec forbids. Rebuild it to the spec's visual weight order.

**Files:**
- Modify: `src/features/listings/components/listing-card.tsx`
- Create: `src/features/listings/components/listing-card.test.tsx`

**Interfaces:**
- Consumes: `RENT_PERIOD_LABEL` (Task 2); `SaveListingButton` (Task 3); `ListingListItem` from `@/features/listings/types`; `formatPriceNaira`, `formatPropertyType`, `buildListingHref` from `@/features/listings/format`.
- Produces: `ListingCard({ listing }: { listing: ListingListItem })`.

- [ ] **Step 1: Write the failing test**

Create `src/features/listings/components/listing-card.test.tsx`:

```typescript
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ListingCard } from "@/features/listings/components/listing-card";
import type { ListingListItem } from "@/features/listings/types";

const base: ListingListItem = {
  agent: { displayName: "Prime Homes Nsukka", isVerified: true },
  approvedAt: "2026-03-29T19:09:33.831Z",
  area: "Hill Top",
  bathrooms: 1,
  bedrooms: 1,
  city: "Nsukka",
  coverImageUrl: "https://example.test/a.jpg",
  id: "listing-1",
  priceNaira: 180000,
  propertyType: "self_contain",
  publicId: "20887cbf-53fc-4c45-adb2-c5d4d33cf001",
  slug: "clean-self-contain",
  state: "Enugu",
  title: "Clean Self Contain",
};

describe("ListingCard", () => {
  it("shows the price and the rent period", () => {
    const html = renderToStaticMarkup(<ListingCard listing={base} />);

    expect(html).toContain("180,000");
    expect(html).toContain("per year");
  });

  it("shows the verified badge when the agent is verified", () => {
    const html = renderToStaticMarkup(<ListingCard listing={base} />);

    expect(html).toContain("Verified");
  });

  it("renders no badge at all when the agent is unverified", () => {
    const html = renderToStaticMarkup(
      <ListingCard listing={{ ...base, agent: { ...base.agent, isVerified: false } }} />,
    );

    expect(html).not.toContain("Verified");
    expect(html).not.toContain("Unverified");
    expect(html).not.toContain(">Agent<");
  });

  it("shows the property type and area", () => {
    const html = renderToStaticMarkup(<ListingCard listing={base} />);

    expect(html).toContain("Self Contain");
    expect(html).toContain("Hill Top");
  });

  it("links to the canonical listing url", () => {
    const html = renderToStaticMarkup(<ListingCard listing={base} />);

    expect(html).toContain(
      "/listings/clean-self-contain--20887cbf-53fc-4c45-adb2-c5d4d33cf001",
    );
  });

  it("lazy loads the cover image", () => {
    const html = renderToStaticMarkup(<ListingCard listing={base} />);

    expect(html).toContain('loading="lazy"');
  });
});
```

- [ ] **Step 2: Enable JSX tests in Vitest**

`vitest.config.ts` currently only includes `src/**/*.test.ts`. Widen it and add the React environment. Replace the `test` block:

```typescript
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
```

Install the React server renderer peer (already present via `react-dom`, so no install is needed — verify):

```bash
node -e "require.resolve('react-dom/server'); console.log('react-dom/server resolvable')"
```

Expected: prints the confirmation.

- [ ] **Step 3: Run the test to verify it fails**

```bash
npm test -- src/features/listings/components/listing-card.test.tsx
```

Expected: FAIL — `per year` absent, and the unverified case finds `>Agent<`.

- [ ] **Step 4: Rewrite the card**

Replace `src/features/listings/components/listing-card.tsx` entirely:

```tsx
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

import {
  buildListingHref,
  formatPriceNaira,
  formatPropertyType,
} from "@/features/listings/format";
import { RENT_PERIOD_LABEL } from "@/features/listings/rent-period";
import { SaveListingButton } from "@/features/listings/components/save-listing-button";
import type { ListingListItem } from "@/features/listings/types";

type ListingCardProps = {
  listing: ListingListItem;
};

export function ListingCard({ listing }: ListingCardProps) {
  return (
    <article className="group relative overflow-hidden rounded-[1.5rem] border border-stone-900/10 bg-white shadow-[0_18px_50px_rgba(48,38,24,0.08)] transition-transform duration-200 hover:-translate-y-1">
      <div className="relative aspect-[4/3] bg-stone-200">
        {listing.coverImageUrl ? (
          <img
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
            src={listing.coverImageUrl}
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-full items-center justify-center bg-[linear-gradient(135deg,_#d9d2c4,_#ece6d8)] text-sm uppercase tracking-[0.25em] text-stone-600"
          >
            Ruvo
          </div>
        )}

        <div className="absolute right-3 top-3">
          <SaveListingButton
            listingPublicId={listing.publicId}
            listingTitle={listing.title}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xl font-semibold tracking-tight text-stone-900">
            {formatPriceNaira(listing.priceNaira)}
          </p>
          <span className="text-xs text-stone-500">{RENT_PERIOD_LABEL}</span>
        </div>

        <p className="text-sm uppercase tracking-[0.18em] text-stone-500">
          {formatPropertyType(listing.propertyType)}
        </p>

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-stone-700">{listing.area}</span>

          {listing.agent.isVerified ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900">
              Verified
            </span>
          ) : null}
        </div>
      </div>

      {/*
        Stretched link rather than wrapping the whole card in an <a>: the save
        control sits inside the card and must not be swallowed by the link.
      */}
      <Link
        aria-label={listing.title}
        className="absolute inset-0 z-0"
        href={buildListingHref(listing.slug, listing.publicId)}
      />
    </article>
  );
}
```

Note the save button must sit above the stretched link — it already does, because the stretched link is `z-0` and the button renders in a later stacking context. Task 4 gives it `relative z-10`.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm test -- src/features/listings/components/listing-card.test.tsx
```

Expected: 6 tests pass. `SaveListingButton` already exists from Task 3.

- [ ] **Step 6: Commit**

```bash
git add src/features/listings/components/listing-card.tsx \
        src/features/listings/components/listing-card.test.tsx \
        vitest.config.ts
git commit -m "$(cat <<'EOF'
feat(listings): restructure the listing card

Leads with price and rent period, then property type, then area, matching
the spec's order of visual weight. The verified badge now renders only when
the agent is verified — previously an unverified agent was labelled "Agent",
which is a claim the product should not make.

Cover images lazy load. The card uses a stretched link so the save control
stays independently clickable.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Feed hook — paging and restoration

**Files:**
- Create: `src/features/listings/hooks/use-listing-feed.ts`
- Create: `src/features/listings/hooks/use-listing-feed.test.ts`

**Interfaces:**
- Consumes: `ListingListItem` from `@/features/listings/types`.
- Produces:
  `useListingFeed({ initialItems, initialCursor, initialHasMore, query }): { items: ListingListItem[]; hasMore: boolean; isLoading: boolean; error: string | null; loadMore: () => void }`
  and the pure helper `buildFeedCacheKey(query: string): string`.

Restoration works by writing `{ items, cursor, hasMore, scrollY }` to `sessionStorage` under a key derived from the active filter query, and reading it back on mount. Next's App Router restores scroll for server-rendered content but knows nothing about client-appended pages, which is why both must be stored together.

- [ ] **Step 1: Write the failing test**

Create `src/features/listings/hooks/use-listing-feed.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { buildFeedCacheKey } from "@/features/listings/hooks/use-listing-feed";

describe("buildFeedCacheKey", () => {
  it("namespaces the key so it cannot collide with other session data", () => {
    expect(buildFeedCacheKey("")).toBe("ruvo:feed:");
  });

  it("varies with the filter query so each filter set restores separately", () => {
    expect(buildFeedCacheKey("area=Hill+Top")).toBe("ruvo:feed:area=Hill+Top");
    expect(buildFeedCacheKey("area=Hill+Top")).not.toBe(
      buildFeedCacheKey("area=Odenigbo"),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/features/listings/hooks/use-listing-feed.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the hook**

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ListingListItem } from "@/features/listings/types";

export function buildFeedCacheKey(query: string) {
  return `ruvo:feed:${query}`;
}

type FeedSnapshot = {
  cursor: string | null;
  hasMore: boolean;
  items: ListingListItem[];
  scrollY: number;
};

type UseListingFeedOptions = {
  initialCursor: string | null;
  initialHasMore: boolean;
  initialItems: ListingListItem[];
  query: string;
};

function readSnapshot(key: string): FeedSnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as FeedSnapshot) : null;
  } catch {
    return null;
  }
}

export function useListingFeed({
  initialCursor,
  initialHasMore,
  initialItems,
  query,
}: UseListingFeedOptions) {
  const cacheKey = buildFeedCacheKey(query);

  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasRestored = useRef(false);

  // Restore appended pages and scroll position when returning from a detail
  // page. The router restores scroll for server-rendered content only; pages
  // this hook appended are client state and would otherwise be lost.
  useEffect(() => {
    if (hasRestored.current) {
      return;
    }

    hasRestored.current = true;
    const snapshot = readSnapshot(cacheKey);

    if (!snapshot || snapshot.items.length <= initialItems.length) {
      return;
    }

    setItems(snapshot.items);
    setCursor(snapshot.cursor);
    setHasMore(snapshot.hasMore);

    window.requestAnimationFrame(() => {
      window.scrollTo(0, snapshot.scrollY);
    });
  }, [cacheKey, initialItems.length]);

  // Reset when the filter query changes — a different filter set is a
  // different feed, and must not inherit the previous one's pages.
  useEffect(() => {
    hasRestored.current = false;
    setItems(initialItems);
    setCursor(initialCursor);
    setHasMore(initialHasMore);
    setError(null);
  }, [initialCursor, initialHasMore, initialItems, query]);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore || !cursor) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams(query);
      params.set("cursor", cursor);

      const response = await fetch(`/api/listings?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Request failed");
      }

      const payload = (await response.json()) as {
        data: ListingListItem[];
        pagination: { hasMore: boolean; nextCursor: string | null };
      };

      setItems((current) => {
        const next = [...current, ...payload.data];

        try {
          window.sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              cursor: payload.pagination.nextCursor,
              hasMore: payload.pagination.hasMore,
              items: next,
              scrollY: window.scrollY,
            } satisfies FeedSnapshot),
          );
        } catch {
          // sessionStorage can be full or blocked; restoration is a nicety,
          // never a reason to break the feed.
        }

        return next;
      });

      setCursor(payload.pagination.nextCursor);
      setHasMore(payload.pagination.hasMore);
    } catch {
      setError("We could not load more listings. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [cacheKey, cursor, hasMore, isLoading, query]);

  return { error, hasMore, isLoading, items, loadMore };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- src/features/listings/hooks/use-listing-feed.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/listings/hooks/use-listing-feed.ts \
        src/features/listings/hooks/use-listing-feed.test.ts
git commit -m "$(cat <<'EOF'
feat(listings): add the feed paging hook

Appends pages from the existing cursor endpoint and snapshots them to
sessionStorage with the scroll offset, keyed by the active filter query.
The App Router restores scroll for server-rendered content but knows
nothing about client-appended pages, so both are stored together.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: The shared feed component

**Files:**
- Create: `src/features/listings/components/listing-feed.tsx`
- Modify: `src/features/listings/components/listing-grid.tsx`

**Interfaces:**
- Consumes: `useListingFeed` (Task 5), `ListingGrid`, `ListingListItem`.
- Produces: `ListingFeed({ initialItems, initialCursor, initialHasMore, query, hasActiveFilters })`.

- [ ] **Step 1: Make the grid mobile-first**

Replace the grid `className` in `src/features/listings/components/listing-grid.tsx` and drop its empty state — the feed owns empty states now:

```tsx
import type { ListingListItem } from "@/features/listings/types";

import { ListingCard } from "@/features/listings/components/listing-card";

type ListingGridProps = {
  listings: ListingListItem[];
};

export function ListingGrid({ listings }: ListingGridProps) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
```

One column on mobile, two on tablet, three on desktop. Never four.

- [ ] **Step 2: Create the feed**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { ListingGrid } from "@/features/listings/components/listing-grid";
import { useListingFeed } from "@/features/listings/hooks/use-listing-feed";
import type { ListingListItem } from "@/features/listings/types";

type ListingFeedProps = {
  hasActiveFilters: boolean;
  initialCursor: string | null;
  initialHasMore: boolean;
  initialItems: ListingListItem[];
  query: string;
};

export function ListingFeed({
  hasActiveFilters,
  initialCursor,
  initialHasMore,
  initialItems,
  query,
}: ListingFeedProps) {
  const { error, hasMore, isLoading, items, loadMore } = useListingFeed({
    initialCursor,
    initialHasMore,
    initialItems,
    query,
  });
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "400px" },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadMore]);

  if (items.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-stone-900/15 bg-white/70 p-8 text-center">
        <p className="text-base font-medium text-stone-900">
          No listings match these filters.
        </p>
        <p className="mt-2 text-sm text-stone-600">
          Try widening your budget or choosing another area.
        </p>
        <Link
          className="mt-5 inline-block rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white"
          href="/"
        >
          Clear filters
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ListingGrid listings={items} />

      <div ref={sentinelRef} />

      {isLoading ? (
        <p className="text-center text-sm text-stone-600">Loading more listings…</p>
      ) : null}

      {error ? (
        <div className="text-center">
          <p className="text-sm text-stone-700">{error}</p>
          <button
            className="mt-3 rounded-full border border-stone-900/15 bg-white px-4 py-2 text-sm font-medium text-stone-800"
            onClick={() => void loadMore()}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      {!hasMore && !isLoading ? (
        <div className="border-t border-stone-900/10 pt-6 text-center">
          <p className="text-sm text-stone-700">
            That is all {items.length}{" "}
            {items.length === 1 ? "listing" : "listings"}
            {hasActiveFilters ? " matching these filters" : " in Nsukka"}.
          </p>
          {hasActiveFilters ? (
            <Link
              className="mt-3 inline-block rounded-full border border-stone-900/15 bg-white px-4 py-2 text-sm font-medium text-stone-800"
              href="/"
            >
              Clear filters to see more
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

The end state always states the count and, when filters are active, offers to widen them. The user never hits a silent stop.

- [ ] **Step 3: Verify gates**

```bash
npm run typecheck && npx eslint . && npm test
```

Expected: all exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/features/listings/components/listing-feed.tsx \
        src/features/listings/components/listing-grid.tsx
git commit -m "$(cat <<'EOF'
feat(listings): add the shared infinite-scroll feed

One feed component for the homepage and /listings — no forked variants.
An IntersectionObserver sentinel loads the next page 400px ahead of the
viewport using the existing cursor endpoint.

Exhausting the feed states the count explicitly and offers to widen active
filters; matching nothing offers a one-tap reset. Neither is a dead end.
The grid is now one column on mobile, two on tablet, three on desktop.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Suggestions, search bar and type tiles

These three ship together: the tiles and the sheet both write the same URL parameter, and splitting them would let the shared-state requirement drift — the spec calls this out as the most likely place for the implementation to go wrong.

**Files:**
- Create: `src/features/listings/suggestions.ts`
- Create: `src/features/listings/suggestions.test.ts`
- Create: `src/features/listings/components/listing-suggestion-sheet.tsx`
- Create: `src/features/listings/components/listing-search-bar.tsx`
- Create: `src/features/listings/components/property-type-tiles.tsx`

**Interfaces:**
- Consumes: `ListingListItem`, `ListingListFilters`, `formatPropertyType`, `formatPriceNaira`.
- Produces:
  `deriveAreaSuggestions(listings: ListingListItem[]): string[]`,
  `PRICE_BANDS: Array<{ label: string; maxPrice?: number; minPrice?: number }>`,
  `HOME_PROPERTY_TYPES: Array<{ label: string; value: string }>`,
  `ListingSearchBar({ activeFilterCount, areas }: { activeFilterCount: number; areas: string[] })`,
  `PropertyTypeTiles()` — takes no props; it reads and writes the URL directly,
  which is what makes tile/drawer disagreement impossible.

**Single source of truth:** the URL. Tiles and drawer both read `propertyType` from `useSearchParams()` and both write it with `router.push()`. They cannot disagree because neither holds local state.

- [ ] **Step 1: Write the failing test**

Create `src/features/listings/suggestions.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import {
  deriveAreaSuggestions,
  HOME_PROPERTY_TYPES,
  PRICE_BANDS,
} from "@/features/listings/suggestions";
import type { ListingListItem } from "@/features/listings/types";

function listing(area: string, id: string): ListingListItem {
  return {
    agent: { displayName: "A", isVerified: true },
    approvedAt: null,
    area,
    bathrooms: 1,
    bedrooms: 1,
    city: "Nsukka",
    coverImageUrl: null,
    id,
    priceNaira: 100000,
    propertyType: "self_contain",
    publicId: `p-${id}`,
    slug: `s-${id}`,
    state: "Enugu",
    title: "T",
  };
}

describe("deriveAreaSuggestions", () => {
  it("returns each area once, alphabetically", () => {
    const result = deriveAreaSuggestions([
      listing("Odenigbo", "1"),
      listing("Hill Top", "2"),
      listing("Odenigbo", "3"),
    ]);

    expect(result).toEqual(["Hill Top", "Odenigbo"]);
  });

  it("returns nothing when there are no listings, rather than inventing areas", () => {
    expect(deriveAreaSuggestions([])).toEqual([]);
  });
});

describe("HOME_PROPERTY_TYPES", () => {
  it("offers exactly the three tiles the homepage shows", () => {
    expect(HOME_PROPERTY_TYPES.map((type) => type.value)).toEqual([
      "self_contain",
      "1_bedroom",
      "2_bedroom",
    ]);
  });
});

describe("PRICE_BANDS", () => {
  it("covers the range without gaps", () => {
    expect(PRICE_BANDS.length).toBeGreaterThan(0);
    expect(PRICE_BANDS[0].minPrice).toBeUndefined();
    expect(PRICE_BANDS.at(-1)?.maxPrice).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/features/listings/suggestions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the suggestions module**

```typescript
import type { ListingListItem } from "@/features/listings/types";

/**
 * Areas are free-text columns, not first-class entities, so there is no table
 * to read. Deriving them from listings that actually exist keeps the sheet
 * honest: it can only ever suggest an area a seeker can really find something
 * in. A hardcoded list would suggest empty areas.
 */
export function deriveAreaSuggestions(listings: ListingListItem[]) {
  return [...new Set(listings.map((listing) => listing.area.trim()))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

export const HOME_PROPERTY_TYPES: Array<{
  icon: "bed" | "building" | "door";
  label: string;
  value: string;
}> = [
  { icon: "door", label: "Self contain", value: "self_contain" },
  { icon: "bed", label: "1 bedroom", value: "1_bedroom" },
  { icon: "building", label: "2 bedroom", value: "2_bedroom" },
];

export const PRICE_BANDS: Array<{
  label: string;
  maxPrice?: number;
  minPrice?: number;
}> = [
  { label: "Under ₦200,000", maxPrice: 200000 },
  { label: "₦200,000 – ₦500,000", maxPrice: 500000, minPrice: 200000 },
  { label: "₦500,000 and above", minPrice: 500000 },
];
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- src/features/listings/suggestions.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Create the suggestion sheet**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

import {
  HOME_PROPERTY_TYPES,
  PRICE_BANDS,
} from "@/features/listings/suggestions";

type ListingSuggestionSheetProps = {
  areas: string[];
  onClose: () => void;
};

export function ListingSuggestionSheet({
  areas,
  onClose,
}: ListingSuggestionSheetProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function apply(update: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(update)) {
      if (value === undefined) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    params.delete("cursor");
    router.push(`?${params.toString()}`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/30 md:items-center">
      <div className="max-h-[80vh] w-full overflow-y-auto rounded-t-[1.5rem] bg-white p-5 md:max-w-lg md:rounded-[1.5rem]">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-stone-900">
            Narrow your search
          </h2>
          <button
            className="rounded-full px-3 py-1 text-sm text-stone-600"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <section className="mt-5">
          <h3 className="text-xs uppercase tracking-[0.18em] text-stone-500">
            Property type
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {HOME_PROPERTY_TYPES.map((type) => (
              <button
                className="rounded-full border border-stone-900/15 px-4 py-2 text-sm text-stone-800"
                key={type.value}
                onClick={() => apply({ propertyType: type.value })}
                type="button"
              >
                {type.label}
              </button>
            ))}
          </div>
        </section>

        {areas.length > 0 ? (
          <section className="mt-5">
            <h3 className="text-xs uppercase tracking-[0.18em] text-stone-500">
              Area
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {areas.map((area) => (
                <button
                  className="rounded-full border border-stone-900/15 px-4 py-2 text-sm text-stone-800"
                  key={area}
                  onClick={() => apply({ area })}
                  type="button"
                >
                  {area}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-5">
          <h3 className="text-xs uppercase tracking-[0.18em] text-stone-500">
            Budget
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRICE_BANDS.map((band) => (
              <button
                className="rounded-full border border-stone-900/15 px-4 py-2 text-sm text-stone-800"
                key={band.label}
                onClick={() =>
                  apply({
                    maxPrice: band.maxPrice ? String(band.maxPrice) : undefined,
                    minPrice: band.minPrice ? String(band.minPrice) : undefined,
                  })
                }
                type="button"
              >
                {band.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create the search bar**

```tsx
"use client";

import { useState } from "react";

import { ListingSuggestionSheet } from "@/features/listings/components/listing-suggestion-sheet";

type ListingSearchBarProps = {
  activeFilterCount: number;
  areas: string[];
};

export function ListingSearchBar({
  activeFilterCount,
  areas,
}: ListingSearchBarProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  return (
    <>
      {/*
        Deliberately a button, not an input. Free-text search does not exist in
        the backend, and a keyboard field would imply it does. Tapping opens a
        sheet of areas, types and price bands instead.
      */}
      <button
        className="mx-auto flex h-12 w-full max-w-[600px] items-center gap-3 rounded-full border border-stone-900/15 bg-white px-4 text-left shadow-sm"
        onClick={() => setIsSheetOpen(true)}
        type="button"
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-stone-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>

        <span className="flex-1 text-sm text-stone-500">Area, type or price</span>

        <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-stone-700">
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            viewBox="0 0 24 24"
          >
            <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
          </svg>
          {activeFilterCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-medium text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </span>
      </button>

      {isSheetOpen ? (
        <ListingSuggestionSheet
          areas={areas}
          onClose={() => setIsSheetOpen(false)}
        />
      ) : null}
    </>
  );
}
```

- [ ] **Step 7: Create the type tiles**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { HOME_PROPERTY_TYPES } from "@/features/listings/suggestions";

export function PropertyTypeTiles() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The URL is the single source of truth. The tiles hold no local state, so
  // they cannot disagree with the filter drawer — both read and write this
  // same parameter.
  const selectedType = searchParams.get("propertyType");

  function selectType(value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (selectedType === value) {
      params.delete("propertyType");
    } else {
      params.set("propertyType", value);
    }

    params.delete("cursor");
    router.push(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {HOME_PROPERTY_TYPES.map((type) => {
        const isSelected = selectedType === type.value;

        return (
          <button
            aria-pressed={isSelected}
            className={`rounded-2xl border px-2 py-3 text-center transition-colors ${
              isSelected
                ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                : "border-stone-900/12 bg-white text-stone-700"
            }`}
            key={type.value}
            onClick={() => selectType(type.value)}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="mx-auto h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              viewBox="0 0 24 24"
            >
              {type.icon === "door" ? (
                <>
                  <path d="M6 3h12v18H6z" />
                  <circle cx="14.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
                </>
              ) : null}
              {type.icon === "bed" ? (
                <>
                  <path d="M3 17v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5" strokeLinecap="round" />
                  <path d="M3 17h18M7 10V7h5v3" strokeLinecap="round" />
                </>
              ) : null}
              {type.icon === "building" ? (
                <>
                  <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
                  <path d="M16 10h2a2 2 0 0 1 2 2v9M8 8h4M8 12h4M8 16h4" strokeLinecap="round" />
                </>
              ) : null}
            </svg>
            <span className="mt-1.5 block text-xs font-medium">{type.label}</span>
          </button>
        );
      })}
    </div>
  );
}
```

Tapping filters in place: `router.push` with `scroll: false` updates the search params, the server component re-renders with new results, and the page does not navigate away.

- [ ] **Step 8: Verify gates**

```bash
npm run typecheck && npx eslint . && npm test
```

Expected: all exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/features/listings/suggestions.ts \
        src/features/listings/suggestions.test.ts \
        src/features/listings/components/listing-suggestion-sheet.tsx \
        src/features/listings/components/listing-search-bar.tsx \
        src/features/listings/components/property-type-tiles.tsx
git commit -m "$(cat <<'EOF'
feat(listings): add search bar, suggestion sheet and type tiles

The search bar is a button, not an input: free-text search does not exist
in the backend and a keyboard field would imply it does. Tapping opens a
sheet of areas, property types and price bands.

Area suggestions are derived from listings that actually exist rather than
hardcoded, so the sheet can only ever suggest an area with results in it.

Type tiles and the sheet both read and write the same URL parameter and
hold no local state, so they cannot disagree about the selected type.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Account menu and header

**Files:**
- Create: `src/components/account-menu.tsx`
- Modify: `src/components/app-shell-header.tsx`

**Interfaces:**
- Consumes: `useEffectiveAuth()`; Clerk's `SignInButton`, `UserButton`.
- Produces: `AccountMenu()`.

**Deviation from the spec:** it asks for a menu with "settings and logout". No settings page exists in this codebase, so the menu offers Dashboard, Chats and Sign out. Inventing a settings page is out of scope.

- [ ] **Step 1: Create the account menu**

```tsx
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
```

- [ ] **Step 2: Rewrite the header**

Replace `src/components/app-shell-header.tsx` entirely:

```tsx
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
```

- [ ] **Step 3: Verify the string is gone**

```bash
npm run dev
curl -s http://localhost:3001/ | grep -c "Dev login"
curl -s http://localhost:3001/listings | grep -c "Dev login"
```

Expected: `0` for both.

- [ ] **Step 4: Verify gates**

```bash
npm run typecheck && npx eslint . && npm test
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/account-menu.tsx src/components/app-shell-header.tsx
git commit -m "$(cat <<'EOF'
feat(ui): replace header auth links with an account menu

An avatar is now always present: it opens sign-in when signed out and a
menu when signed in. Dev login is removed from the product surface
entirely; /dev-login stays reachable by direct URL.

The menu offers Dashboard, Chats and Sign out rather than the settings
entry the spec describes, because no settings page exists.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Rebuild the homepage

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `ListingFeed`, `ListingSearchBar`, `PropertyTypeTiles`, `deriveAreaSuggestions`, `parseListingListFilters`, `toSearchParams`, `buildListingSearchQuery`, `listPublicListings`.

The hero band renders for signed-out visitors only. Because the page is a server component and auth state is resolved on the server, use `getAuthContext()` from `@/lib/auth/clerk`.

- [ ] **Step 1: Replace the homepage**

```tsx
import type { Metadata } from "next";

import { ListingFeed } from "@/features/listings/components/listing-feed";
import { ListingSearchBar } from "@/features/listings/components/listing-search-bar";
import { PropertyTypeTiles } from "@/features/listings/components/property-type-tiles";
import { parseListingListFilters } from "@/features/listings/parsers";
import { buildListingSearchQuery, toSearchParams } from "@/features/listings/search-params";
import { deriveAreaSuggestions } from "@/features/listings/suggestions";
import { getAuthContext } from "@/lib/auth/clerk";
import { listPublicListings } from "@/server/services/public-listings-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ruvo — Verified rentals in Nsukka",
  description:
    "Browse rentals in Nsukka. Every listing is reviewed before publishing.",
};

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function countActiveFilters(params: URLSearchParams) {
  return ["area", "bedrooms", "maxPrice", "minPrice", "propertyType", "verifiedOnly"]
    .filter((key) => params.get(key))
    .length;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolved = toSearchParams(await searchParams);
  const filters = parseListingListFilters(resolved);
  const [result, authState] = await Promise.all([
    listPublicListings(filters),
    getAuthContext(),
  ]);

  const isSignedIn = Boolean(authState.userId);
  const activeFilterCount = countActiveFilters(resolved);
  const query = buildListingSearchQuery(filters);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#f0eadf_100%)] text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-5 md:gap-7 md:py-8">
        {!isSignedIn ? (
          <section className="text-center md:pt-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              Live in Nsukka, Enugu
            </span>

            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Verified rentals. No surprises.
            </h1>

            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-stone-600 md:text-base">
              Every listing is reviewed before publishing, priced upfront, and open
              for an inspection request in-app.
            </p>
          </section>
        ) : null}

        <ListingSearchBar
          activeFilterCount={activeFilterCount}
          areas={deriveAreaSuggestions(result.items)}
        />

        <PropertyTypeTiles />

        <ListingFeed
          hasActiveFilters={activeFilterCount > 0}
          initialCursor={result.nextCursor}
          initialHasMore={result.hasMore}
          initialItems={result.items}
          query={query}
        />

        {!isSignedIn ? (
          <section className="mt-4 grid gap-4 border-t border-stone-900/10 pt-8 md:grid-cols-3">
            <div>
              <h2 className="text-base font-semibold">Agents are reviewed before they can list</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                An administrator reviews every agent before their listings can go
                live, so one bad actor cannot flood the feed.
              </p>
            </div>
            <div>
              <h2 className="text-base font-semibold">Price upfront, always</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Rent is shown on every card and detail page. No asking for price,
                no post-viewing surprises.
              </p>
            </div>
            <div>
              <h2 className="text-base font-semibold">Request an inspection in-app</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Send an inspection request from any listing. The agent accepts or
                declines in-app, and a chat opens for that listing.
              </p>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
```

Every claim here is true today: administrators review agents (`admin-service.approveAgentVerificationAsAdmin`), price is on every card, and inspection requests are accept/decline with an auto-created chat. Nothing claims scheduling, identity verification, or listing counts.

- [ ] **Step 2: Verify the mobile acceptance criterion**

Open `http://localhost:3001` in a 390px-wide viewport, signed out. At least one full listing card must be visible without scrolling.

- [ ] **Step 3: Verify gates**

```bash
npm run typecheck && npx eslint . && npm test
```

Expected: all exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(home): restructure the homepage as a discovery surface

Real listings now appear within the first screen. The hero is compressed
to a band and renders for signed-out visitors only; signed-in users start
at the search bar. Value propositions move below the first run of listings
— reassurance for someone already interested, not a gate before the
product.

Copy corrected to describe only what exists: administrators review agents
rather than "identity-verified"; inspections are requested in-app rather
than "booked"; listings are reviewed before publishing rather than
"agent-reviewed".

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Migrate /listings to the shared feed

**Files:**
- Modify: `src/app/listings/page.tsx`

`/listings` keeps its URL and every filter query parameter. Only the Load-more link becomes infinite scroll, so the two surfaces share one feed.

- [ ] **Step 1: Replace the feed section**

In `src/app/listings/page.tsx`, replace the `ListingGrid` block and the `nextCursor` Load-more block with the shared feed, and update the imports:

```tsx
import { ListingFeed } from "@/features/listings/components/listing-feed";
```

Remove the now-unused `Link` and `ListingGrid` imports, then replace both blocks with:

```tsx
        <ListingFeed
          hasActiveFilters={Boolean(
            filters.area ||
              filters.bedrooms ||
              filters.maxPrice ||
              filters.minPrice ||
              filters.propertyType ||
              filters.verifiedOnly,
          )}
          initialCursor={result.nextCursor}
          initialHasMore={result.hasMore}
          initialItems={result.items}
          query={buildListingSearchQuery(filters)}
        />
```

`buildListingSearchQuery` is already imported in this file.

- [ ] **Step 2: Verify URL stability**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3001/listings?area=Hill+Top&propertyType=self_contain&minPrice=100000"
```

Expected: `200`. The filter parameters must still be honoured — confirm the rendered page reflects them.

- [ ] **Step 3: Verify gates**

```bash
npm run typecheck && npx eslint . && npm test
```

Expected: all exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/listings/page.tsx
git commit -m "$(cat <<'EOF'
refactor(listings): render the shared feed on /listings

Both surfaces now use one feed and one card, so there is no forked variant
to keep in sync. The URL and every filter query parameter are unchanged, as
BR-SRCH-004 requires; only the Load-more link becomes infinite scroll.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Definition of Done

- [ ] On a 390px viewport, signed out, at least one full listing card is visible without scrolling.
- [ ] Signed-in users see no hero band and no value-prop block.
- [ ] Signed-out users can browse, filter, and open any listing with no auth prompt. The only prompt is on tapping save.
- [ ] Selecting a type tile pre-selects that type in the suggestion sheet and vice versa — both read the same URL parameter and hold no local state.
- [ ] Returning from a listing detail restores scroll position and previously loaded pages.
- [ ] Exhausting the feed shows an explicit end state stating the count.
- [ ] Filtering to zero results shows a recovery path with a one-tap reset.
- [ ] `curl -s http://localhost:3001/ | grep -c "Dev login"` returns `0`, and the same for `/listings`.
- [ ] Every claim in the page copy is true of the current codebase.
- [ ] Homepage and `/listings` render the same feed and card components.
- [ ] `npm run typecheck`, `npx eslint .` and `npm test` all exit 0.

**Not delivered, by decision:** verified-listings-first ordering. See "Knowingly waived acceptance criterion".

## Manual verification

Automated tests cover pure logic only; these paths need a browser once:

- [ ] Load `/` at 390px signed out — hero band, search bar, tiles, then a full card above the fold.
- [ ] Tap a type tile — the feed narrows in place, the URL gains `propertyType`, and the page does not navigate.
- [ ] Open the suggestion sheet — the tapped type is already reflected; change it and confirm the tile updates.
- [ ] Scroll to the bottom with no filters — more listings append without a button, then an end state states the count.
- [ ] Filter to something with no matches — the empty state offers a reset that works.
- [ ] Open a listing, press back — scroll position and all loaded pages are restored.
- [ ] Tap the heart signed out — routed to onboarding, not blocked on arrival.
- [ ] Sign in with the dev harness at `/dev-login`, return to `/` — hero and value props are gone.
