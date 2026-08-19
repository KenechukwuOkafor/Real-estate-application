import "server-only";

/**
 * Storage access for property images and verification documents.
 *
 * Both buckets are private (migration 0016). Nothing here ever produces a
 * public URL, because there is no longer such a thing: reads are short-lived
 * signed URLs minted at render time.
 *
 * No service-role key. Every function here takes the caller's own client.
 *
 * That was not a given. Storage was one of the two justified service-role
 * holdouts, on the reasoning that minting signed upload URLs is privileged.
 * Measured against the real policies from 0016, it is not: an agent's own
 * client can createSignedUploadUrl, list its listing prefix, and upload,
 * because the INSERT policy already scopes them to their own draft or rejected
 * listing. The escalation was load-bearing only while there were no policies.
 *
 * Keeping the caller's client means a path they do not own produces no URL
 * rather than a URL they should never have had — the database decides, not
 * this file.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/api/errors";
import type { Database } from "@/types/database";

export const PROPERTY_IMAGES_BUCKET = "property-images";
export const VERIFICATION_DOCUMENTS_BUCKET = "verification-documents";

/**
 * How long a signed listing-image URL stays valid.
 *
 * One hour. The trade-off runs in both directions and neither end is free.
 *
 * Shorter (say 60s, as verification documents use) would defeat caching
 * entirely: every image URL would be unique per render, so browsers and any
 * future CDN would re-fetch constantly, and REB-ARCH-005 explicitly wants a
 * long cache lifetime for images. It would also break the back button.
 *
 * Longer (a day, a week) turns the URL back into the public link this slice
 * exists to remove. A leaked or shared URL would outlive the moderation
 * decision behind it — the whole problem with the old public bucket was that
 * an image on a rejected listing stayed readable forever.
 *
 * An hour is long enough that a page view and its repeat visits reuse one URL,
 * and short enough that a link pasted into a chat is dead by the time anyone
 * clicks it. It is deliberately shorter than any plausible moderation
 * turnaround, so an image pulled from public view stops being reachable in
 * minutes rather than days.
 */
export const LISTING_IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Verification documents get 60 seconds.
 *
 * These are government IDs and CAC filings. The only consumer is an admin
 * reviewing a submission, which renders once — there is no caching benefit to
 * trade away, so the TTL is as short as a page render tolerates.
 */
export const VERIFICATION_DOCUMENT_SIGNED_URL_TTL_SECONDS = 60;

type DbClient = SupabaseClient<Database>;

/**
 * REB-ARCH-005: "Files never use original filenames." UUIDv7 keeps names
 * time-ordered without leaking the uploader's filesystem, the listing's
 * contents, or a guessable neighbour.
 */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);

  // 48-bit millisecond timestamp, big endian. Date.now() is well inside the
  // 53-bit safe integer range, so no BigInt is needed.
  let timestamp = Date.now();
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp % 256;
    timestamp = Math.floor(timestamp / 256);
  }

  crypto.getRandomValues(bytes.subarray(6));

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Extension is derived from the declared MIME type, never from the filename.
 *
 * Taking it from the upload name would put attacker-controlled text into a
 * storage path. The bucket's allowed_mime_types is the real gate; this only
 * decides the suffix.
 */
export function extensionForMimeType(mimeType: string): string | null {
  return EXTENSION_BY_MIME[mimeType.toLowerCase()] ?? null;
}

export function buildListingImagePrefix(listingId: string) {
  return `listings/${listingId}`;
}

export function buildVerificationDocumentPrefix(agentProfileId: string) {
  return `verification/${agentProfileId}`;
}

export type UploadedObject = {
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
};

/**
 * Index the objects that actually exist under a listing's media prefix.
 *
 * Uploading to a path requires a token only createListingImageUploadTargets
 * issues, so an object existing under `listings/<listingId>/` is proof that a
 * target was issued for this listing and used. Registration matches
 * client-supplied paths against this map and rejects anything absent.
 */
export async function listUploadedListingImageObjects(
  client: DbClient,
  listingId: string,
) {
  const bucket = client.storage.from(PROPERTY_IMAGES_BUCKET);
  const prefix = buildListingImagePrefix(listingId);

  const { data, error } = await bucket.list(prefix, { limit: 1000 });

  if (error) {
    throw error;
  }

  const objects = new Map<string, UploadedObject>();

  for (const object of data ?? []) {
    if (!object.id) {
      continue;
    }

    const metadata = object.metadata as { mimetype?: unknown; size?: unknown } | null;

    objects.set(`${prefix}/${object.name}`, {
      mimeType:
        typeof metadata?.mimetype === "string"
          ? metadata.mimetype
          : "application/octet-stream",
      sizeBytes: typeof metadata?.size === "number" ? metadata.size : 0,
      storagePath: `${prefix}/${object.name}`,
    });
  }

  return objects;
}

