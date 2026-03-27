import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAppUser } from "@/server/services/user-sync-service";

export const dynamic = "force-dynamic";

export default async function AgentWorkspacePage() {
  const result = await getCurrentAppUser();

  if (!result || !result.roles.includes("agent")) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <section className="rounded-[2rem] border border-stone-900/10 bg-white/85 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Agent workspace
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Agent tools start here.
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-700">
            Profile setup, verification submission, and draft listing creation are
            now active.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            {
              description: "Create or update the public-facing identity for your listings.",
              href: "/agent/profile",
              title: "Agent profile",
            },
            {
              description: "Submit legal name and evidence links for manual review.",
              href: "/agent/verification",
              title: "Verification",
            },
            {
              description: "Create a draft listing before media and moderation steps.",
              href: "/agent/listings/new",
              title: "New draft listing",
            },
            {
              description: "Register listing images and submit drafts for moderation.",
              href: "/agent/listings",
              title: "Manage listings",
            },
          ].map((item) => (
            <Link
              key={item.href}
              className="rounded-[1.75rem] border border-stone-900/10 bg-white/85 p-6 shadow-[0_16px_40px_rgba(48,38,24,0.06)] transition-transform hover:-translate-y-1"
              href={item.href}
            >
              <h2 className="text-2xl font-semibold text-stone-900">{item.title}</h2>
              <p className="mt-3 text-sm leading-7 text-stone-700">
                {item.description}
              </p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
