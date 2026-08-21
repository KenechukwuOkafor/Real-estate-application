import { redirect } from "next/navigation";

import { VerificationSubmissionForm } from "@/features/agents/components/verification-submission-form";
import { getAgentOnboardingContext } from "@/server/services/agent-service";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type VerificationStatus =
  Database["public"]["Enums"]["agent_verification_status"];

// Mirrors RESUBMITTABLE_VERIFICATION_STATUSES in agent-service. The server is
// the authority; this only avoids showing a form whose submission would 409.
const SUBMITTABLE_STATUSES: ReadonlySet<VerificationStatus> =
  new Set<VerificationStatus>(["not_submitted", "rejected"]);

const statusCopy: Record<VerificationStatus, string> = {
  not_submitted:
    "Submit your legal name and evidence for manual review. Verified agents can submit listings for review; drafts are free either way.",
  pending_review:
    "Your submission is with the review team. You will be able to submit listings for review once it is approved.",
  rejected:
    "Your last submission was not approved. You can correct it and submit again below.",
  suspended:
    "This account is suspended. Contact support — verification cannot be resubmitted while a suspension is in place.",
  verified:
    "You are verified. You can submit listings for review from your listings workspace.",
};

export default async function AgentVerificationPage() {
  const context = await getAgentOnboardingContext().catch(() => null);

  if (!context) {
    redirect("/dashboard");
  }

  const status: VerificationStatus =
    context.agentProfile?.verification_status ?? "not_submitted";
  const canSubmit = SUBMITTABLE_STATUSES.has(status);

  return (
    <main className="px-5 py-8 md:px-8 md:py-10 text-stone-900">
      <div className="mx-auto max-w-4xl rounded-[2rem] border border-stone-900/10 bg-white/85 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
          Verification
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Submit verification for review.
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-700">
          {statusCopy[status]}
        </p>

        {status === "rejected" && context.agentProfile?.rejection_reason ? (
          <div className="mt-6 rounded-[1.5rem] border border-rose-200 bg-rose-50 p-5 text-sm leading-7 text-rose-900">
            <p className="font-medium">Why this was rejected</p>
            <p className="mt-1">{context.agentProfile.rejection_reason}</p>
          </div>
        ) : null}

        {canSubmit ? (
          <div className="mt-8">
            <VerificationSubmissionForm />
          </div>
        ) : null}
      </div>
    </main>
  );
}
