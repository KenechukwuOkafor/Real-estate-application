import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAppUser } from "@/server/services/user-sync-service";

export const dynamic = "force-dynamic";

function getPrimaryCta(roles: string[]) {
  if (roles.includes("admin")) {
    return {
      href: "/admin/verification",
      label: "Open admin review",
    };
  }

  if (roles.includes("agent")) {
    return {
      href: "/agent",
      label: "Open agent workspace",
    };
  }

  return {
    href: "/listings",
    label: "Browse listings",
  };
}

export default async function DashboardPage() {
  const result = await getCurrentAppUser();

  if (!result || result.roles.length === 0) {
    redirect("/onboarding");
  }

  const primaryCta = getPrimaryCta(result.roles);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="rounded-[2rem] border border-stone-900/10 bg-white/85 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Dashboard
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Welcome{result.user.full_name ? `, ${result.user.full_name}` : ""}.
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-700">
            Your Ruvo account is active. Use the shortcuts below to jump to your
            workspace, inspect listings, or manage your active conversations.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {result.roles.map((role) => (
              <span
                key={role}
                className="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium capitalize text-stone-700"
              >
                {role}
              </span>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white"
              href={primaryCta.href}
            >
              {primaryCta.label}
            </Link>
            <Link
              className="rounded-full border border-stone-900/10 bg-white px-5 py-3 text-sm font-medium text-stone-800"
              href="/chats"
            >
              Open chats
            </Link>
            {result.roles.includes("admin") ? (
              <Link
                className="rounded-full border border-stone-900/10 bg-white px-5 py-3 text-sm font-medium text-stone-800"
                href="/admin/listings"
              >
                Open listing moderation
              </Link>
            ) : null}
            <Link
              className="rounded-full border border-stone-900/10 bg-white px-5 py-3 text-sm font-medium text-stone-800"
              href="/onboarding"
            >
              Update roles
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
