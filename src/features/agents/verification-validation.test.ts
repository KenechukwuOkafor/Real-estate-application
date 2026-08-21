/**
 * What a verification submission has to contain.
 *
 * The product tells seekers its agents are reviewed, and the homepage stops
 * short of "identity-verified" precisely because this layer did not require an
 * identity document — one utility bill satisfied it. These assertions are the
 * claim made enforceable: a submission has to carry a government ID before an
 * administrator ever sees it.
 */
import { describe, expect, it } from "vitest";

import { validateVerificationSubmissionInput } from "@/features/agents/validation";
import { AppError } from "@/lib/api/errors";
import type { AgentVerificationSubmissionInput } from "@/features/agents/types";
import type { ErrorDetails } from "@/lib/api/error-details";

function submission(
  documents: Array<{ documentType: string; storagePath: string }>,
): AgentVerificationSubmissionInput {
  return { documents, fullLegalName: "Ada Obi" };
}

function issuesOf(run: () => void) {
  try {
    run();
  } catch (error) {
    const details = (error as AppError).details as ErrorDetails | undefined;
    return details?.kind === "validation" ? details.issues : [];
  }

  return null;
}

describe("validateVerificationSubmissionInput — government ID", () => {
  it("accepts a submission carrying a government ID", () => {
    expect(() =>
      validateVerificationSubmissionInput(
        submission([
          { documentType: "government_id", storagePath: "agent/1/id.jpg" },
        ]),
      ),
    ).not.toThrow();
  });

  it("accepts a government ID alongside other documents", () => {
    expect(() =>
      validateVerificationSubmissionInput(
        submission([
          { documentType: "utility_bill", storagePath: "agent/1/bill.pdf" },
          { documentType: "government_id", storagePath: "agent/1/id.jpg" },
        ]),
      ),
    ).not.toThrow();
  });

  it("rejects a submission of only a utility bill", () => {
    // The exact hole: this passed, and the agent reached `verified` on it.
    expect(() =>
      validateVerificationSubmissionInput(
        submission([
          { documentType: "utility_bill", storagePath: "agent/1/bill.pdf" },
        ]),
      ),
    ).toThrow(AppError);
  });

  it("rejects a CAC certificate and agency licence with no identity document", () => {
    expect(() =>
      validateVerificationSubmissionInput(
        submission([
          { documentType: "cac_certificate", storagePath: "agent/1/cac.pdf" },
          { documentType: "agency_license", storagePath: "agent/1/lic.pdf" },
        ]),
      ),
    ).toThrow(AppError);
  });

  it("says which input to fix rather than only that something is wrong", () => {
    const issues = issuesOf(() =>
      validateVerificationSubmissionInput(
        submission([
          { documentType: "utility_bill", storagePath: "agent/1/bill.pdf" },
        ]),
      ),
    );

    expect(issues).toEqual([{ field: "governmentId", rule: "required" }]);
  });

  it("still rejects a submission with no documents at all", () => {
    expect(() => validateVerificationSubmissionInput(submission([]))).toThrow(
      AppError,
    );
  });
});
