import { notFound } from "next/navigation";

import { DevLoginPanel } from "@/features/auth/components/dev-login-panel";
import { DEV_AUTH_USERS, isDevAuthEnabled } from "@/lib/auth/dev-auth";

export const dynamic = "force-dynamic";

export default function DevLoginPage() {
  if (!isDevAuthEnabled()) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <section className="rounded-[2rem] border border-stone-900/10 bg-white/85 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Development login
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Enter the app with a seeded test user.
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-700">
            This page is intended for local development only. It sets a dev auth
            cookie that maps to seeded Ruvo users already present in the database.
          </p>
        </section>

        <DevLoginPanel users={DEV_AUTH_USERS} />
      </div>
    </main>
  );
}
