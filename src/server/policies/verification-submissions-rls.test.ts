/**
 * RLS group 2: agent_verification_submissions.
 *
 * Identity documents. BR-SEC-005 (Critical): verification documents remain
 * private. Every denial is paired with a service-role control proving the row
 * exists and is being withheld.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type CastMember, getCast } from "../../../test/helpers/cast";
import { mintFreshToken } from "../../../test/helpers/clerk-tokens";
import {
  asAnon,
  asServiceRole,
  asUser,
  rlsIntegrationEnabled,
} from "../../../test/helpers/rls-clients";

const suite = rlsIntegrationEnabled() ? describe : describe.skip;

suite("RLS: agent_verification_submissions", () => {
  // Built in a hook, not in the suite body.
  //
  // Vitest evaluates a describe body during collection even when the suite is
  // skipped, so constructing a client here throws on a missing environment
  // variable before the skip can take effect. That is how a missing credential
  // became a collection failure instead of the skip this suite asks for.
  // beforeAll does not run for a skipped suite, so the gate above holds.
  let svc: ReturnType<typeof asServiceRole>;

  beforeAll(() => {
    svc = asServiceRole();
  });

  // Identities come from the shared cast; this suite seeds only its own domain
  // data. See test/helpers/cast.ts for why they are shared.
  let agentA: CastMember;
  let agentB: CastMember;
  let admin: CastMember;

  let profileAId: string;
  let profileBId: string;
  let submissionAId: string;

  async function seedProfile(userId: string, name: string) {
    const { data, error } = await svc
      .from("agent_profiles")
      .insert({ display_name: name, user_id: userId })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  beforeAll(async () => {
    const cast = getCast();
    agentA = cast.owningAgent;
    agentB = cast.otherAgent;
    admin = cast.admin;

    profileAId = await seedProfile(agentA.userId, "Agent A");
    profileBId = await seedProfile(agentB.userId, "Agent B");

    const { data, error } = await svc
      .from("agent_verification_submissions")
      .insert({
        agent_profile_id: profileAId,
        full_legal_name: "Agent A Legal Name",
      })
      .select("id")
      .single();
    if (error) throw error;
    submissionAId = data.id;
  });

  // Domain data only. The cast's users and roles outlive this suite, and
  // agent_profiles.user_id is UNIQUE — leaving a profile behind would break the
  // next suite that needs one for the same agent.
  afterAll(async () => {
    if (submissionAId)
      await svc.from("agent_verification_submissions").delete().eq("id", submissionAId);
    for (const id of [profileAId, profileBId]) {
      if (id) await svc.from("agent_profiles").delete().eq("id", id);
    }
  });

  it("control: the submission exists", async () => {
    const { data } = await svc
      .from("agent_verification_submissions")
      .select("id")
      .eq("id", submissionAId);
    expect(data).toHaveLength(1);
  });

  it("the owning agent reads their own submission", async () => {
    const { data, error } = await asUser(await mintFreshToken(agentA))
      .from("agent_verification_submissions")
      .select("id, full_legal_name")
      .eq("id", submissionAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].full_legal_name).toBe("Agent A Legal Name");
  });

  it("another agent cannot read it", async () => {
    const { data, error } = await asUser(await mintFreshToken(agentB))
      .from("agent_verification_submissions")
      .select("id, full_legal_name")
      .eq("id", submissionAId);

    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: control } = await svc
      .from("agent_verification_submissions")
      .select("id")
      .eq("id", submissionAId);
    expect(control).toHaveLength(1);
  });

  it("another agent cannot enumerate submissions at all", async () => {
    const { data } = await asUser(await mintFreshToken(agentB))
      .from("agent_verification_submissions")
      .select("id");

    expect(data).toEqual([]);
  });

  it("an anonymous caller cannot read it", async () => {
    const { data } = await asAnon()
      .from("agent_verification_submissions")
      .select("id")
      .eq("id", submissionAId);

    expect(data ?? []).toEqual([]);
  });

  it("an admin reads every submission", async () => {
    const { data, error } = await asUser(await mintFreshToken(admin))
      .from("agent_verification_submissions")
      .select("id")
      .eq("id", submissionAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("an agent cannot file a submission against another agent's profile", async () => {
    const { error } = await asUser(await mintFreshToken(agentB))
      .from("agent_verification_submissions")
      .insert({
        agent_profile_id: profileAId,
        full_legal_name: "Forged on behalf of Agent A",
      });

    expect(error).not.toBeNull();

    const { data: control } = await svc
      .from("agent_verification_submissions")
      .select("id")
      .eq("agent_profile_id", profileAId);
    expect(control).toHaveLength(1);
  });

  it("an agent cannot clear reviewed_at to resubmit around the state guard", async () => {
    await svc
      .from("agent_verification_submissions")
      .update({ reviewed_at: new Date().toISOString() })
      .eq("id", submissionAId);

    await asUser(await mintFreshToken(agentA))
      .from("agent_verification_submissions")
      .update({ reviewed_at: null })
      .eq("id", submissionAId);

    const { data: control } = await svc
      .from("agent_verification_submissions")
      .select("reviewed_at")
      .eq("id", submissionAId)
      .single();
    expect(control?.reviewed_at).not.toBeNull();
  });
});
