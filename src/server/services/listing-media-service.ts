import "server-only";

import { appEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/db/supabase";

function sanitizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function createListingImageUploadTargets(input: {
  files: Array<{
    contentType: string;
    fileName: string;
  }>;
  listingId: string;
}) {
  const adminClient = getSupabaseAdminClient();
  const bucketName = appEnv.listingMediaBucket();
  const bucket = adminClient.storage.from(bucketName);

  const uploads = await Promise.all(
    input.files.map(async (file, index) => {
      const safeFileName = sanitizeFileName(file.fileName || `image-${index + 1}.webp`);
      const path = `listings/${input.listingId}/${crypto.randomUUID()}-${safeFileName}`;
      const { data, error } = await bucket.createSignedUploadUrl(path, {
        upsert: false,
      });

      if (error || !data) {
        throw error ?? new Error("Unable to create signed upload URL.");
      }

      const publicUrl = bucket.getPublicUrl(path).data.publicUrl;

      return {
        contentType: file.contentType,
        path,
        publicUrl,
        token: data.token,
      };
    }),
  );

  return {
    bucket: bucketName,
    uploads,
  };
}
