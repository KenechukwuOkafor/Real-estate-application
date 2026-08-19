"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/db/supabase/browser";

type ListingImagesFormProps = {
  listingId: string;
};

export function ListingImagesForm({ listingId }: ListingImagesFormProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedPreviews, setUploadedPreviews] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    if (selectedFiles.length === 0) {
      setError("Select at least one image to upload.");
      setIsSubmitting(false);
      return;
    }

    const uploadTargetsResponse = await fetch(
      `/api/agent/listings/${listingId}/image-upload-urls`,
      {
        body: JSON.stringify({
          files: selectedFiles.map((file) => ({
            contentType: file.type,
            fileName: file.name,
          })),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );

    const uploadTargetsPayload = (await uploadTargetsResponse.json().catch(() => null)) as
      | {
          data?: {
            bucket?: string;
            uploads?: Array<{
              path: string;
              publicUrl: string;
              token: string;
            }>;
          };
          error?: { message?: string };
        }
      | null;

    if (!uploadTargetsResponse.ok || !uploadTargetsPayload?.data?.uploads) {
      setError(uploadTargetsPayload?.error?.message ?? "Unable to prepare image uploads.");
      setIsSubmitting(false);
      return;
    }

    const bucketName = uploadTargetsPayload.data.bucket ?? "listing-media";
    const uploads = uploadTargetsPayload.data.uploads;
    const supabase = createSupabaseBrowserClient();

    const uploadResults = await Promise.all(
      uploads.map(async (upload, index) => {
        const file = selectedFiles[index];
        const result = await supabase.storage
          .from(bucketName)
          .uploadToSignedUrl(upload.path, upload.token, file, {
            contentType: file.type,
          });

        if (result.error) {
          throw result.error;
        }

        return upload;
      }),
    ).catch((uploadError) => {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload images to storage.",
      );
      setIsSubmitting(false);
      return null;
    });

    if (!uploadResults) {
      return;
    }

    const response = await fetch(`/api/agent/listings/${listingId}/images`, {
      body: JSON.stringify({
        // Path and ordering only — the server reads URL, type and size from
        // the object it can see in the bucket.
        images: uploadResults.map((upload, index) => ({
          position: index,
          storagePath: upload.path,
        })),
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const payload = (await response.json().catch(() => null)) as
      | { data?: { count?: number }; error?: { message?: string } }
      | null;

    if (!response.ok) {
      setError(payload?.error?.message ?? "Unable to register listing images.");
      setIsSubmitting(false);
      return;
    }

    setUploadedPreviews(uploadResults.map((upload) => upload.publicUrl));
    setMessage(`Images registered. Active image count: ${payload?.data?.count ?? 0}.`);
    setIsSubmitting(false);
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <input
        accept="image/*"
        className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm"
        multiple
        onChange={(event) =>
          setSelectedFiles(Array.from(event.target.files ?? []))
        }
        type="file"
      />
      {selectedFiles.length > 0 ? (
        <p className="text-xs text-stone-600">
          {selectedFiles.length} file(s) selected.
        </p>
      ) : null}
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
      {uploadedPreviews.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {uploadedPreviews.map((preview) => (
            <img
              key={preview}
              alt="Uploaded listing preview"
              className="aspect-square rounded-xl object-cover"
              src={preview}
            />
          ))}
        </div>
      ) : null}
      <button
        className="self-start rounded-full border border-stone-900/10 bg-white px-4 py-2 text-sm font-medium text-stone-800 disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Uploading..." : "Upload images"}
      </button>
    </form>
  );
}
