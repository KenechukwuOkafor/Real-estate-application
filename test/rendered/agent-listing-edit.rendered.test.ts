/**
 * The listing edit surface, rendered.
 *
 * PATCH /api/agent/listings/[listingId] existed, validated state and checked
 * ownership, and nothing called it — an agent could create a draft and not
 * change a word of it. These assert the surface exists, is scoped to its owner,
 * and shows a rejected agent the reason they were rejected.
 *
 * See test/helpers/rendered-page.ts for what this can and cannot prove.
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

const REJECTION_REASON =
  "The third photo shows a different property. Replace it before resubmitting.";

describe("agent listing edit", () => {
  const svc = asServiceRole();
  let listingId = "";
  let originalStatus = "";
  let originalReason: string | null = null;

  beforeAll(async () => {
    await assertCanRenderPages();

    // ARRANGE. The seeded listings belong to the verified agent persona, which
    // is the persona these render as — so the ownership assertions below are
    // about a listing this agent genuinely owns, not one nobody owns.
    const { data, error } = await svc
      .from("listings")
      .select("id, status, rejection_reason")
      .eq("rental_duration", "sublet")
      .limit(1)
      .single();

    if (error) throw error;

    listingId = data.id;
    originalStatus = data.status;
    originalReason = data.rejection_reason;

    const { error: updateError } = await svc
      .from("listings")
      .update({ rejection_reason: REJECTION_REASON, status: "rejected" })
      .eq("id", listingId);

    if (updateError) throw updateError;
  });

  afterAll(async () => {
    if (listingId) {
      await svc
        .from("listings")
        .update({ rejection_reason: originalReason, status: originalStatus })
        .eq("id", listingId);
    }
  });

  it("is not readable without a session", async () => {
    const page = await renderAnonymously(`/agent/listings/${listingId}/edit`);

    expect(page.status).not.toBe(200);
  });

  it("renders for the agent who owns the listing", async () => {
    const page = await renderAsPersona(
      `/agent/listings/${listingId}/edit`,
      "Agent (verified)",
    );

    expect(page.status).toBe(200);
    expect(page.text).toContain("Listing details");
  });

  /**
   * The reason this slice puts the rejection reason here.
   *
   * It was stored and shown only to admins, so an agent was told to change
   * something and not told what.
   */
  it("shows the rejection reason next to the fields being fixed", async () => {
    const page = await renderAsPersona(
      `/agent/listings/${listingId}/edit`,
      "Agent (verified)",
    );

    expect(page.text).toContain("Why this was rejected");
    expect(page.text).toContain(REJECTION_REASON);
  });

  it("carries the listing's current values into the form", async () => {
    const page = await renderAsPersona(
      `/agent/listings/${listingId}/edit`,
      "Agent (verified)",
    );

    // A sublet, so the duration select and its month count must both be
    // populated from the row rather than defaulted.
    expect(page.html).toContain('value="sublet"');
    expect(page.html).toContain('value="6"');
  });

  it("offers the photos step from the same surface", async () => {
    const page = await renderAsPersona(
      `/agent/listings/${listingId}/edit`,
      "Agent (verified)",
    );

    expect(page.text).toContain("Photos");
  });

  /**
   * Removal is reachable, and the cover is labelled.
   *
   * The label matters because removing the cover has a consequence the agent
   * should be able to anticipate: another photo is promoted in its place,
   * server-side, in the same statement.
   */
  it("shows a remove control for each photo", async () => {
    const page = await renderAsPersona(
      `/agent/listings/${listingId}/edit`,
      "Agent (verified)",
    );

    expect(page.text).toContain("Remove");
    expect(page.text).toContain("Cover");
  });

  /**
   * Ownership. The lookup filters on agent_profile_id, so another agent's
   * listing is not found rather than forbidden — "not yours" and "does not
   * exist" give the same answer, which is what stops an id from leaking whether
   * a listing exists.
   */
  it("is not readable by a different agent", async () => {
    const page = await renderAsPersona(
      `/agent/listings/${listingId}/edit`,
      "Agent (unverified)",
    );

    expect(page.status).not.toBe(200);
  });

  it("is not readable by a seeker", async () => {
    const page = await renderAsPersona(
      `/agent/listings/${listingId}/edit`,
      "Student",
    );

    expect(page.status).not.toBe(200);
  });

  describe("a listing that may not be edited", () => {
    beforeAll(async () => {
      await svc.from("listings").update({ status: "approved" }).eq("id", listingId);
    });

    afterAll(async () => {
      await svc.from("listings").update({ status: "rejected" }).eq("id", listingId);
    });

    /**
     * Told, not stonewalled. An agent following a link from their own list
     * deserves to know why the listing is locked rather than meeting a 404 —
     * but the form must not be there, because the write path would refuse it.
     */
    it("explains itself instead of offering a form", async () => {
      const page = await renderAsPersona(
        `/agent/listings/${listingId}/edit`,
        "Agent (verified)",
      );

      expect(page.status).toBe(200);
      expect(page.text).toContain("cannot be edited");
      expect(page.text).not.toContain("Listing details");
    });
  });
});
