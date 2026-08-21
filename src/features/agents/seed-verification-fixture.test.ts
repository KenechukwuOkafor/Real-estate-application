/**
 * The seeded verification has to be a state the product could produce.
 *
 * The seeded agent sat at verification_status 'verified' with no submission
 * and no documents. Nothing in the product can reach that: an agent becomes
 * verified only by submitting documents an admin approves. Local testing
 * therefore never exercised the verification gate, and after the government-ID
 * requirement landed the seed represented something the validator would now
 * refuse.
 *
 * This reads the real seed file and runs the real validator over what it
 * contains, so the two cannot drift. Removing the government ID from the seed
 * fails here rather than silently restoring an unreachable state.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateVerificationSubmissionInput } from "@/features/agents/validation";

const seed = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");

/**
 * Pull the (document_type, storage_path) pairs out of the
 * verification_documents insert. Deliberately parses the file rather than
 * importing a shared constant: a constant both sides read would agree with
 * itself even if the SQL had drifted from it.
 */
function seededVerificationDocuments() {
  const insertStart = seed.indexOf("insert into public.verification_documents");
  expect(insertStart).toBeGreaterThan(-1);

  // Strip line comments before looking for the statement terminator: a ";"
  // inside a comment would end the slice early and hide most of the rows.
  const insertBody = seed
    .slice(insertStart)
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  const endOfStatement = insertBody.indexOf(";");
  const statement = insertBody.slice(0, endOfStatement);

  const documents: Array<{ documentType: string; storagePath: string }> = [];
  const pattern = /'(government_id|cac_certificate|utility_bill|agency_license)',\s*\n\s*'(verification\/[^']+)'/g;

  for (const match of statement.matchAll(pattern)) {
    documents.push({ documentType: match[1], storagePath: match[2] });
  }

  return documents;
}

describe("seeded verification submission", () => {
  it("seeds at least one document", () => {
    expect(seededVerificationDocuments().length).toBeGreaterThan(0);
  });

  it("would be accepted by the validator the product runs", () => {
    expect(() =>
      validateVerificationSubmissionInput({
        documents: seededVerificationDocuments(),
        fullLegalName: "Chinedu Prime Okeke",
      }),
    ).not.toThrow();
  });

  it("includes a government ID, without which the agent could not be verified", () => {
    expect(
      seededVerificationDocuments().map((document) => document.documentType),
    ).toContain("government_id");
  });

  it("files every document under the agent's own verification prefix", () => {
    // The service only trusts a path that names an object under this agent's
    // prefix, so a seeded path outside it would describe an upload the product
    // would have rejected.
    for (const document of seededVerificationDocuments()) {
      expect(document.storagePath).toMatch(
        /^verification\/fbbda28e-2358-49c2-ab0a-e472d7db6001\//,
      );
    }
  });

  it("no longer leaves the verified agent with a bare status and no evidence", () => {
    expect(seed).toContain("insert into public.agent_verification_submissions");
  });
});
