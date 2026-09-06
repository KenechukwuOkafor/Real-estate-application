/**
 * The moderation columns on agent_profiles, and who can read them.
 *
 * `authenticated` reads this table under two policies: agents_read_own_profile,
 * which is the legitimate need, and public_can_read_verified_agent_profiles,
 * the same one anon uses. A column grant cannot tell those apart, so granting
 * rejection_reason to serve the first disclosed it under the second — every
 * verified agent's moderation note, to any signed-in user, with a login as the
 * only barrier.
 *
 * These are regression guards rather than reminders. The grant is narrow now;
 * what must stay true is that it cannot be widened back without something
 * going red — including the case that made it urgent, which is a moderator
 * actually writing a note.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type CastMember, getCast } from "../../../test/helpers/cast";
import { mintFreshToken } from "../../../test/helpers/clerk-tokens";
import {
  asServiceRole,
  asUser,
  rlsIntegrationEnabled,
} from "../../../test/helpers/rls-clients";

const suite = rlsIntegrationEnabled() ? describe : describe.skip;

/**
 * A moderator's private assessment of a person. Neither may be readable by
 * `authenticated` while any row carries a value — and the test writes one, so
 * "no row has a value" can never be the reason this passes.
 */
const MODERATION_COLUMNS = ["rejection_reason", "suspension_reason"] as const;

/**
 * How much inventory an agent has left to publish.
 *
 * 0027 granted this to `authenticated` justified as "the entitlement
 * calculation" — a statement about need, not about safety. The need is only
 * ever for the caller's own row, and the public policy meant the grant also
 * answered every signed-in stranger. 0026 had already named what the column is
 * while withholding it from anon: "commercially theirs". Every agent in this
 * market is also a Ruvo user, so the signed-in stranger is very often a
 * competitor.
 *
 * Guarded with a written value for the same reason as the moderation columns:
 * a denial proved against an empty column proves nothing.
 */
const QUOTA_COLUMN = "free_listing_quota" as const;

/** Distinctive, so a leak is recognisable and a pass is not an absence. */
const PROBE_QUOTA = 47;

/** Not rendered by any authenticated surface, so not granted. */
const UNGRANTED_COLUMNS = [
  "verified_at",
  "verified_by",
  "founding_agent",
  "verification_submitted_at",
  "created_at",
  "updated_at",
] as const;

