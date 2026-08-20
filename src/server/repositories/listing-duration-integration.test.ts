/**
 * The duration model, against a real database.
 *
 * The rule these assertions defend is that a sublet carries a month count and
 * the other two durations do not — and that the database, not the form, is what
 * enforces it. A form-only rule holds until the next caller: the drain, a
 * script, a future admin tool, or PostgREST called directly. That is why the
 * CHECK exists and why this suite pushes malformed rows at it rather than at
 * the validator.
 *
 * The backfill assertions matter for a narrower reason. "per year" was
 * hardcoded and true, so every existing row is implicitly yearly; the migration
 * writes that assumption down. If the backfill were wrong the label would still
 * read correctly today and only diverge later, which is exactly how the
 * original hardcoding survived.
 */
import { afterAll, describe, expect, it } from "vitest";

import { asServiceRole, rlsIntegrationEnabled } from "../../../test/helpers/rls-clients";

const suite = rlsIntegrationEnabled() ? describe : describe.skip;

suite("listing rental duration", () => {
  const createdIds: string[] = [];

  async function agentProfileId(svc: ReturnType<typeof asServiceRole>) {
    const { data, error } = await svc
      .from("agent_profiles")
      .select("id")
      .limit(1)
      .single();
    if (error) throw error;
    return data.id;
  }

  /**
   * Inserts with the service-role client, which bypasses RLS entirely. That is
   * deliberate: this suite is about the CHECK constraint, and routing through a
   * policy would leave it ambiguous whether a refusal came from the constraint
   * or from row-level security.
   */
  async function insertListing(fields: {
    rental_duration: "yearly" | "monthly" | "sublet";
    sublet_months?: number | null;
  }) {
    const svc = asServiceRole();
    const result = await svc
      .from("listings")
      .insert({
        agent_profile_id: await agentProfileId(svc),
        area: "Odenigbo",
        bathrooms: 1,
        bedrooms: 1,
        description: "Duration constraint fixture.",
        price_naira: 150000,
        property_type: "1_bedroom",
        rental_duration: fields.rental_duration,
        slug: `duration-${fields.rental_duration}-${crypto.randomUUID().slice(0, 8)}`,
        sublet_months: fields.sublet_months ?? null,
        title: "Duration fixture",
      })
      .select("id, rental_duration, sublet_months")
      .single();

    if (result.data?.id) createdIds.push(result.data.id);
    return result;
  }

  afterAll(async () => {
    const svc = asServiceRole();
    for (const id of createdIds) {
      await svc.from("listings").delete().eq("id", id);
    }
  });

  describe("the month count is required if and only if the duration is sublet", () => {
    it("refuses a sublet with no month count", async () => {
      const { data, error } = await insertListing({ rental_duration: "sublet" });

      expect(data).toBeNull();
      expect(error?.message).toContain("listings_sublet_months_matches_duration");
    });

    it("refuses a yearly listing that carries a month count", async () => {
      const { data, error } = await insertListing({
        rental_duration: "yearly",
        sublet_months: 4,
      });

      expect(data).toBeNull();
      expect(error?.message).toContain("listings_sublet_months_matches_duration");
    });

    it("refuses a monthly listing that carries a month count", async () => {
      const { data, error } = await insertListing({
        rental_duration: "monthly",
        sublet_months: 4,
      });

      expect(data).toBeNull();
      expect(error?.message).toContain("listings_sublet_months_matches_duration");
    });

    it("accepts a sublet with a month count", async () => {
      const { data, error } = await insertListing({
        rental_duration: "sublet",
        sublet_months: 4,
      });

      expect(error).toBeNull();
      expect(data?.rental_duration).toBe("sublet");
      expect(data?.sublet_months).toBe(4);
    });

    it("accepts yearly and monthly with no month count", async () => {
      for (const duration of ["yearly", "monthly"] as const) {
        const { data, error } = await insertListing({ rental_duration: duration });

        expect(error).toBeNull();
        expect(data?.rental_duration).toBe(duration);
        expect(data?.sublet_months).toBeNull();
      }
    });

    // A zero-month sublet is not a shorter sublet; it is a malformed row that
    // would render as "0 months" on a card.
    it("refuses a sublet of zero months", async () => {
      const { data, error } = await insertListing({
        rental_duration: "sublet",
        sublet_months: 0,
      });

      expect(data).toBeNull();
      expect(error?.message).toContain("listings_sublet_months_positive");
    });

    it("refuses a negative month count", async () => {
      const { data, error } = await insertListing({
        rental_duration: "sublet",
        sublet_months: -3,
      });

      expect(data).toBeNull();
      expect(error?.message).toContain("listings_sublet_months_positive");
    });
  });

  describe("the column admits no gaps", () => {
    it("every existing listing has a duration", async () => {
      const svc = asServiceRole();
      const { count, error } = await svc
        .from("listings")
        .select("id", { count: "exact", head: true })
        .is("rental_duration", null);

      expect(error).toBeNull();
      expect(count).toBe(0);
    });

    it("refuses an insert that omits the duration", async () => {
      const svc = asServiceRole();

      // Cast because the generated type already requires the field — which is
      // the point. This asserts the database refuses it too, so a caller that
      // is not type-checked (PostgREST, psql, a script) cannot get past it.
      const { data, error } = await svc
        .from("listings")
        .insert({
          agent_profile_id: await agentProfileId(svc),
          area: "Odenigbo",
          bathrooms: 1,
          bedrooms: 1,
          description: "Missing duration fixture.",
          price_naira: 150000,
          property_type: "1_bedroom",
          slug: `duration-missing-${crypto.randomUUID().slice(0, 8)}`,
          title: "Missing duration",
        } as never)
        .select("id")
        .single();

      if (data?.id) createdIds.push(data.id);

      // This is also what proves there is no DEFAULT. A default of 'yearly'
      // would make this insert succeed and put the hardcoded assumption back one
      // layer lower, where nothing would ever contradict it again. The refusal
      // is the assertion.
      expect(data).toBeNull();
      expect(error?.message).toMatch(/null value|not-null|rental_duration/i);
    });
  });
});
