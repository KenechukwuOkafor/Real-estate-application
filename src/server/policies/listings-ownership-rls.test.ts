/**
 * RLS group 4: listings, listing_images, agent_profiles.
 *
 * The theme is that the column grant, not the row predicate, prevents
 * escalation. An agent legitimately owns their listing row, so ownership alone
 * would let them set status = 'approved' and publish unmoderated. These tests
 * assert on stored values after the attempt, never on error objects.
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

suite("RLS: listing and profile ownership", () => {
  const svc = asServiceRole();

  let agentA: ProbeUser;
  let agentB: ProbeUser;
  let agentAUserId: string;
  let agentBUserId: string;
  let profileAId: string;
  let profileBId: string;
  let draftId: string;
  let imageId: string;

  async function seedAgent(probe: ProbeUser, name: string) {
    const { data: user, error } = await svc
      .from("users")
      .insert({ clerk_user_id: probe.clerkUserId, email: probe.email })
      .select("id")
      .single();
    if (error) throw error;
    await svc.from("user_roles").insert({ role: "agent", user_id: user.id });
    const { data: profile, error: profileError } = await svc
      .from("agent_profiles")
      .insert({ display_name: name, user_id: user.id })
      .select("id")
      .single();
    if (profileError) throw profileError;
    return { profileId: profile.id, userId: user.id };
  }

  beforeAll(async () => {
    [agentA, agentB] = await Promise.all([
      createProbeUser("ownagentA"),
      createProbeUser("ownagentB"),
    ]);

    const a = await seedAgent(agentA, "Owner A");
    const b = await seedAgent(agentB, "Owner B");
    agentAUserId = a.userId;
    profileAId = a.profileId;
    agentBUserId = b.userId;
    profileBId = b.profileId;

    const { data: listing, error } = await svc
      .from("listings")
      .insert({
        agent_profile_id: profileAId,
        area: "Odenigbo",
        bathrooms: 1,
        bedrooms: 1,
        description: "Agent A private draft.",
        price_naira: 250000,
        property_type: "self_contain",
        slug: `rls-own-${Date.now()}`,
        status: "draft",
        title: "Agent A draft",
      })
      .select("id")
      .single();
    if (error) throw error;
    draftId = listing.id;

    const { data: image, error: imageError } = await svc
      .from("listing_images")
      .insert({
        listing_id: draftId,
        mime_type: "image/webp",
        position: 0,
        public_url: "https://example.com/a.webp",
        size_bytes: 1234,
        storage_path: `listings/${draftId}/a.webp`,
      })
      .select("id")
      .single();
    if (imageError) throw imageError;
    imageId = image.id;
  });

  afterAll(async () => {
    if (imageId) await svc.from("listing_images").delete().eq("id", imageId);
    if (draftId) await svc.from("listings").delete().eq("id", draftId);
    for (const id of [profileAId, profileBId]) {
      if (id) await svc.from("agent_profiles").delete().eq("id", id);
    }
    for (const id of [agentAUserId, agentBUserId]) {
      if (id) {
        await svc.from("user_roles").delete().eq("user_id", id);
        await svc.from("users").delete().eq("id", id);
      }
    }
    for (const probe of [agentA, agentB]) {
      if (probe) await deleteProbeUser(probe);
    }
  });

  describe("listings", () => {
    it("the owner reads their own draft", async () => {
      const { data } = await asUser(await mintFreshToken(agentA))
        .from("listings")
        .select("id, title")
        .eq("id", draftId);

      expect(data).toHaveLength(1);
      expect(data?.[0].title).toBe("Agent A draft");
    });

    it("another agent cannot read it", async () => {
      const { data } = await asUser(await mintFreshToken(agentB))
        .from("listings")
        .select("id")
        .eq("id", draftId);

      expect(data).toEqual([]);

      const { data: control } = await svc
        .from("listings")
        .select("id")
        .eq("id", draftId);
      expect(control).toHaveLength(1);
    });

    it("an anonymous caller cannot see an unapproved draft", async () => {
      const { data } = await asAnon().from("listings").select("id").eq("id", draftId);
      expect(data ?? []).toEqual([]);
    });

    it("another agent cannot update a listing they do not own", async () => {
      await asUser(await mintFreshToken(agentB))
        .from("listings")
        .update({ title: "Hijacked by agent B" })
        .eq("id", draftId);

      const { data: control } = await svc
        .from("listings")
        .select("title")
        .eq("id", draftId)
        .single();
      expect(control?.title).toBe("Agent A draft");
    });

    it("the owner cannot approve their own listing", async () => {
      // The escalation the column grant exists to stop. The row predicate
      // matches — it is their listing — so only the absent status grant
      // prevents publishing without moderation.
      await asUser(await mintFreshToken(agentA))
        .from("listings")
        .update({ status: "approved" })
        .eq("id", draftId);

      const { data: control } = await svc
        .from("listings")
        .select("status")
        .eq("id", draftId)
        .single();
      expect(control?.status).toBe("draft");
    });

    it("the owner can still edit their own content", async () => {
      await asUser(await mintFreshToken(agentA))
        .from("listings")
        .update({ title: "Agent A draft, edited" })
        .eq("id", draftId);

      const { data: control } = await svc
        .from("listings")
        .select("title")
        .eq("id", draftId)
        .single();
      expect(control?.title).toBe("Agent A draft, edited");

      await svc.from("listings").update({ title: "Agent A draft" }).eq("id", draftId);
    });

    it("an agent cannot insert a listing that is already approved", async () => {
      const { error } = await asUser(await mintFreshToken(agentA))
        .from("listings")
        .insert({
          agent_profile_id: profileAId,
          area: "Nowhere",
          bathrooms: 1,
          bedrooms: 1,
          description: "Attempting to publish without moderation.",
          price_naira: 100000,
          property_type: "self_contain",
          slug: `rls-sneak-${Date.now()}`,
          status: "approved",
          title: "Sneaky approved listing",
        });

      expect(error).not.toBeNull();
    });

    it("an agent cannot create a listing under another agent's profile", async () => {
      const { error } = await asUser(await mintFreshToken(agentB))
        .from("listings")
        .insert({
          agent_profile_id: profileAId,
          area: "Nowhere",
          bathrooms: 1,
          bedrooms: 1,
          description: "Filed against someone else's profile.",
          price_naira: 100000,
          property_type: "self_contain",
          slug: `rls-forge-${Date.now()}`,
          status: "draft",
          title: "Forged listing",
        });

      expect(error).not.toBeNull();
    });
  });

  describe("listing_images", () => {
    it("another agent cannot read images of a draft they do not own", async () => {
      const { data } = await asUser(await mintFreshToken(agentB))
        .from("listing_images")
        .select("id")
        .eq("id", imageId);

      expect(data).toEqual([]);

      const { data: control } = await svc
        .from("listing_images")
        .select("id")
        .eq("id", imageId);
      expect(control).toHaveLength(1);
    });

    it("another agent cannot attach an image to a listing they do not own", async () => {
      const { error } = await asUser(await mintFreshToken(agentB))
        .from("listing_images")
        .insert({
          listing_id: draftId,
          mime_type: "image/webp",
          position: 5,
          public_url: "https://example.com/hijack.webp",
          size_bytes: 10,
          storage_path: `listings/${draftId}/hijack.webp`,
        });

      expect(error).not.toBeNull();
    });

    it("the owner cannot rewrite a verified storage path", async () => {
      await asUser(await mintFreshToken(agentA))
        .from("listing_images")
        .update({ storage_path: "listings/somewhere-else/evil.webp" })
        .eq("id", imageId);

      const { data: control } = await svc
        .from("listing_images")
        .select("storage_path")
        .eq("id", imageId)
        .single();
      expect(control?.storage_path).toBe(`listings/${draftId}/a.webp`);
    });
  });

  describe("agent_profiles", () => {
    it("an agent cannot verify themselves", async () => {
      await asUser(await mintFreshToken(agentA))
        .from("agent_profiles")
        .update({ verification_status: "verified" })
        .eq("id", profileAId);

      const { data: control } = await svc
        .from("agent_profiles")
        .select("verification_status")
        .eq("id", profileAId)
        .single();
      expect(control?.verification_status).toBe("not_submitted");
    });

    it("an agent cannot mint themselves submission slots", async () => {
      await asUser(await mintFreshToken(agentA))
        .from("agent_profiles")
        .update({ free_listing_quota: 999 })
        .eq("id", profileAId);

      const { data: control } = await svc
        .from("agent_profiles")
        .select("free_listing_quota")
        .eq("id", profileAId)
        .single();
      expect(control?.free_listing_quota).toBe(0);
    });

    it("an agent cannot edit another agent's profile", async () => {
      await asUser(await mintFreshToken(agentB))
        .from("agent_profiles")
        .update({ display_name: "Renamed by B" })
        .eq("id", profileAId);

      const { data: control } = await svc
        .from("agent_profiles")
        .select("display_name")
        .eq("id", profileAId)
        .single();
      expect(control?.display_name).toBe("Owner A");
    });

    it("an agent can edit their own display name", async () => {
      await asUser(await mintFreshToken(agentA))
        .from("agent_profiles")
        .update({ display_name: "Owner A renamed" })
        .eq("id", profileAId);

      const { data: control } = await svc
        .from("agent_profiles")
        .select("display_name")
        .eq("id", profileAId)
        .single();
      expect(control?.display_name).toBe("Owner A renamed");

      await svc
        .from("agent_profiles")
        .update({ display_name: "Owner A" })
        .eq("id", profileAId);
    });
  });
});
