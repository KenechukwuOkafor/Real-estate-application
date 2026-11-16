import { redirect } from "next/navigation";

import { SuspensionNoticePanel } from "@/features/agents/components/suspension-notice-panel";
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
    "Verification cannot be sent again while your account is suspended.",
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
    <main className="px-5 py-8 md:px-8 md:py-10 text-ink">
      <div className="mx-auto max-w-4xl rounded-hero border border-line bg-card p-8 shadow-raised">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-subtle">
          Verification
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Submit verification for review.
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-body">
          {statusCopy[status]}
        </p>

        {/*
          Through own_agent_rejection_reason(), not a column. See 0027: the
          same grant that would let an agent read their own note would let any
          signed-in user read every verified agent's.
        */}
        {status === "rejected" && context.rejectionReason ? (
          <div className="mt-6 rounded-inset border border-fix-line bg-fix-surface p-5 text-sm leading-7 text-fix-ink">
            <p className="font-medium">Why this was rejected</p>
            <p className="mt-1">{context.rejectionReason}</p>
          </div>
        ) : null}

        {status === "suspended" ? (
          <div className="mt-6">
            <SuspensionNoticePanel
              agent={{
                displayName: context.agentProfile?.display_name ?? null,
                handle: context.agentProfile?.handle ?? null,
              }}
              reason={context.suspensionReason}
            />
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
