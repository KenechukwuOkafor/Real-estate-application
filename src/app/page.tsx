import { HomeHeroActions } from "@/components/home-hero-actions";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(196,214,181,0.55),_transparent_32%),linear-gradient(180deg,_#f7f4ec_0%,_#f1ede4_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-14">
        <section className="rounded-[2rem] border border-stone-900/10 bg-white/75 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)] backdrop-blur md:p-12">
          <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.28em] text-stone-500">
                  Ruvo
                </p>
                <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
                  Trust-first real estate infrastructure for verified rentals.
                </h1>
              </div>
              <div className="rounded-full border border-emerald-900/15 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900">
                Slice 1 in progress
              </div>
            </div>

            <p className="max-w-3xl text-lg leading-8 text-stone-700">
              Ruvo now has a public listing slice, account bootstrap endpoints,
              and role-aware onboarding. The next product work builds directly
              on verified users, agents, and moderated listings.
            </p>

            <HomeHeroActions />

            <div className="grid gap-4 md:grid-cols-3">
              <article className="rounded-3xl border border-stone-900/10 bg-stone-50 p-5">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-500">
                  Market
                </p>
                <h2 className="mt-3 text-xl font-semibold">Nsukka first</h2>
                <p className="mt-2 text-sm leading-7 text-stone-700">
                  Launch for students and local renters, then expand to Enugu,
                  Port Harcourt, Lagos, and Abuja.
                </p>
              </article>

              <article className="rounded-3xl border border-stone-900/10 bg-stone-50 p-5">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-500">
                  Principle
                </p>
                <h2 className="mt-3 text-xl font-semibold">Verified only</h2>
                <p className="mt-2 text-sm leading-7 text-stone-700">
                  Clear pricing, structured details, in-app communication, and
                  moderation-backed trust.
                </p>
              </article>

              <article className="rounded-3xl border border-stone-900/10 bg-stone-50 p-5">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-500">
                  Stack
                </p>
                <h2 className="mt-3 text-xl font-semibold">Next.js + Supabase</h2>
                <p className="mt-2 text-sm leading-7 text-stone-700">
                  Node.js backend routes, Postgres with RLS, Clerk auth,
                  Paystack billing, Sentry monitoring.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            "ARCHITECTURE.md",
            "SCHEMA.md",
            "API_CONTRACTS.md",
            "AGENT_RULES.md",
          ].map((item) => (
            <div
              key={item}
              className="rounded-3xl border border-stone-900/10 bg-white/70 p-5 shadow-[0_12px_40px_rgba(48,38,24,0.06)]"
            >
              <p className="text-sm font-medium text-stone-500">Working spec</p>
              <p className="mt-2 text-lg font-semibold">{item}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
