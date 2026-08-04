import { redirect } from "next/navigation";

import { VerificationReviewActions } from "@/features/admin/components/verification-review-actions";
import { listAdminVerificationQueue } from "@/server/services/admin-service";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";

type VerificationDocument = {
  type: string;
  url: string;
};

function parseDocuments(value: Json): VerificationDocument[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const type = "type" in item && typeof item.type === "string" ? item.type : "";
    const url = "url" in item && typeof item.url === "string" ? item.url : "";

    if (!type || !url) {
      return [];
    }

    return [{ type, url }];
  });
}

export default async function AdminVerificationPage() {
  const submissions = await listAdminVerificationQueue().catch(() => null);

  if (!submissions) {
    redirect("/dashboard");
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
            const documents = parseDocuments(submission.documents);

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
                          No valid document links were supplied.
                        </p>
                      ) : (
                        documents.map((document) => (
                          <a
                            key={`${submission.id}-${document.type}-${document.url}`}
                            className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm text-stone-800 hover:bg-stone-100"
                            href={document.url}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {document.type}: {document.url}
                          </a>
                        ))
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
