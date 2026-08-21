/**
 * The moderation queue, rendered.
 *
 * This suite exists because of a specific gap. The duration was added to the
 * moderation queue so a reviewer could see they were approving a sublet, and it
 * shipped verified only by typecheck — the reasoning being that the column
 * exists and the formatter is tested elsewhere. Both true, and neither answers
 * whether a moderator sees anything.
 *
 * See test/helpers/rendered-page.ts for what this can and cannot prove. In
 * short: it checks the HTML the server produced, not how a browser behaves.
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

describe("admin moderation queue", () => {
  const svc = asServiceRole();
  let subletListingId: string | null = null;

  beforeAll(async () => {
    // Loud rather than skipped. This suite is invoked deliberately, so a
    // missing server is a mistake to report, not a condition to tiptoe around.
    await assertCanRenderPages();

    // ARRANGE. The queue shows pending_review, flagged and under_dispute only,
    // and every seeded listing is approved — so without this the page renders
    // an empty queue and every assertion below passes for the wrong reason.
    const { data, error } = await svc
      .from("listings")
      .select("id")
      .eq("rental_duration", "sublet")
      .limit(1)
      .single();

    if (error) throw error;
    subletListingId = data.id;

    const { error: updateError } = await svc
      .from("listings")
      .update({ status: "pending_review", submitted_at: new Date().toISOString() })
      .eq("id", subletListingId);

    if (updateError) throw updateError;
  });

  afterAll(async () => {
    // RESTORE. The seed's shape is relied on by other suites and by anyone
    // looking at the local app, so this must put it back even on failure.
    if (subletListingId) {
      await svc
        .from("listings")
        .update({ status: "approved" })
        .eq("id", subletListingId);
    }
  });

  /**
   * The control, and it is not optional.
   *
   * A 200 for the admin proves nothing on its own — an unprotected page returns
   * 200 for everybody. This is the same pairing the RLS suites use: every
   * "access works" assertion needs a matching "and is withheld from someone".
   */
  it("is not readable without a session", async () => {
    const page = await renderAnonymously("/admin/listings");

    expect(page.status).not.toBe(200);
  });

  it("renders for an admin", async () => {
    const page = await renderAsPersona("/admin/listings", "Admin");

    expect(page.status).toBe(200);
    expect(page.text).toContain("Pending review");
  });

  it("shows a sublet as a sublet, with its length", async () => {
    const page = await renderAsPersona("/admin/listings", "Admin");

    // The summary row marker: what a reviewer sees while scanning, before
    // reading the card.
    expect(page.text).toContain("Sublet · 6 months");
  });

  it("carries the duration on the price, so the figure has a term", async () => {
    const page = await renderAsPersona("/admin/listings", "Admin");

    expect(page.text).toMatch(/Price:\s*₦?180,000\s*6 months/);
  });

  it("does not label a sublet as a yearly or monthly rent", async () => {
    const page = await renderAsPersona("/admin/listings", "Admin");

    /**
     * Scoped to the sublet's own price, not to the whole page.
     *
     * This asserted that the page contained no "per year" anywhere, which held
     * only because the queue happened to contain exactly one listing. The seed
     * now carries a pending_review yearly listing as well — so the page says
     * "per year" correctly, about a different property, and the old assertion
     * failed while nothing was wrong.
     *
     * A page-global assertion standing in for a per-row one is only ever right
     * by accident, and it fails in the direction that wastes time: red when the
     * code is correct.
     */
    expect(page.text).not.toMatch(/₦?180,000\s*per (year|month)/);
    expect(page.text).toMatch(/₦?180,000\s*6 months/);
  });

  /**
   * An agent is not a moderator.
   *
   * The route matcher protects /admin, but "protected" and "protected from the
   * right people" are different claims, and only one of them is asserted by a
   * signed-out control.
   */
  it("is not readable by a verified agent", async () => {
    const page = await renderAsPersona("/admin/listings", "Agent (verified)");

    expect(page.status).not.toBe(200);
  });
});
