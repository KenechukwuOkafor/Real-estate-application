import "server-only";

import { parseListingIdentifier } from "@/features/listings/parsers";
import { isUuid } from "@/lib/api/identifiers";
import type { ListingListFilters } from "@/features/listings/types";
import {
  createSupabaseAuthenticatedClient,
  createSupabaseServerClient,
} from "@/lib/db/supabase";
import {
  createListingView,
  getPublicListingByIdentifier,
  getPublicListingIdByUuid,
  getPublicListings,
} from "@/server/repositories/listings-repository";
import { signListingImagePaths } from "@/server/services/listing-media-service";
import type { ListingDetail, ListingListItem } from "@/features/listings/types";

/**
 * Resolve storage paths into short-lived signed URLs.
 *
 * This is the awkward seam created by making the bucket private: a public
 * listing page has to serve images to visitors who have no session at all.
 * It works because the storage policy in migration 0016 grants anon SELECT on
 * objects whose listing is approved, so the anon client can sign its own URLs
 * and a draft or rejected listing yields nothing.
 *
 * The signing is done here rather than in the repository because the
 * repository must not mint URLs — it returns paths, and whoever renders
 * decides what the caller is allowed to see.
 */
async function withSignedCovers<T extends ListingListItem>(
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  items: T[],
): Promise<T[]> {
  const paths = items
    .map((item) => item.coverImageStoragePath)
    .filter((path): path is string => Boolean(path));

  const signed = await signListingImagePaths(client, paths);

  return items.map((item) => ({
    ...item,
    coverImageUrl: item.coverImageStoragePath
      ? (signed.get(item.coverImageStoragePath) ?? null)
      : null,
  }));
}

export async function listPublicListings(filters: ListingListFilters) {
  const client = await createSupabaseServerClient();
  const result = await getPublicListings(client, filters);

  return {
    ...result,
    items: await withSignedCovers(client, result.items),
  };
}

/**
 * The newest listings, ignoring every filter — what the empty state offers a
 * seeker whose filters matched nothing.
 *
 * Deliberately recent rather than nearby. `area` is a free-text column with no
 * notion of adjacency, so "listings near this one" would be invented rather
 * than computed; recency is something the data actually knows. Revisit when
 * areas become first-class entities.
 */
export async function listRecentPublicListings(limit: number) {
  return listPublicListings({ limit, sort: "newest" });
}

export async function getPublicListing(slugOrPublicId: string) {
  const identifier = parseListingIdentifier(slugOrPublicId);

  // parseListingIdentifier never fails: with no "--" it hands back the input
  // verbatim as publicId. Comparing that against a uuid column raises Postgres
  // 22P02, which surfaced as HTTP 500 — so any crawler requesting a junk path
  // produced a server error and a wasted round trip on a query that could never
  // have matched. Absent, not broken.
  if (!isUuid(identifier.publicId)) {
    return null;
  }

  const client = await createSupabaseServerClient();

  const listing = await getPublicListingByIdentifier(
    client,
    identifier.publicId,
    identifier.slug,
  );

  if (!listing) {
    return listing;
  }

  const [withCover] = await withSignedCovers(client, [listing as ListingDetail]);
  const signed = await signListingImagePaths(
    client,
    withCover.images.map((image) => image.storagePath),
  );

  return {
    ...withCover,
    images: withCover.images
      .map((image) => ({
        ...image,
        url: signed.get(image.storagePath) ?? null,
      }))
      // An image the caller may not read has no URL and is simply not shown,
      // rather than rendering a broken <img>.
      .filter((image) => image.url !== null),
  };
}

/**
 * Why a view was not recorded.
 *
 * `tracked: false` used to be a single undifferentiated outcome, and that is
 * what let this endpoint fail silently for months: the page passed the listing's
 * primary key where its `public_uuid` was required, nothing resolved, and the
 * route answered HTTP 200 exactly as it does for a crawler hitting a junk URL.
 * Both cases looked identical from outside and neither was worth an alert on its
 * own.
 *
 * They are not the same event:
 *
 * - `malformed` is expected background noise. Crawlers request paths that are
 *   not identifiers. Nobody should be paged for it.
 * - `unresolved` is a well-formed UUID that matched no public listing. That is
 *   overwhelmingly either a caller passing the wrong column — the bug this
 *   distinction exists to surface — or a listing that has since been withdrawn.
 *
 * Separating them keeps BR-ANA-003 intact. The caller still never fails; it just
 * stops discarding the reason.
 */
export type ViewTrackingOutcome =
  | { reason: "malformed"; tracked: false }
  | { reason: "unresolved"; tracked: false }
  | { tracked: true };

export async function trackListingView(input: {
  ipHash?: string | null;
  referrer?: string | null;
  sessionId?: string | null;
  slugOrPublicId: string;
  userAgent?: string | null;
}): Promise<ViewTrackingOutcome> {
  const { publicId } = parseListingIdentifier(input.slugOrPublicId);

  // parseListingIdentifier never fails: given input with no "--" it returns the
  // input verbatim as publicId. Querying with that produces a Postgres 22P02
  // invalid-uuid error, so every crawler hitting this endpoint would cost a
  // round-trip and an exception. Reject the shape before touching the database.
  if (!isUuid(publicId)) {
    return { reason: "malformed", tracked: false };
  }

  /**
   * Two clients, and which one is used IS the attribution.
   *
   * After 0028 viewer_user_id is system-supplied: it defaults to
   * current_app_user_id() and no role holds INSERT on it. That value comes
   * from the Clerk token the client carries, so a view recorded through the
   * anon client is anonymous by construction and one recorded through the
   * authenticated client can only ever name the caller.
   *
   * The route used to pass a viewerUserId it had resolved itself, which was
   * correct but incidental — the database accepted whatever it was told, which
   * is what let an unauthenticated caller name somebody else. Identity now
   * travels with the connection rather than in the payload.
   *
   * Falling back rather than failing: view tracking is non-blocking per
   * BR-ANA-003, and an expired token should record an anonymous view instead
   * of losing it.
   */
  const client = await createSupabaseAuthenticatedClient().catch(() =>
    createSupabaseServerClient(),
  );
  const listing = await getPublicListingIdByUuid(client, publicId);

  if (!listing) {
    return { reason: "unresolved", tracked: false };
  }

  await createListingView(client, {
    ipHash: input.ipHash ?? null,
    listingId: listing.id,
    referrer: input.referrer ?? null,
    sessionId: input.sessionId ?? null,
    userAgent: input.userAgent ?? null,
  });

  return { tracked: true };
}
