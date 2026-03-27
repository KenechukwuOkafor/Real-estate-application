import { redirect } from "next/navigation";

import { RoleSelectionForm } from "@/features/auth/components/role-selection-form";
import { getCurrentAppUser } from "@/server/services/user-sync-service";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const appUser = await getCurrentAppUser().catch(() => null);

  if (appUser && appUser.roles.length > 0) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <section className="rounded-[2rem] border border-stone-900/10 bg-white/85 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)] md:p-10">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Account setup
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Choose how you want to use Ruvo.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-stone-700">
            Start as a student, an agent, or both. This creates your app profile
            and role permissions in the Ruvo database.
          </p>
        </section>

        <section className="rounded-[2rem] border border-stone-900/10 bg-white/85 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
          <RoleSelectionForm />
        </section>
      </div>
    </main>
  );
}
