import { redirect } from "next/navigation";

import { AgentProfileForm } from "@/features/agents/components/agent-profile-form";
import { getAgentOnboardingContext } from "@/server/services/agent-service";

export const dynamic = "force-dynamic";

export default async function AgentProfilePage() {
  const context = await getAgentOnboardingContext().catch(() => null);

  if (!context) {
    redirect("/dashboard");
  }

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
          This profile anchors listings, verification, and future messaging.
        </p>

        <div className="mt-8">
          <AgentProfileForm
            initialBio={context.agentProfile?.bio}
            initialDisplayName={context.agentProfile?.display_name}
          />
        </div>
      </div>
    </main>
  );
}
