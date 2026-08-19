/**
 * View-tracking identifier resolution, against a real database.
 *
 * This suite exists because the unit tests did not catch a total failure of
 * this feature. They fed `trackListingView` identifiers the application never
 * sends, and mocked the repository underneath, so the wiring — which UUID the
 * page actually hands over — was never exercised. The page passed
 * `listing.id`, resolution queries `public_uuid`, and both are UUIDs on the
 * same row, so nothing errored. Views were dropped for months behind an
 * HTTP 200.
 *
 * The assertions below deliberately include the negative case. Proving the
 * primary key does NOT resolve is what stops someone "simplifying" the page
 * back to `listing.id`: that change now fails a test instead of silently
 * turning analytics off.
 */
import { describe, expect, it } from "vitest";

import {
  createListingView,
  getPublicListingIdByUuid,
} from "@/server/repositories/listings-repository";

import { asServiceRole, rlsIntegrationEnabled } from "../../../test/helpers/rls-clients";

const suite = rlsIntegrationEnabled() ? describe : describe.skip;

suite("listing view identifier resolution", () => {
  async function anApprovedListing() {
    const svc = asServiceRole();
    const { data, error } = await svc
      .from("listings")
      .select("id, public_uuid, slug")
      .eq("status", "approved")
      .is("deleted_at", null)
      .limit(1)
      .single();

    if (error) throw error;
    return { listing: data, svc };
  }

  it("the two identifiers are genuinely different values", async () => {
    const { listing } = await anApprovedListing();

    // If these were ever equal the bug would be invisible and this whole suite
    // would pass while proving nothing.
    expect(listing.public_uuid).not.toBe(listing.id);
  });

  it("resolves a listing by its public_uuid", async () => {
    const { listing, svc } = await anApprovedListing();

    const resolved = await getPublicListingIdByUuid(svc, listing.public_uuid);

    expect(resolved).not.toBeNull();
    expect(resolved?.id).toBe(listing.id);
  });

  it("does not resolve a listing by its primary key", async () => {
    const { listing, svc } = await anApprovedListing();

    // The exact defect: a well-formed UUID, a real listing, and no match.
    const resolved = await getPublicListingIdByUuid(svc, listing.id);

    expect(resolved).toBeNull();
  });

  it("records a view against the id the public_uuid resolved to", async () => {
    const { listing, svc } = await anApprovedListing();

    const before = await countViews(listing.id);

    const resolved = await getPublicListingIdByUuid(svc, listing.public_uuid);
    expect(resolved).not.toBeNull();

    await createListingView(svc, {
      ipHash: null,
      listingId: resolved!.id,
      referrer: null,
      sessionId: `view-resolution-${Date.now()}`,
      userAgent: "vitest",
      viewerUserId: null,
    });

    // Asserted against the database, not against a response body. This route
    // answers 200 whether or not it wrote anything, by design, so the response
    // is not evidence.
    expect(await countViews(listing.id)).toBe(before + 1);

    await svc.from("listing_views").delete().eq("user_agent", "vitest");
  });

  async function countViews(listingId: string) {
    const { count, error } = await asServiceRole()
      .from("listing_views")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", listingId);

    if (error) throw error;
    return count ?? 0;
  }
});
