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
    <main className="px-5 py-8 md:px-8 md:py-10 text-ink">
      <div className="mx-auto max-w-5xl rounded-hero border border-line bg-card p-8 shadow-raised">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-subtle">
          Draft listing
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Create a listing draft.
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-body">
          Drafts are free and unlimited. Verification and a submission slot are
          checked later, when you submit this listing for review.
        </p>

        <div className="mt-6 rounded-inset bg-sunken p-5 text-sm leading-7 text-body">
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
