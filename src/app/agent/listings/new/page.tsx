import { redirect } from "next/navigation";

import { ListingForm } from "@/features/agents/components/listing-form";
import {
  getCurrentAgentContext,
  getCurrentAgentListingEntitlement,
} from "@/server/services/agent-service";

export const dynamic = "force-dynamic";

export default async function NewAgentListingPage() {
  const context = await getCurrentAgentContext().catch(() => null);
  const entitlement = await getCurrentAgentListingEntitlement().catch(() => null);

  if (!context || !entitlement) {
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
          Drafts are free and unlimited. Verification and a submission slot are
          checked later, when you submit this listing for review.
        </p>

        <div className="mt-6 rounded-[1.5rem] bg-stone-50 p-5 text-sm leading-7 text-stone-700">
          {!entitlement.isVerified
            ? "You can save drafts now. Submitting one for review needs identity verification — start that from Verification in your workspace."
            : entitlement.activeSubscription
              ? `Active ${entitlement.activeSubscription.plan} subscription in place until ${entitlement.activeSubscription.expires_at}.`
              : entitlement.freeListingQuota > 0
                ? `${entitlement.freeListingQuota} submission slot${entitlement.freeListingQuota === 1 ? "" : "s"} remaining.`
                : "No submission slots remaining. You can keep drafting, but submitting for review needs a new slot."}
        </div>

        <div className="mt-8">
          <ListingForm />
        </div>
      </div>
    </main>
  );
}
