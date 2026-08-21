"use client";

import { useState } from "react";

import { VERIFICATION_DOCUMENT_TYPES } from "@/features/agents/types";
import { createSupabaseBrowserClient } from "@/lib/db/supabase/browser";
import { errorCopyForResponse } from "@/features/errors/error-copy";

type PendingDocument = {
  documentType: string;
  file: File;
};

const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

/** Mirrors the bucket's file_size_limit. The bucket is the real enforcement. */
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export function VerificationSubmissionForm() {
  const [fullLegalName, setFullLegalName] = useState("");
  const [notes, setNotes] = useState("");
  const [documentType, setDocumentType] = useState<string>(
    VERIFICATION_DOCUMENT_TYPES[0].value,
  );
  const [pending, setPending] = useState<PendingDocument[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function addFiles(files: FileList | null) {
    if (!files) {
      return;
    }

    setError(null);
    const next: PendingDocument[] = [];

    for (const file of Array.from(files)) {
      // Client-side checks are a courtesy, not the control: the bucket's
      // allowed_mime_types and file_size_limit refuse the upload regardless.
      if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
        setError(`${file.name} is not an accepted type. Upload a JPG, PNG, WEBP or PDF.`);
        continue;
      }

      if (file.size > MAX_DOCUMENT_BYTES) {
        setError(`${file.name} is larger than 10 MB.`);
        continue;
      }

      next.push({ documentType, file });
    }

    setPending((current) => [...current, ...next]);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    if (pending.length === 0) {
      setError("Attach at least one document.");
      setIsSubmitting(false);
      return;
    }

    // 1. Ask the server for signed upload targets. Paths are uuidv7.ext under
    //    this agent's own prefix — the filename never reaches storage.
    const targetsResponse = await fetch("/api/agent/verification-documents/upload-urls", {
      body: JSON.stringify({
        files: pending.map((entry) => ({
          contentType: entry.file.type,
          fileName: entry.file.name,
        })),
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const targetsPayload = (await targetsResponse.json().catch(() => null)) as
      | {
          data?: { bucket?: string; uploads?: Array<{ path: string; token: string }> };
          error?: { message?: string };
        }
      | null;

    if (!targetsResponse.ok || !targetsPayload?.data?.uploads) {
      setError(errorCopyForResponse(targetsPayload));
      setIsSubmitting(false);
      return;
    }

    // 2. Upload straight to the private bucket.
    const supabase = createSupabaseBrowserClient();
    const bucketName = targetsPayload.data.bucket ?? "verification-documents";
    const uploads = targetsPayload.data.uploads;

    try {
      await Promise.all(
        uploads.map(async (upload, index) => {
          const entry = pending[index];
          const result = await supabase.storage
            .from(bucketName)
            .uploadToSignedUrl(upload.path, upload.token, entry.file, {
              contentType: entry.file.type,
            });

          if (result.error) {
            throw result.error;
          }
        }),
      );
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? `Upload rejected: ${uploadError.message}`
          : "Upload rejected by storage.",
      );
      setIsSubmitting(false);
      return;
    }

    // 3. Register the submission against the uploaded paths.
    const response = await fetch("/api/agent/verification-submissions", {
      body: JSON.stringify({
        documents: uploads.map((upload, index) => ({
          documentType: pending[index].documentType,
          originalFilename: pending[index].file.name,
          storagePath: upload.path,
        })),
        fullLegalName,
        notes,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;

    if (!response.ok) {
      setError(errorCopyForResponse(payload));
      setIsSubmitting(false);
      return;
    }

    setPending([]);
    setMessage("Verification submitted for review.");
    setIsSubmitting(false);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={onSubmit}>
      <label className="flex flex-col gap-2 text-sm text-stone-700">
        <span>Full legal name</span>
        <input
          className="h-12 rounded-2xl border border-stone-900/10 bg-white px-4"
          onChange={(event) => setFullLegalName(event.target.value)}
          placeholder="As it appears on your ID"
          value={fullLegalName}
        />
      </label>

      <fieldset className="flex flex-col gap-3 rounded-2xl border border-stone-900/10 bg-white p-4">
        <legend className="px-1 text-sm text-stone-700">Documents</legend>

        <label className="flex flex-col gap-2 text-sm text-stone-700">
          <span>Document type</span>
          <select
            className="h-12 rounded-2xl border border-stone-900/10 bg-white px-4"
            onChange={(event) => setDocumentType(event.target.value)}
            value={documentType}
          >
            {VERIFICATION_DOCUMENT_TYPES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-stone-700">
          <span>Attach file</span>
          <input
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm"
            multiple
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
            type="file"
          />
        </label>

        <p className="text-xs text-stone-500">
          A government ID is required. Add a CAC certificate, utility bill or
          agency licence as well if you have them.
        </p>

        <p className="text-xs text-stone-500">
          JPG, PNG, WEBP or PDF, up to 10 MB each. Documents are stored
          privately and are visible only to you and Ruvo&apos;s review team.
        </p>

        {pending.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {pending.map((entry, index) => (
              <li
                key={`${entry.file.name}-${index}`}
                className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">
                    {VERIFICATION_DOCUMENT_TYPES.find(
                      (type) => type.value === entry.documentType,
                    )?.label ?? entry.documentType}
                  </span>
                  <span className="ml-2 text-stone-600">{entry.file.name}</span>
                </span>
                <button
                  className="text-stone-500 hover:text-stone-900"
                  onClick={() =>
                    setPending((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }
                  type="button"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </fieldset>

      <label className="flex flex-col gap-2 text-sm text-stone-700">
        <span>Notes</span>
        <textarea
          className="min-h-28 rounded-2xl border border-stone-900/10 bg-white px-4 py-3"
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional explanation for the review team."
          value={notes}
        />
      </label>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <div className="flex justify-end">
        <button
          className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Submitting..." : "Submit verification"}
        </button>
      </div>
    </form>
  );
}
