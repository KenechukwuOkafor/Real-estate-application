/**
 * The two surfaces `rented` adds, rendered.
 *
 * The agent's side of this slice is mostly conditionals on a status, and the
 * failure mode of a conditional on a new enum value is not a crash — it is a
 * branch nobody takes, so the listing renders with no action on it and nothing
 * anywhere reports a problem. The seeded rented listing exists so these can be
 * asked of a real page.
 *
 * The seeker's side matters more, because until this slice it was notFound():
 * a saved listing and a mistyped URL produced the same blank 404.
 *
 * See test/helpers/rendered-page.ts for what this can and cannot prove — in
 * particular it does NOT prove the buttons work, only that the server sent
 * them. The transitions themselves are covered against the database in
 * src/server/repositories/listing-rented-integration.test.ts.
 *
 * LOCAL ONLY. Run with `npm run test:rendered` against `npm run dev`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asServiceRole } from "../helpers/rls-clients";
import {
  assertCanRenderPages,
  renderAnonymously,
  renderAsPersona,
} from "../helpers/rendered-page";

describe("rented listings, rendered", () => {
  const svc = asServiceRole();
  let rentedId = "";
  let rentedSlug = "";
  let rentedPublicUuid = "";
  let rentedTitle = "";
  let approvedPath = "";
  let approvedId = "";

  beforeAll(async () => {
    await assertCanRenderPages();

    const { data, error } = await svc
      .from("listings")
      .select("id, public_uuid, slug, title")
      .eq("status", "rented")
      .limit(1)
      .single();

    if (error) {
      throw new Error(
        `No rented listing in the seed. supabase/seed.sql is meant to carry one — without it every assertion here would pass vacuously. ${error.message}`,
      );
    }

    rentedId = data.id;
    rentedPublicUuid = data.public_uuid;
    rentedSlug = data.slug;
    rentedTitle = data.title;

    const approved = await svc
      .from("listings")
      .select("id, public_uuid, slug")
      .eq("status", "approved")
      .limit(1)
      .single();
    if (approved.error) throw approved.error;

    approvedId = approved.data.id;
    approvedPath = `/listings/${approved.data.slug}--${approved.data.public_uuid}`;
  });

  afterAll(async () => {
    // Nothing to restore: every assertion here reads. The one page that could
    // mutate is behind a button this harness cannot click.
    void approvedId;
  });

  // ======================================================================
  // The seeker holding a saved link
  // ======================================================================

  describe("honest absence", () => {
    const path = () => `/listings/${rentedSlug}--${rentedPublicUuid}`;

    /**
     * The whole point of the slice's seeker half. Before this, a listing that
     * went off the market and a URL that never existed were indistinguishable.
     */
    it("answers with a page rather than a 404", async () => {
      const page = await renderAnonymously(path());

      expect(page.status).toBe(200);
      expect(page.text).toContain("No longer available");
    });

    it("names the listing, so the seeker knows it is the place they saved", async () => {
      const page = await renderAnonymously(path());

      expect(page.text).toContain(rentedTitle);
    });

    /**
     * The four columns listing_absence_notice returns are a deliberate limit,
     * and this is what keeps it one. A tombstone that grew a price back would
     * be republishing an offer nobody stands behind — most obviously for a
     * listing removed BECAUSE its price was wrong.
     */
    it("does not republish the price or the description", async () => {
      const [page, row] = await Promise.all([
        renderAnonymously(path()),
        svc
          .from("listings")
          .select("description, price_naira")
          .eq("id", rentedId)
          .single(),
      ]);

      expect(page.text).not.toContain(row.data!.description);
      expect(page.text).not.toContain(
        new Intl.NumberFormat("en-NG", {
          currency: "NGN",
          maximumFractionDigits: 0,
          style: "currency",
        }).format(row.data!.price_naira),
      );
    });

    it("still 404s for an identifier that names nothing", async () => {
      const page = await renderAnonymously(
        "/listings/nothing--00000000-0000-4000-8000-000000000000",
      );

      expect(page.status).toBe(404);
    });

    /**
     * The guard that keeps the tombstone from becoming a way to ask whether a
     * live listing exists by a route that skips the real read.
     */
    it("leaves a live listing entirely alone", async () => {
      const page = await renderAnonymously(approvedPath);

      expect(page.status).toBe(200);
      expect(page.text).not.toContain("No longer available");
      expect(page.text).not.toContain("No longer listed");
    });
  });

  // ======================================================================
  // The agent's list
  // ======================================================================

  describe("the agent listings page", () => {
    it("gives taken listings their own group", async () => {
      const page = await renderAsPersona("/agent/listings", "Agent (verified)");

      expect(page.status).toBe(200);
      expect(page.text).toContain("Taken");
      expect(page.text).toContain(rentedTitle);
    });

    /**
     * The branch that would silently not render. A rented listing with no
     * action on it looks like a bug in the data rather than a missing
     * conditional, so nobody would go looking in the page.
     */
    it("offers the way back onto the market", async () => {
      const page = await renderAsPersona("/agent/listings", "Agent (verified)");

      expect(page.text).toContain("Mark available");
    });

    /**
     * The correction. This button said "Mark as rented" and archived
     * permanently — so the assertion is not only that the new label is present
     * but that the old, false one is gone from the page entirely.
     */
    it("no longer offers to archive under the word rented", async () => {
      const page = await renderAsPersona("/agent/listings", "Agent (verified)");

      expect(page.text).toContain("Mark as taken");
      expect(page.text).toContain("Remove listing");
      expect(page.text).not.toContain("Mark as rented");
    });

    /**
     * The dead end this slice nearly shipped: isLive on the edit page was
     * approved-only, so "Change details" on a rented listing landed on "this
     * listing cannot be edited" — leaving it uncorrectable by any route, since
     * direct editing is refused by design.
     */
    it("routes a taken listing's edit link to the revision form", async () => {
      const page = await renderAsPersona(
        `/agent/listings/${rentedId}/edit`,
        "Agent (verified)",
      );

      expect(page.status).toBe(200);
      expect(page.text).toContain("Change this listing");
      expect(page.text).not.toContain("This listing cannot be edited");
    });
  });
});
