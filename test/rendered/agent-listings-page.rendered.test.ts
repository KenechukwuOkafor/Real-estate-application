/**
 * The agent listings page, rendered.
 *
 * The page is mostly conditionals over a status and two numbers, and the
 * failure mode of a conditional is not a crash — it is a branch nobody takes,
 * so a signal simply does not appear and nothing anywhere reports a problem.
 * That is why the seed was changed alongside this page: every assertion below
 * needs a row that makes its condition true, and before this slice the seed had
 * no revisions at all and every approved listing was approved at now().
 *
 * See test/helpers/rendered-page.ts for what this can and cannot prove. It
 * checks SERVER-RENDERED output, so the filter chips and sort are present but
 * not exercised — those are client-side and covered as pure functions in
 * src/features/agents/listing-cards.test.ts.
 *
 * LOCAL ONLY. Run with `npm run test:rendered` against `npm run dev`.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { asServiceRole } from "../helpers/rls-clients";
import {
  assertCanRenderPages,
  renderAnonymously,
  renderAsPersona,
} from "../helpers/rendered-page";

describe("agent listings page", () => {
  const svc = asServiceRole();
  let approvedId = "";
  let rentedId = "";
  let refusedRevisionListingId = "";
  let subletId = "";

  beforeAll(async () => {
    await assertCanRenderPages();

    const listings = await svc
      .from("listings")
      .select("id, status, rental_duration, title")
      .is("deleted_at", null);
    if (listings.error) throw listings.error;

    approvedId =
      listings.data.find((row) => row.status === "approved")?.id ?? "";
    rentedId = listings.data.find((row) => row.status === "rented")?.id ?? "";
    subletId =
      listings.data.find(
        (row) => row.rental_duration === "sublet" && row.status === "approved",
      )?.id ?? "";

    const revision = await svc
      .from("listing_revisions")
      .select("listing_id")
      .eq("status", "rejected")
      .limit(1)
      .maybeSingle();
    if (revision.error) throw revision.error;
    refusedRevisionListingId = revision.data?.listing_id ?? "";

    // Every assertion below is vacuous without these, and a vacuous assertion
    // that passes is worse than no assertion. Fail loudly on the fixture
    // instead of quietly on nothing.
    for (const [what, id] of [
      ["an approved listing", approvedId],
      ["a rented listing", rentedId],
      ["an approved sublet", subletId],
      ["a listing with a refused revision", refusedRevisionListingId],
    ] as const) {
      if (!id) {
        throw new Error(
          `supabase/seed.sql is meant to carry ${what}. Without it this suite passes having checked nothing.`,
        );
      }
    }
  });

  it("is not readable without a session", async () => {
    const page = await renderAnonymously("/agent/listings");

    expect(page.status).not.toBe(200);
  });

  it("renders for a verified agent", async () => {
    const page = await renderAsPersona("/agent/listings", "Agent (verified)");

    expect(page.status).toBe(200);
    expect(page.text).toContain("Your listings");
  });

  // ======================================================================
  // The numbers, and what they are measured over
  // ======================================================================

  it("states the window rather than showing bare numbers", async () => {
    const page = await renderAsPersona("/agent/listings", "Agent (verified)");

    // Two integers with no period attached are not a measurement. This is also
    // the dashboard's default window, so the two screens agree about a listing.
    expect(page.text).toContain("last 30 days");
  });

  it("puts viewers and requests on the card", async () => {
    const page = await renderAsPersona("/agent/listings", "Agent (verified)");

    expect(page.text).toMatch(/\d+ viewer/);
    expect(page.text).toMatch(/\d+ request/);
  });

  /**
   * The inference is the value. Two integers do not tell an agent whether they
   * have a visibility problem or a price problem, and those have opposite
   * fixes.
   */
  it("says what the two numbers mean together", async () => {
    const page = await renderAsPersona("/agent/listings", "Agent (verified)");

    expect(page.text).toContain("Seen, but not asked about");
  });

  // ======================================================================
  // The signals
  // ======================================================================

  /**
   * THE ONE WITH NO OTHER SYMPTOM, and the reason this slice surfaces it on the
   * listing. The listing is approved, in search, and looks entirely normal —
   * 0023 deliberately keeps it live while a revision is reviewed — so a refusal
   * was visible only in the dashboard action queue, on another screen.
   */
  it("surfaces a refused edit on the listing it affects", async () => {
    const page = await renderAsPersona("/agent/listings", "Agent (verified)");

    expect(page.text).toContain("Your change to this listing was refused");
    expect(page.text).toContain("still live with the details a moderator approved");
  });

  /**
   * The copy must say what it measures and no more. We do not know whether a
   * tenancy started or ended — the parties agree that in chat — which is
   * exactly why nothing auto-hides on this.
   */
  it("flags a sublet live past its advertised term, without claiming it ended", async () => {
    const page = await renderAsPersona("/agent/listings", "Agent (verified)");

    expect(page.text).toContain("longer than the 6-month term it advertises");
    expect(page.text).not.toContain("has ended");
    expect(page.text).not.toContain("tenancy is over");
  });

  it("shows a taken listing as costing nothing", async () => {
    const page = await renderAsPersona("/agent/listings", "Agent (verified)");

    expect(page.text).toContain("still using no submission slot");
  });

  // ======================================================================
  // Filters, sort and row actions
  // ======================================================================

  it("offers the sort that answers which listing is dead", async () => {
    const page = await renderAsPersona("/agent/listings", "Agent (verified)");

    expect(page.text).toContain("Fewest requests");
  });

  it("offers status chips and a removed toggle", async () => {
    const page = await renderAsPersona("/agent/listings", "Agent (verified)");

    expect(page.text).toContain("Show removed");
    expect(page.text).toContain("Live");
    expect(page.text).toContain("Taken");
  });

  it("offers row actions without opening the listing", async () => {
    const page = await renderAsPersona("/agent/listings", "Agent (verified)");

    expect(page.text).toContain("Preview as seeker");
    expect(page.text).toContain("Mark as taken");
    expect(page.text).toContain("Mark available");
  });

  /**
   * The filter has to survive a fresh load, or an agent who filtered, fixed one
   * listing and came back has lost their place in the only screen that lists
   * their inventory. The server parses the query string so the FIRST paint is
   * already filtered — a client-side read would paint the full list first.
   */
  it("honours a filter in the URL on the server's first render", async () => {
    const page = await renderAsPersona(
      "/agent/listings?groups=taken",
      "Agent (verified)",
    );

    expect(page.status).toBe(200);
    expect(page.text).toContain("still using no submission slot");
    // The refused-revision listing is approved, so filtering to taken must
    // exclude it. Without this the assertion above would pass on an unfiltered
    // page.
    expect(page.text).not.toContain("Your change to this listing was refused");
  });

  /**
   * The reason this is ?focus= and not a #hash: a hash never reaches the
   * server, so a link to a listing the default filter hides would land on a
   * page that scrolls to nothing.
   */
  it("shows a focused listing even when the filter would hide it", async () => {
    const page = await renderAsPersona(
      `/agent/listings?groups=taken&focus=${refusedRevisionListingId}`,
      "Agent (verified)",
    );

    expect(page.text).toContain("Your change to this listing was refused");
  });

  it("explains an empty result instead of looking broken", async () => {
    // No listing is both taken and in review, so this filter matches nothing.
    const page = await renderAsPersona(
      "/agent/listings?groups=taken&attention=1",
      "Agent (verified)",
    );

    expect(page.text).toContain("No listings match these filters");
    expect(page.text).toMatch(/You have \d+ listing/);
    expect(page.text).toContain("in total");
  });

  // ======================================================================
  // The links that were 404s
  // ======================================================================

  /**
   * dashboard-listings-table and the activity feed both linked to
   * /agent/listings/[listingId], which has never existed. Every listing title
   * in the dashboard's most actionable table was a dead link.
   */
  it("no longer points the dashboard at a route that does not exist", async () => {
    const page = await renderAsPersona("/agent", "Agent (verified)");

    expect(page.status).toBe(200);
    expect(page.html).toContain(`/agent/listings?focus=${approvedId}`);
    expect(page.html).not.toMatch(
      new RegExp(`href="/agent/listings/${approvedId}"`),
    );
  });

  it("still 404s the route nothing should link to", async () => {
    const page = await renderAsPersona(
      `/agent/listings/${approvedId}`,
      "Agent (verified)",
    );

    // Asserted rather than assumed: if this route is ever created, the links
    // above become a choice rather than a workaround, and that should be a
    // deliberate decision rather than something discovered later.
    expect(page.status).toBe(404);
  });
});