suite("agent_profiles grants for authenticated", () => {
  let svc: ReturnType<typeof asServiceRole>;
  let seeker: CastMember;
  let profileId: string;
  let originalRejection: string | null = null;
  let originalSuspension: string | null = null;
  let originalQuota = 0;

  beforeAll(async () => {
    svc = asServiceRole();
    seeker = getCast().seeker;

    const { data } = await svc
      .from("agent_profiles")
      .select("id")
      .eq("verification_status", "verified")
      .is("deleted_at", null)
      .limit(1)
      .single();
    profileId = data!.id;

    const current = await svc
      .from("agent_profiles")
      .select("rejection_reason, suspension_reason, free_listing_quota")
      .eq("id", profileId)
      .single();
    originalRejection = current.data?.rejection_reason ?? null;
    originalSuspension = current.data?.suspension_reason ?? null;
    originalQuota = current.data?.free_listing_quota ?? 0;

    // The value the guard exists to protect. Without it every assertion below
    // could pass against an empty column, which is the failure mode ADR-010-A1
    // names: a denial proved by an absence.
    await svc
      .from("agent_profiles")
      .update({
        free_listing_quota: PROBE_QUOTA,
        rejection_reason: "PROBE private moderator assessment",
        suspension_reason: "PROBE private suspension note",
      })
      .eq("id", profileId);
  }, 60_000);

  afterAll(async () => {
    // In afterAll, not a test. As a test it ran BEFORE the denials — vitest
    // runs them in file order — so every assertion below would have been made
    // against emptied columns, proving a denial by an absence. Which is the
    // exact mistake ADR-010-A1 names, made inside the guard against it.
    const { error } = await svc
      .from("agent_profiles")
      .update({
        free_listing_quota: originalQuota,
        rejection_reason: originalRejection,
        suspension_reason: originalSuspension,
      })
      .eq("id", profileId);

    if (error) {
      throw new Error(`teardown moderation columns: ${JSON.stringify(error)}`);
    }
  }, 60_000);

  it("lets a signed-in user read a verified agent at row level", async () => {
    // Establishes that every denial below is about the column, not the row —
    // this seeker really can see this profile.
    const client = asUser(await mintFreshToken(seeker));
    const { data, error } = await client
      .from("agent_profiles")
      .select("id, display_name, verification_status")
      .eq("id", profileId)
      .single();

    expect(error).toBeNull();
    expect(data?.verification_status).toBe("verified");
  });

  for (const column of MODERATION_COLUMNS) {
    it(`denies authenticated ${column}, which really holds a note`, async () => {
      const control = await svc
        .from("agent_profiles")
        .select(column)
        .eq("id", profileId)
        .single();

      // Not just "the query worked" — the column holds the value beforeAll
      // wrote, so the denial below is withholding something rather than
      // returning nothing.
      expect(control.error).toBeNull();
      expect(
        (control.data as Record<string, string | null>)[column],
      ).toContain("PROBE");

      const client = asUser(await mintFreshToken(seeker));
      const { error } = await client
        .from("agent_profiles")
        .select(column)
        .eq("id", profileId);

      expect(error?.code).toBe("42501");
    });
  }

  for (const column of UNGRANTED_COLUMNS) {
    it(`denies authenticated ${column}`, async () => {
      const control = await svc
        .from("agent_profiles")
        .select(column)
        .eq("id", profileId)
        .single();

      expect(control.error).toBeNull();

      const client = asUser(await mintFreshToken(seeker));
      const { error } = await client
        .from("agent_profiles")
        .select(column)
        .eq("id", profileId);

      expect(error?.code).toBe("42501");
    });
  }

  it("never returns a written moderation note to a signed-in user", async () => {
    // The whole point, asserted on the value. If the grant is ever widened
    // back, this is what goes red — and it goes red precisely because a note
    // exists to leak.
    const client = asUser(await mintFreshToken(seeker));
    const attempts = await Promise.all([
      client.from("agent_profiles").select("*").eq("id", profileId),
      client.from("agent_profiles").select("rejection_reason").eq("id", profileId),
      client
        .from("agent_profiles")
        .select("id, display_name, verification_status")
        .eq("id", profileId),
    ]);

    for (const attempt of attempts) {
      expect(JSON.stringify(attempt.data)).not.toContain(
        "PROBE private moderator assessment",
      );
    }
  });

  it(`denies authenticated ${QUOTA_COLUMN}, which really holds a balance`, async () => {
    const control = await svc
      .from("agent_profiles")
      .select(QUOTA_COLUMN)
      .eq("id", profileId)
      .single();

    // The balance is really there. Without this the denial below could be a
    // denial of nothing.
    expect(control.error).toBeNull();
    expect(control.data?.free_listing_quota).toBe(PROBE_QUOTA);

    const client = asUser(await mintFreshToken(seeker));
    const { error } = await client
      .from("agent_profiles")
      .select(QUOTA_COLUMN)
      .eq("id", profileId);

    expect(error?.code).toBe("42501");
  });

  it("never returns another agent's balance under any select shape", async () => {
    // The disclosure as it was actually measured: no crafted query, just the
    // public policy plus the grant. `select("*")` is the shape a curious
    // caller reaches for first.
    //
    // ASSERTED ON THE KEY, NOT ON THE SERIALISED ROW. The sibling test above
    // greps the JSON for a distinctive sentence, which works because
    // "PROBE private moderator assessment" appears nowhere by accident. A
    // quota is a small integer, and the first version of this test searched
    // for "47" — which matched inside the row's own uuid, `...e472d7db6001`,
    // and failed on a fix that was working. A number needs a different
    // instrument than a string does.
    const client = asUser(await mintFreshToken(seeker));
    const attempts = await Promise.all([
      client.from("agent_profiles").select("*").eq("id", profileId),
      client.from("agent_profiles").select("id, free_listing_quota"),
      client
        .from("agent_profiles")
        .select("id, display_name, verification_status")
        .eq("id", profileId),
    ]);

    for (const attempt of attempts) {
      for (const row of attempt.data ?? []) {
        expect(Object.keys(row)).not.toContain(QUOTA_COLUMN);
      }
    }
  });

  it("still gives an agent their own balance, through the function", async () => {
    // The control for the two denials above: closing the column must not break
    // the entitlement gate, which is the legitimate need the grant was
    // serving. Without this, revoking the column and deleting every caller
    // would also pass.
    //
    // Left `not_submitted` deliberately. A second verified profile would be a
    // candidate for the `profileId` this suite probes against, and the fixture
    // it picks must stay the one whose columns were arranged in beforeAll.
    const agent = getCast().owningAgent;
    const { data: ownProfile, error: arrangeError } = await svc
      .from("agent_profiles")
      .insert({
        display_name: "PROBE Own Balance",
        free_listing_quota: 5,
        user_id: agent.userId,
      })
      .select("id")
      .single();

    if (arrangeError) {
      throw new Error(`arrange own profile: ${JSON.stringify(arrangeError)}`);
    }

    try {
      const client = asUser(await mintFreshToken(agent));
      const { data, error } = await client.rpc("own_agent_free_listing_quota");

      expect(error).toBeNull();
      expect(data).toBe(5);
    } finally {
      // agent_profiles.user_id is UNIQUE, so a profile left behind breaks the
      // next suite that needs one for this agent.
      await svc.from("agent_profiles").delete().eq("id", ownProfile.id);
    }
  });

  it("answers 0 to a caller asking about a balance that is not theirs", async () => {
    // There is no argument to pass, which is the design: a caller cannot name
    // somebody else. This pins that the function is scoped to the caller and
    // does not, say, return the first row it finds.
    const client = asUser(await mintFreshToken(seeker));
    const { data, error } = await client.rpc("own_agent_free_listing_quota");

    expect(error).toBeNull();
    expect(data).toBe(0);
  });

  it("refuses a self-inserted profile that claims to be verified", async () => {
    // The escalation 0027 closed. INSERT was table-wide, and the policy's
    // WITH CHECK asserts only user_id — so a signed-in user could create
    // themselves an already-verified profile with unlimited submission slots,
    // skipping documents, review and the entitlement gate entirely.
    const client = asUser(await mintFreshToken(seeker));
    const { error } = await client.from("agent_profiles").insert({
      display_name: "PROBE Self Verified",
      free_listing_quota: 999,
      user_id: seeker.userId,
      verification_status: "verified",
    });

    expect(error?.code).toBe("42501");

    const { data } = await svc
      .from("agent_profiles")
      .select("id")
      .eq("display_name", "PROBE Self Verified");

    expect(data ?? []).toHaveLength(0);
  });

  it("still lets an agent create the profile they are allowed to create", async () => {
    // The control for the clause above: narrowing INSERT must not break
    // onboarding, which writes exactly bio, display_name and user_id.
    const client = asUser(await mintFreshToken(seeker));
    const { error } = await client.from("agent_profiles").insert({
      bio: "PROBE bio",
      display_name: "PROBE Legitimate Profile",
      user_id: seeker.userId,
    });

    expect(error).toBeNull();

    await svc
      .from("agent_profiles")
      .delete()
      .eq("display_name", "PROBE Legitimate Profile");
  });
});
