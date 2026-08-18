import "server-only";

/**
 * SERVICE ROLE, deliberately.
 *
 * Both functions operate on Supabase Storage, not on public tables, so RLS
 * policies do not apply to them at all. Issuing a signed upload URL and
 * listing a bucket prefix both require the service key; the anon key cannot
 * mint upload tokens.
 *
 * Ownership is enforced by the callers in agent-service, which resolve the
 * listing through getOwnedListing on the RLS-respecting client before either
 * function is reached — so a caller who does not own the listing never gets
 * far enough to obtain a token or read the prefix.
 */

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

export function buildListingImagePrefix(listingId: string) {
  return `listings/${listingId}`;
}

export type UploadedListingImageObject = {
  mimeType: string;
  publicUrl: string;
  sizeBytes: number;
  storagePath: string;
};

/**
 * Index the objects that actually exist under a listing's media prefix.
 *
 * This is what makes image registration verifiable. Uploading to a path
 * requires a token that only createListingImageUploadTargets issues, so an
 * object existing under `listings/<listingId>/` is proof that an upload target
 * was issued for *this* listing and used. Registration matches client-supplied
 * paths against this map and rejects anything absent, which closes the hole
 * where a caller could register rows pointing at arbitrary storage paths — or
 * at another agent's listing media.
 *
 * Metadata is returned alongside so callers can persist the object's real
 * content type and size rather than the client's claim about them.
 */
export async function listUploadedListingImageObjects(listingId: string) {
  const adminClient = getSupabaseAdminClient();
  const bucketName = appEnv.listingMediaBucket();
  const bucket = adminClient.storage.from(bucketName);
  const prefix = buildListingImagePrefix(listingId);

  // A listing caps at 10 active images, but the prefix also holds uploads that
  // were never registered, so the ceiling is generous rather than tight.
  const { data, error } = await bucket.list(prefix, { limit: 1000 });

  if (error) {
    throw error;
  }

  const objects = new Map<string, UploadedListingImageObject>();

  for (const object of data ?? []) {
    // Supabase returns a null-id placeholder row for nested prefixes.
    if (!object.id) {
      continue;
    }

    const storagePath = `${prefix}/${object.name}`;
    const metadata = object.metadata as
      | { mimetype?: unknown; size?: unknown }
      | null;

    objects.set(storagePath, {
      mimeType:
        typeof metadata?.mimetype === "string"
          ? metadata.mimetype
          : "application/octet-stream",
      publicUrl: bucket.getPublicUrl(storagePath).data.publicUrl,
      sizeBytes: typeof metadata?.size === "number" ? metadata.size : 0,
      storagePath,
    });
  }

  return objects;
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
      const path = `${buildListingImagePrefix(input.listingId)}/${crypto.randomUUID()}-${safeFileName}`;
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
