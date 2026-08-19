import { redirect } from "next/navigation";

import { VerificationReviewActions } from "@/features/admin/components/verification-review-actions";
import { getSupabaseAdminClient } from "@/lib/db/supabase";
import { listAdminVerificationQueue } from "@/server/services/admin-service";
import { listVerificationDocumentsForSubmissions } from "@/server/repositories/agents-repository";
import { signVerificationDocumentPaths } from "@/server/services/listing-media-service";

export const dynamic = "force-dynamic";

export default async function AdminVerificationPage() {
  const submissions = await listAdminVerificationQueue().catch(() => null);

  if (!submissions) {
    redirect("/dashboard");
  }

  // Documents are rows now, not a jsonb blob of agent-typed links, and they
  // live in a private bucket. Rendering them means minting short-lived signed
  // URLs — 60 seconds, because an admin review renders once and these are
  // government IDs. A public link would defeat BR-MEDIA-003 entirely.
  const adminClient = getSupabaseAdminClient();
  const documentRows = await listVerificationDocumentsForSubmissions(
    adminClient,
    submissions.map((submission) => submission.id),
  );
  const signedDocuments = await signVerificationDocumentPaths(
    adminClient,
    documentRows.map((row) => row.storage_path),
  );
  const documentsBySubmission = new Map<string, typeof documentRows>();
  for (const row of documentRows) {
    const existing = documentsBySubmission.get(row.agent_verification_submission_id) ?? [];
    existing.push(row);
    documentsBySubmission.set(row.agent_verification_submission_id, existing);
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="rounded-[2rem] border border-stone-900/10 bg-white/85 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Admin verification
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Review pending agent submissions.
          </h1>
        </section>

        {submissions.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-stone-900/15 bg-white/75 p-8 text-stone-600">
            No verification submissions currently require review.
          </div>
        ) : null}

        <section className="grid gap-5">
          {submissions.map((submission) => {
            const documents = documentsBySubmission.get(submission.id) ?? [];

            return (
              <article
                key={submission.id}
                className="rounded-[1.75rem] border border-stone-900/10 bg-white/85 p-6 shadow-[0_16px_40px_rgba(48,38,24,0.06)]"
              >
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                      <span>{submission.agent_profiles?.verification_status ?? "unknown"}</span>
                      <span>{submission.submitted_at}</span>
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold">
                      {submission.full_legal_name}
                    </h2>
                    <p className="mt-2 text-sm text-stone-700">
                      Agent: {submission.agent_profiles?.display_name ?? "Unknown"}
                    </p>
                    {submission.agent_profiles?.bio ? (
                      <p className="mt-3 text-sm leading-7 text-stone-700">
                        {submission.agent_profiles.bio}
                      </p>
                    ) : null}
                    {submission.notes ? (
                      <p className="mt-4 rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-800">
                        Reviewer notes from agent: {submission.notes}
                      </p>
                    ) : null}

                    <div className="mt-5 grid gap-3">
                      {documents.length === 0 ? (
                        <p className="text-sm text-stone-500">
                          No documents were uploaded with this submission.
                        </p>
                      ) : (
                        documents.map((document) => {
                          const signedUrl = signedDocuments.get(document.storage_path);

                          return (
                            <a
                              key={document.id}
                              className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm text-stone-800 hover:bg-stone-100"
                              href={signedUrl ?? undefined}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <span className="font-medium">
                                {document.document_type.replaceAll("_", " ")}
                              </span>
                              <span className="ml-2 text-stone-500">
                                {document.mime_type} ·{" "}
                                {Math.round(document.size_bytes / 1024)} KB
                              </span>
                              {/*
                                The original filename is shown here and nowhere
                                else. BR-MEDIA-004 keeps it out of the storage
                                path and out of every URL; it survives only as
                                a database column so a reviewer has some human
                                context for what they are looking at.
                              */}
                              {document.original_filename ? (
                                <span className="mt-1 block text-xs text-stone-500">
                                  uploaded as {document.original_filename}
                                </span>
                              ) : null}
                              <span className="mt-1 block text-xs text-stone-400">
                                Link expires in 60 seconds
                              </span>
                            </a>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="min-w-[320px] lg:max-w-sm">
                    <VerificationReviewActions submissionId={submission.id} />
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