/**
 * Objects that actually exist under an agent's verification prefix.
 *
 * Same provenance check as listing images: an object can only be there if a
 * signed upload target was issued for this agent and used, so presence proves
 * the path is theirs. Registration rejects anything absent, which stops an
 * agent attaching another agent's document to their own submission.
 */
export async function listUploadedVerificationDocuments(
  client: DbClient,
  agentProfileId: string,
) {
  const bucket = client.storage.from(VERIFICATION_DOCUMENTS_BUCKET);
  const prefix = buildVerificationDocumentPrefix(agentProfileId);

  const { data, error } = await bucket.list(prefix, { limit: 1000 });

  if (error) {
    throw error;
  }

  const objects = new Map<string, UploadedObject>();

  for (const object of data ?? []) {
    if (!object.id) {
      continue;
    }

    const metadata = object.metadata as { mimetype?: unknown; size?: unknown } | null;

    objects.set(`${prefix}/${object.name}`, {
      mimeType:
        typeof metadata?.mimetype === "string"
          ? metadata.mimetype
          : "application/octet-stream",
      sizeBytes: typeof metadata?.size === "number" ? metadata.size : 0,
      storagePath: `${prefix}/${object.name}`,
    });
  }

  return objects;
}

async function createUploadTargets(
  client: DbClient,
  input: {
    bucketName: string;
    files: Array<{ contentType: string; fileName: string }>;
    prefix: string;
  },
) {
  const bucket = client.storage.from(input.bucketName);

  const uploads = await Promise.all(
    input.files.map(async (file) => {
      const extension = extensionForMimeType(file.contentType);

      if (!extension) {
        throw new AppError("MEDIA_MIME_TYPE_UNSUPPORTED", "MEDIA_MIME_TYPE_UNSUPPORTED");
      }

      // uuidv7.ext, with the original name kept only as metadata for the
      // caller to store in the database. BR-MEDIA-004.
      const path = `${input.prefix}/${uuidv7()}.${extension}`;
      const { data, error } = await bucket.createSignedUploadUrl(path, {
        upsert: false,
      });

      if (error || !data) {
        throw error ?? new Error("Unable to create signed upload URL.");
      }

      return {
        contentType: file.contentType,
        originalFilename: file.fileName,
        path,
        token: data.token,
      };
    }),
  );

  return { bucket: input.bucketName, uploads };
}

export async function createListingImageUploadTargets(
  client: DbClient,
  input: {
    files: Array<{ contentType: string; fileName: string }>;
    listingId: string;
  },
) {
  return createUploadTargets(client, {
    bucketName: PROPERTY_IMAGES_BUCKET,
    files: input.files,
    prefix: buildListingImagePrefix(input.listingId),
  });
}

export async function createVerificationDocumentUploadTargets(
  client: DbClient,
  input: {
    agentProfileId: string;
    files: Array<{ contentType: string; fileName: string }>;
  },
) {
  return createUploadTargets(client, {
    bucketName: VERIFICATION_DOCUMENTS_BUCKET,
    files: input.files,
    prefix: buildVerificationDocumentPrefix(input.agentProfileId),
  });
}

/**
 * Sign a batch of storage paths for reading.
 *
 * Deliberately takes a client rather than reaching for the service-role one.
 * The storage policies in 0016 decide who may read which object, so passing
 * the caller's own client means a path they are not entitled to simply comes
 * back without a URL — the database enforces it, not this function.
 *
 * Anonymous callers are entitled to images of approved listings, which is what
 * makes public listing pages work against a private bucket.
 */
export async function signStoragePaths(
  client: DbClient,
  input: { bucketName: string; expiresIn: number; paths: string[] },
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const paths = Array.from(new Set(input.paths.filter(Boolean)));

  if (paths.length === 0) {
    return signed;
  }

  const { data, error } = await client.storage
    .from(input.bucketName)
    .createSignedUrls(paths, input.expiresIn);

  if (error) {
    // A denial is not an exception: an anonymous visitor asking for a draft
    // listing's images should get no URLs, not a 500.
    return signed;
  }

  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) {
      signed.set(entry.path, entry.signedUrl);
    }
  }

  return signed;
}

export async function signListingImagePaths(client: DbClient, paths: string[]) {
  return signStoragePaths(client, {
    bucketName: PROPERTY_IMAGES_BUCKET,
    expiresIn: LISTING_IMAGE_SIGNED_URL_TTL_SECONDS,
    paths,
  });
}

export async function signVerificationDocumentPaths(
  client: DbClient,
  paths: string[],
) {
  return signStoragePaths(client, {
    bucketName: VERIFICATION_DOCUMENTS_BUCKET,
    expiresIn: VERIFICATION_DOCUMENT_SIGNED_URL_TTL_SECONDS,
    paths,
  });
}

