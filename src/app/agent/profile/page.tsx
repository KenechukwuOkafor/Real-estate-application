import Link from "next/link";
import { redirect } from "next/navigation";

import { AgentAvatarForm } from "@/features/agents/components/agent-avatar-form";
import { AgentProfileForm } from "@/features/agents/components/agent-profile-form";
import { getAgentOnboardingContext } from "@/server/services/agent-service";
import { signAgentAvatarPath } from "@/server/services/listing-media-service";
import { createSupabaseAuthenticatedClient } from "@/lib/db/supabase/authenticated";

export const dynamic = "force-dynamic";

export default async function AgentProfilePage() {
  const context = await getAgentOnboardingContext().catch(() => null);

  if (!context) {
    redirect("/dashboard");
  }

  const avatarUrl = context.agentProfile?.avatar_path
    ? await signAgentAvatarPath(
        await createSupabaseAuthenticatedClient(),
        context.agentProfile.avatar_path,
      )
    : null;

  return (
    <main className="px-5 py-8 md:px-8 md:py-10 text-stone-900">
      <div className="mx-auto max-w-4xl rounded-[2rem] border border-stone-900/10 bg-white/85 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
          Agent profile
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Set up your public agent identity.
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-700">
          This is what a seeker sees when you send them your link.{" "}
          {context.agentProfile ? (
            <Link
              className="underline underline-offset-4"
              href={`/a/${context.agentProfile.handle}`}
            >
              See your page
            </Link>
          ) : null}
        </p>

        <div className="mt-8 flex flex-col gap-8">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Photo</h2>
            {context.agentProfile ? (
              <AgentAvatarForm initialAvatarUrl={avatarUrl} />
            ) : (
              <p className="text-sm leading-6 text-stone-700">
                Save your name below first — a photo needs a profile to belong
                to.
              </p>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Name and bio</h2>
            <AgentProfileForm
              initialBio={context.agentProfile?.bio}
              initialDisplayName={context.agentProfile?.display_name}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
