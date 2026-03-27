import { redirect } from "next/navigation";

import { DraftListingForm } from "@/features/agents/components/draft-listing-form";
import { getCurrentAgentContext } from "@/server/services/agent-service";

export const dynamic = "force-dynamic";

export default async function NewAgentListingPage() {
  const context = await getCurrentAgentContext().catch(() => null);

  if (!context) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto max-w-5xl rounded-[2rem] border border-stone-900/10 bg-white/85 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
          Draft listing
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Create a listing draft.
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-700">
          This creates a draft only. Submission, moderation, and media workflows
          will build in the next step.
        </p>

        <div className="mt-8">
          <DraftListingForm />
        </div>
      </div>
    </main>
  );
}
