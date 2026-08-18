/**
 * RLS group 2: agent_verification_submissions.
 *
 * Identity documents. BR-SEC-005 (Critical): verification documents remain
 * private. Every denial is paired with a service-role control proving the row
 * exists and is being withheld.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createProbeUser,
  deleteProbeUser,
  mintFreshToken,
  type ProbeUser,
} from "../../../test/helpers/clerk-tokens";
import {
  asAnon,
  asServiceRole,
  asUser,
  rlsIntegrationEnabled,
} from "../../../test/helpers/rls-clients";

const suite = rlsIntegrationEnabled() ? describe : describe.skip;

suite("RLS: agent_verification_submissions", () => {
  const svc = asServiceRole();

  let agentA: ProbeUser;
  let agentB: ProbeUser;
  let admin: ProbeUser;

  let agentAUserId: string;
  let agentBUserId: string;
  let adminUserId: string;
  let profileAId: string;
  let profileBId: string;
  let submissionAId: string;

  async function seedUser(probe: ProbeUser, role: "agent" | "admin") {
    const { data, error } = await svc
      .from("users")
      .insert({ clerk_user_id: probe.clerkUserId, email: probe.email })
      .select("id")
      .single();
    if (error) throw error;

    const { error: roleError } = await svc
      .from("user_roles")
      .insert({ role, user_id: data.id });
    if (roleError) throw roleError;

    return data.id;
  }

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
    [agentA, agentB, admin] = await Promise.all([
      createProbeUser("verifagentA"),
      createProbeUser("verifagentB"),
      createProbeUser("verifadmin"),
    ]);

    agentAUserId = await seedUser(agentA, "agent");
    agentBUserId = await seedUser(agentB, "agent");
    adminUserId = await seedUser(admin, "admin");

    profileAId = await seedProfile(agentAUserId, "Agent A");
    profileBId = await seedProfile(agentBUserId, "Agent B");

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

  afterAll(async () => {
    if (submissionAId)
      await svc.from("agent_verification_submissions").delete().eq("id", submissionAId);
    for (const id of [profileAId, profileBId]) {
      if (id) await svc.from("agent_profiles").delete().eq("id", id);
    }
    for (const id of [agentAUserId, agentBUserId, adminUserId]) {
      if (id) {
        await svc.from("user_roles").delete().eq("user_id", id);
        await svc.from("users").delete().eq("id", id);
      }
    }
    for (const probe of [agentA, agentB, admin]) {
      if (probe) await deleteProbeUser(probe);
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
