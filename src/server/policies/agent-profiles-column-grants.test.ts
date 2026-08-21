/**
 * What anon may read on agent_profiles, column by column.
 *
 * The row predicate here has always been right — only verified, undeleted
 * profiles — and being satisfied with that answer is exactly what stopped
 * anyone reading the column list. 0010's `grant select on public.agent_profiles
 * to anon` was table-wide, so a moderator's rejection_reason and an agent's
 * remaining publishing quota were readable by an unauthenticated caller
 * querying PostgREST directly.
 *
 * Every denial below pairs with a service-role control proving the column
 * exists and holds a value, per ADR-010-A1: an empty result is not a denial.
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  asAnon,
  asServiceRole,
  rlsIntegrationEnabled,
} from "../../../test/helpers/rls-clients";

const suite = rlsIntegrationEnabled() ? describe : describe.skip;

/** Granted to anon by 0026, because a public surface renders them. */
const PUBLIC_COLUMNS = ["id", "display_name", "verification_status"] as const;

/**
 * Ungranted. Split by why, because the two halves justify themselves
 * differently: the first are somebody's private business, the second are
 * simply not rendered anywhere public.
 */
const PRIVATE_COLUMNS = [
  "rejection_reason",
  "suspension_reason",
  "free_listing_quota",
  "user_id",
  "verified_by",
] as const;

const UNRENDERED_COLUMNS = [
  "bio",
  "created_at",
  "updated_at",
  "founding_agent",
  "verification_submitted_at",
  "verified_at",
] as const;

suite("agent_profiles column grants", () => {
  let svc: ReturnType<typeof asServiceRole>;
  let verifiedProfileId: string;

  beforeAll(async () => {
    svc = asServiceRole();

    const { data } = await svc
      .from("agent_profiles")
      .select("id")
      .eq("verification_status", "verified")
      .is("deleted_at", null)
      .limit(1)
      .single();

    verifiedProfileId = data!.id;

    // The control the denials lean on. A moderator has not written one of
    // these in the seed, so put a value there: proving a column is withheld
    // requires it to hold something to withhold.
    await svc
      .from("agent_profiles")
      .update({
        rejection_reason: "PROBE moderator note",
        suspension_reason: "PROBE suspension note",
      })
      .eq("id", verifiedProfileId);
  });

  it("has a verified profile anon is allowed to see at row level", async () => {
    // Establishes that every denial below is about the column, not the row.
    const { data, error } = await asAnon()
      .from("agent_profiles")
      .select("id, display_name, verification_status")
      .eq("id", verifiedProfileId)
      .single();

    expect(error).toBeNull();
    expect(data?.verification_status).toBe("verified");
  });

  for (const column of PUBLIC_COLUMNS) {
    it(`lets anon read ${column}, which a public surface renders`, async () => {
      const { error } = await asAnon()
        .from("agent_profiles")
        .select(column)
        .eq("id", verifiedProfileId);

      expect(error).toBeNull();
    });
  }

  for (const column of [...PRIVATE_COLUMNS, ...UNRENDERED_COLUMNS]) {
    it(`denies anon ${column}, and the value is really there`, async () => {
      const control = await svc
        .from("agent_profiles")
        .select(column)
        .eq("id", verifiedProfileId)
        .single();

      expect(control.error).toBeNull();
      expect(control.data).not.toBeNull();

      const { error } = await asAnon()
        .from("agent_profiles")
        .select(column)
        .eq("id", verifiedProfileId);

      expect(error).not.toBeNull();
      expect(error?.code).toBe("42501");
    });
  }

  it("denies a moderator's note specifically, by value", async () => {
    // The one that matters most, asserted on the value rather than the shape:
    // rejection_reason is an admin's private assessment of a person.
    const control = await svc
      .from("agent_profiles")
      .select("rejection_reason")
      .eq("id", verifiedProfileId)
      .single();

    expect(control.data?.rejection_reason).toBe("PROBE moderator note");

    const { data, error } = await asAnon()
      .from("agent_profiles")
      .select("*")
      .eq("id", verifiedProfileId);

    // A star select is what a curious caller reaches for first, and it fails
    // closed rather than quietly narrowing: PostgREST expands "*" to every
    // column, so the query demands SELECT on all fifteen and is refused
    // outright. Worth pinning — the intuition is that "*" returns whatever
    // you are allowed to see, and it does not.
    expect(error?.code).toBe("42501");
    expect(JSON.stringify(data)).not.toContain("PROBE moderator note");
  });

  it("still serves the public embed the listing feed actually issues", async () => {
    // The counterpart to the star select: the narrowed list the repository
    // sends must keep working, or the feed 42501s for every visitor.
    const { data, error } = await asAnon()
      .from("listings")
      .select("id, title, agent_profiles!inner (id, display_name, verification_status)")
      .eq("status", "approved")
      .limit(1);

    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
  });
});
