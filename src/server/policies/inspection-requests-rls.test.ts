/**
 * RLS group 3: inspection_requests.
 *
 * Parties only: the seeker who made it and the agent who owns the listing.
 * Denials are paired with service-role controls.
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

suite("RLS: inspection_requests", () => {
  const svc = asServiceRole();

  let seeker: ProbeUser;
  let owningAgent: ProbeUser;
  let otherAgent: ProbeUser;
  let otherSeeker: ProbeUser;

  let seekerUserId: string;
  let owningAgentUserId: string;
  let otherAgentUserId: string;
  let otherSeekerUserId: string;
  let owningProfileId: string;
  let otherProfileId: string;
  let listingId: string;
  let requestId: string;

  async function seedUser(probe: ProbeUser) {
    const { data, error } = await svc
      .from("users")
      .insert({ clerk_user_id: probe.clerkUserId, email: probe.email })
      .select("id")
      .single();
    if (error) throw error;
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
    [seeker, owningAgent, otherAgent, otherSeeker] = await Promise.all([
      createProbeUser("inspseeker"),
      createProbeUser("inspowner"),
      createProbeUser("inspother"),
      createProbeUser("inspseeker2"),
    ]);

    seekerUserId = await seedUser(seeker);
    owningAgentUserId = await seedUser(owningAgent);
    otherAgentUserId = await seedUser(otherAgent);
    otherSeekerUserId = await seedUser(otherSeeker);

    owningProfileId = await seedProfile(owningAgentUserId, "Owning Agent");
    otherProfileId = await seedProfile(otherAgentUserId, "Other Agent");

    const { data: listing, error: listingError } = await svc
      .from("listings")
      .insert({
        agent_profile_id: owningProfileId,
        area: "Odenigbo",
        bathrooms: 1,
        bedrooms: 1,
        description: "RLS inspection fixture.",
        price_naira: 250000,
        property_type: "self_contain",
        slug: `rls-insp-${Date.now()}`,
        status: "approved",
        title: "RLS inspection fixture",
      })
      .select("id")
      .single();
    if (listingError) throw listingError;
    listingId = listing.id;

    const { data: request, error: requestError } = await svc
      .from("inspection_requests")
      .insert({
        agent_profile_id: owningProfileId,
        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        listing_id: listingId,
        message: "Is this still available?",
        requester_user_id: seekerUserId,
      })
      .select("id")
      .single();
    if (requestError) throw requestError;
    requestId = request.id;
  });

  afterAll(async () => {
    if (requestId) await svc.from("inspection_requests").delete().eq("id", requestId);
    if (listingId) await svc.from("listings").delete().eq("id", listingId);
    for (const id of [owningProfileId, otherProfileId]) {
      if (id) await svc.from("agent_profiles").delete().eq("id", id);
    }
    for (const id of [
      seekerUserId,
      owningAgentUserId,
      otherAgentUserId,
      otherSeekerUserId,
    ]) {
      if (id) await svc.from("users").delete().eq("id", id);
    }
    for (const probe of [seeker, owningAgent, otherAgent, otherSeeker]) {
      if (probe) await deleteProbeUser(probe);
    }
  });

  it("control: the request exists", async () => {
    const { data } = await svc
      .from("inspection_requests")
      .select("id")
      .eq("id", requestId);
    expect(data).toHaveLength(1);
  });

  it("the requesting seeker reads it", async () => {
    const { data, error } = await asUser(await mintFreshToken(seeker))
      .from("inspection_requests")
      .select("id, message")
      .eq("id", requestId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].message).toBe("Is this still available?");
  });

  it("the owning agent reads it", async () => {
    const { data, error } = await asUser(await mintFreshToken(owningAgent))
      .from("inspection_requests")
      .select("id")
      .eq("id", requestId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("a seeker who is not party to it cannot read it", async () => {
    const { data } = await asUser(await mintFreshToken(otherSeeker))
      .from("inspection_requests")
      .select("id")
      .eq("id", requestId);

    expect(data).toEqual([]);

    const { data: control } = await svc
      .from("inspection_requests")
      .select("id")
      .eq("id", requestId);
    expect(control).toHaveLength(1);
  });

  it("an agent who does not own the listing cannot read it", async () => {
    const { data } = await asUser(await mintFreshToken(otherAgent))
      .from("inspection_requests")
      .select("id")
      .eq("id", requestId);

    expect(data).toEqual([]);

    const { data: control } = await svc
      .from("inspection_requests")
      .select("id")
      .eq("id", requestId);
    expect(control).toHaveLength(1);
  });

  it("an anonymous caller cannot read it", async () => {
    const { data } = await asAnon()
      .from("inspection_requests")
      .select("id")
      .eq("id", requestId);

    expect(data ?? []).toEqual([]);
  });

  it("the owning agent can accept it", async () => {
    await asUser(await mintFreshToken(owningAgent))
      .from("inspection_requests")
      .update({ responded_at: new Date().toISOString(), status: "accepted" })
      .eq("id", requestId);

    const { data: control } = await svc
      .from("inspection_requests")
      .select("status")
      .eq("id", requestId)
      .single();
    expect(control?.status).toBe("accepted");

    // Reset for the assertions below.
    await svc
      .from("inspection_requests")
      .update({ responded_at: null, status: "requested" })
      .eq("id", requestId);
  });

  it("the requesting seeker cannot accept their own request", async () => {
    await asUser(await mintFreshToken(seeker))
      .from("inspection_requests")
      .update({ status: "accepted" })
      .eq("id", requestId);

    const { data: control } = await svc
      .from("inspection_requests")
      .select("status")
      .eq("id", requestId)
      .single();
    expect(control?.status).toBe("requested");
  });

  it("a non-owning agent cannot accept it", async () => {
    await asUser(await mintFreshToken(otherAgent))
      .from("inspection_requests")
      .update({ status: "accepted" })
      .eq("id", requestId);

    const { data: control } = await svc
      .from("inspection_requests")
      .select("status")
      .eq("id", requestId)
      .single();
    expect(control?.status).toBe("requested");
  });

  it("the owning agent cannot rewrite who requested it", async () => {
    // REB-ARCH-004: "Cannot modify requester information." Enforced by the
    // column grant, not the row predicate — the agent does satisfy the policy.
    await asUser(await mintFreshToken(owningAgent))
      .from("inspection_requests")
      .update({ requester_user_id: otherSeekerUserId })
      .eq("id", requestId);

    const { data: control } = await svc
      .from("inspection_requests")
      .select("requester_user_id")
      .eq("id", requestId)
      .single();
    expect(control?.requester_user_id).toBe(seekerUserId);
  });
});
