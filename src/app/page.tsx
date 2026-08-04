/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

import { HomeHeroActions } from "@/components/home-hero-actions";
import { ListingCard } from "@/features/listings/components/listing-card";
import {
  buildListingHref,
  formatPriceNaira,
  formatPropertyType,
} from "@/features/listings/format";
import { listPublicListings } from "@/server/services/public-listings-service";

export default async function Home() {
  const featuredListings = await listPublicListings({ limit: 3, sort: "newest" })
    .then((r) => r.items)
    .catch(() => []);

  const heroCards = featuredListings.slice(0, 2);

  return (
    <main className="min-h-screen text-stone-900">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="bg-[radial-gradient(ellipse_at_top_left,_rgba(196,214,181,0.5),_transparent_55%),linear-gradient(160deg,_#f5f1e8_0%,_#ede6d8_100%)] px-6 pb-24 pt-14">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_400px]">

            {/* Left — headline + CTAs */}
            <div className="flex flex-col">
              <div className="flex items-center gap-2 self-start rounded-full border border-emerald-800/25 bg-emerald-50 px-4 py-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold tracking-wide text-emerald-900">
                  Live in Nsukka, Enugu
                </span>
              </div>

              <h1 className="mt-7 text-[2.75rem] font-bold leading-[1.05] tracking-tight md:text-[4.5rem]">
                Verified rentals.
                <br />
                <span className="text-stone-500">No surprises.</span>
              </h1>

              <p className="mt-6 max-w-lg text-lg leading-8 text-stone-600">
                Every listing is agent-reviewed, priced upfront, and open for
                in-app inspection. Find your next home without leaving the platform.
              </p>

              <div className="mt-8">
                <HomeHeroActions />
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-stone-900/10 pt-8 text-sm text-stone-500">
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-emerald-700">✓</span> Identity-verified agents
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-stone-900">₦</span> Price always shown upfront
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-sky-700">↗</span> In-app inspection booking
                </span>
              </div>
            </div>

            {/* Right — stacked listing cards (desktop only) */}
            {heroCards.length > 0 ? (
              <div className="relative hidden h-[460px] lg:block">
                {heroCards.map((listing, i) => (
                  <Link
                    key={listing.id}
                    href={buildListingHref(listing.slug, listing.publicId)}
                    className={`absolute w-72 overflow-hidden rounded-[1.5rem] border border-stone-900/10 bg-white shadow-[0_24px_64px_rgba(48,38,24,0.16)] transition-transform hover:-translate-y-1 ${
                      i === 0
                        ? "left-0 top-0 rotate-[-2.5deg]"
                        : "left-20 top-20 rotate-[2deg]"
                    }`}
                  >
                    <div className="aspect-[4/3] bg-stone-100">
                      {listing.coverImageUrl ? (
                        <img
                          src={listing.coverImageUrl}
                          alt={listing.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#d9d2c4,#ece6d8)] text-xs uppercase tracking-widest text-stone-500">
                          Ruvo
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                          {formatPropertyType(listing.propertyType)}
                        </p>
                        {listing.agent.isVerified && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                            Verified
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 truncate font-semibold text-stone-900">
                        {listing.title}
                      </p>
                      <p className="mt-1 text-lg font-bold text-stone-900">
                        {formatPriceNaira(listing.priceNaira)}
                      </p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {listing.area}, {listing.city}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── TRUST PILLARS ──────────────────────────────────────────────────── */}
      <section className="border-y border-stone-900/8 bg-white px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-stone-900/8">

            <div className="flex flex-col gap-4 md:px-10 md:first:pl-0 md:last:pr-0">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">
                🛡
              </div>
              <div>
                <h2 className="text-lg font-bold text-stone-900">
                  Verified agents only
                </h2>
                <p className="mt-2 text-sm leading-7 text-stone-500">
                  Every agent is identity-checked before they can publish. A
                  single bad actor cannot flood the feed with fake listings.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4 md:px-10">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-xl font-black text-amber-800">
                ₦
              </div>
              <div>
                <h2 className="text-lg font-bold text-stone-900">
                  Price upfront, always
                </h2>
                <p className="mt-2 text-sm leading-7 text-stone-500">
                  Annual rent is shown on every card and detail page. No &ldquo;DM
                  for price&rdquo;, no call-for-quote, no post-viewing surprises.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4 md:px-10">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-2xl">
                📋
              </div>
              <div>
                <h2 className="text-lg font-bold text-stone-900">
                  Inspection in-app
                </h2>
                <p className="mt-2 text-sm leading-7 text-stone-500">
                  Send an inspection request from any listing page. The agent
                  responds in-app. No WhatsApp cold messages, no guesswork.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── LIVE LISTINGS ──────────────────────────────────────────────────── */}
      {featuredListings.length > 0 && (
        <section className="bg-[linear-gradient(180deg,_#f5f1e8_0%,_#ede6d8_100%)] px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-500">
                  Available now
                </p>
                <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
                  Live in Nsukka
                </h2>
              </div>
              <Link
                className="rounded-full border border-stone-900/15 bg-white px-5 py-2.5 text-sm font-medium text-stone-800 shadow-sm transition-colors hover:bg-stone-50"
                href="/listings"
              >
                See all listings →
              </Link>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {featuredListings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── HOW IT WORKS ───────────────────────────────────────────────────── */}
      <section className="bg-white px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-400">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
              From browse to move-in.
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                n: "01",
                color: "text-emerald-600",
                bg: "bg-emerald-50",
                title: "Browse verified listings",
                body: "Filter by area, property type, bedrooms, and budget. Every result is reviewed and agent-backed.",
                cta: null,
              },
              {
                n: "02",
                color: "text-amber-600",
                bg: "bg-amber-50",
                title: "Request an inspection",
                body: "Create a free account and fire off an inspection request from any listing. The agent accepts or declines in-app — no phone calls needed.",
                cta: null,
              },
              {
                n: "03",
                color: "text-sky-600",
                bg: "bg-sky-50",
                title: "Chat and move in",
                body: "Coordinate the viewing through your dedicated chat thread. Once satisfied, arrange rent on your own terms.",
                cta: null,
              },
            ].map((step) => (
              <div
                key={step.n}
                className="rounded-[1.75rem] border border-stone-900/8 bg-stone-50 p-8"
              >
                <p className={`text-5xl font-black ${step.color}`}>{step.n}</p>
                <h3 className="mt-5 text-xl font-bold text-stone-900">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-stone-500">{step.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link
              className="rounded-full bg-stone-900 px-8 py-4 text-sm font-semibold text-white transition-colors hover:bg-stone-800"
              href="/listings"
            >
              Start browsing
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOR AGENTS ─────────────────────────────────────────────────────── */}
      <section className="px-6 py-6">
        <div className="mx-auto max-w-6xl">
          <div className="overflow-hidden rounded-[2.5rem] bg-stone-900 px-10 py-14 shadow-[0_32px_80px_rgba(48,38,24,0.18)] md:px-16 md:py-16">
            <div className="grid gap-10 md:grid-cols-[1fr_auto] md:items-center">

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-400">
                  For agents
                </p>
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-white md:text-5xl">
                  List your property
                  <br />
                  <span className="text-stone-400">on Ruvo.</span>
                </h2>
                <p className="mt-5 max-w-lg text-base leading-8 text-stone-400">
                  Create a verified profile, submit listings for moderation, and connect
                  with students and renters in Nsukka who are actively searching.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <span className="text-xl">📸</span>
                    <div>
                      <p className="text-xs font-semibold text-white">Structured listings</p>
                      <p className="text-xs text-stone-500">Images, pricing, amenities</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <span className="text-xl">💬</span>
                    <div>
                      <p className="text-xs font-semibold text-white">In-app enquiries</p>
                      <p className="text-xs text-stone-500">No cold calls, no spam</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-3 md:min-w-[200px]">
                <Link
                  className="rounded-full bg-white px-7 py-4 text-center text-sm font-bold text-stone-900 transition-colors hover:bg-stone-100"
                  href="/onboarding"
                >
                  Get started free
                </Link>
                <Link
                  className="rounded-full border border-white/15 px-7 py-4 text-center text-sm font-medium text-stone-400 transition-colors hover:border-white/30 hover:text-stone-300"
                  href="/listings"
                >
                  See live listings
                </Link>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className="px-6 py-10 text-center text-xs text-stone-400">
        <p>© 2026 Ruvo · Trust-first rentals, starting in Nsukka.</p>
      </footer>

    </main>
  );
}
