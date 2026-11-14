/**
 * Suspension, end to end against the replayed database. ADR-017-A1, 0044.
 *
 * Each denial here carries a positive control (ADR-010-A1): a refusal proves
 * nothing unless the same setup, with the one thing that should matter changed,
 * succeeds. And the fixture restores what it touched — the PROBE strings that
 * sat in a local profile for months came from a suite that did not.
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
import { listingImagePath } from "../../../test/helpers/storage-paths";

const suite = rlsIntegrationEnabled() ? describe : describe.skip;

const REASON = "Three seekers report paying deposits for rooms that were already let.";

suite("agent suspension (0044, ADR-017-A1)", () => {
  let svc: ReturnType<typeof asServiceRole>;
  let owner: CastMember;
  let stranger: CastMember;
  let ownerProfileId = "";
  let createdProfileIds: string[] = [];
  let adminUserId = "";
  let nonAdminUserId = "";
  let listingId = "";
  let original: { suspension_reason: string | null; verification_status: string } | null = null;

  beforeAll(async () => {
    svc = asServiceRole();
    const cast = getCast();
    owner = cast.owningAgent;
    stranger = cast.otherAgent;
    adminUserId = cast.admin.userId;
    nonAdminUserId = cast.seeker.userId;

    const ownerProfile = await ensureProfile(owner.userId, "Suspension Owner");
    const strangerProfile = await ensureProfile(stranger.userId, "Suspension Stranger");
    ownerProfileId = ownerProfile.id;
    createdProfileIds = [ownerProfile, strangerProfile]
      .filter((profile) => profile.created)
      .map((profile) => profile.id);

    // Remember exactly what was there, and make the owner a verified agent —
    // the only status suspend_agent accepts, and the realistic one for an agent
    // with a live listing.
    const { data, error } = await svc
      .from("agent_profiles")
      .select("suspension_reason, verification_status")
      .eq("id", ownerProfileId)
      .single();
    if (error) throw error;
    original = data;

    await setOwner({ suspension_reason: null, verification_status: "verified" });
    listingId = await seedApprovedListing();
  }, 60_000);

  afterAll(async () => {
    if (listingId) {
      await svc.from("listing_revisions").delete().eq("listing_id", listingId);
      await svc.from("listings").update({ status: "draft" }).eq("id", listingId);
      await svc.from("listings").update({ cover_image_id: null }).eq("id", listingId);
      await svc.from("listing_images").delete().eq("listing_id", listingId);
      await svc.from("listings").delete().eq("id", listingId);
    }

    if (original) {
      await setOwner(original);
    }

    for (const id of createdProfileIds) {
      await svc.from("agent_profiles").delete().eq("id", id);
    }
  }, 60_000);

  async function ensureProfile(userId: string, name: string) {
    const existing = await svc
      .from("agent_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return { created: false, id: existing.data.id };

    const { data, error } = await svc
      .from("agent_profiles")
      .insert({ display_name: name, user_id: userId })
      .select("id")
      .single();
    if (error) throw error;
    return { created: true, id: data.id };
  }

  async function setOwner(values: { suspension_reason: string | null; verification_status: string }) {
    const { error } = await svc
      .from("agent_profiles")
      .update(values as never)
      .eq("id", ownerProfileId);
    if (error) throw new Error(`set owner profile: ${JSON.stringify(error)}`);
  }

  async function seedApprovedListing() {
    const { data: listing, error } = await svc
      .from("listings")
      .insert({
        agent_profile_id: ownerProfileId,
        area: "Odenigbo",
        bathrooms: 1,
        bedrooms: 1,
        description: "Live before the suspension.",
        price_naira: 250000,
        property_type: "1_bedroom",
        rental_duration: "yearly",
        slug: `suspension-${crypto.randomUUID().slice(0, 8)}`,
        status: "draft",
        title: "Suspension Fixture",
      })
      .select("id, public_uuid")
      .single();
    if (error) throw error;

    const { data: image, error: imageError } = await svc
      .from("listing_images")
      .insert({
        is_cover: true,
        listing_id: listing.id,
        mime_type: "image/webp",
        position: 0,
        size_bytes: 1000,
        storage_path: listingImagePath(listing.id),
      })
      .select("id")
      .single();
    if (imageError) throw imageError;

    await svc.from("listings").update({ cover_image_id: image.id }).eq("id", listing.id);
    const { error: statusError } = await svc
      .from("listings")
      .update({ status: "approved" })
      .eq("id", listing.id);
    if (statusError) throw statusError;

    return listing.id as string;
  }

  async function ownerStatus() {
    const { data } = await svc
      .from("agent_profiles")
      .select("verification_status, suspension_reason")
      .eq("id", ownerProfileId)
      .single();
    return data;
  }

  /** What a seeker sees: the public listing read, joined as the feed joins it. */
  async function publiclyVisible() {
    const { data, error } = await asAnon()
      .from("listings")
      .select("id, agent_profiles!inner(id)")
      .eq("id", listingId);
    if (error) throw error;
    return (data ?? []).length === 1;
  }

  function suspend(reason = REASON, moderator = adminUserId) {
    return svc.rpc("suspend_agent", {
      moderator_user_id: moderator,
      reason,
      target_agent_profile_id: ownerProfileId,
    });
  }

  function reinstate(moderator = adminUserId) {
    return svc.rpc("reinstate_agent", {
      moderator_user_id: moderator,
      target_agent_profile_id: ownerProfileId,
    });
  }

  async function proposeAsOwner() {
    return asUser(await mintFreshToken(owner))
      .rpc("submit_listing_revision", {
        new_amenities: [],
        new_description: "A proposed description.",
        new_price_naira: 300000,
        new_rental_duration: "yearly",
        new_sublet_months: null,
        new_title: "Proposed Title",
        target_listing_id: listingId,
      })
      .single();
  }

  describe("who may suspend", () => {
    it("refuses every client role, and the agent themselves", async () => {
      const callers = [
        ["anon", asAnon()],
        ["the agent", asUser(await mintFreshToken(owner))],
        ["an admin's own session", asUser(await mintFreshToken(getCast().admin))],
      ] as const;

      for (const [label, client] of callers) {
        const { error } = await client.rpc("suspend_agent", {
          moderator_user_id: adminUserId,
          reason: REASON,
          target_agent_profile_id: ownerProfileId,
        });
        expect(error, label).not.toBeNull();
      }

      // Nothing moved for any of them.
      expect((await ownerStatus())?.verification_status).toBe("verified");
    });

    it("refuses a moderator who is not an admin, even through the service role", async () => {
      const { error } = await suspend(REASON, nonAdminUserId);

      expect(error?.message).toContain("REVIEWER_IS_NOT_AN_ADMIN");
      expect((await ownerStatus())?.verification_status).toBe("verified");
    });

    it("refuses a blank reason and writes nothing", async () => {
      for (const blank of ["", "   "]) {
        const { error } = await suspend(blank);
        expect(error?.message).toContain("MODERATION_REASON_REQUIRED");
      }

      expect(await ownerStatus()).toEqual({ suspension_reason: null, verification_status: "verified" });
    });
  });

  describe("while suspended", () => {
    beforeAll(async () => {
      // The positive control for everything above: the right caller, an admin
      // moderator and a real reason succeed.
      expect(await publiclyVisible()).toBe(true);
      const { error } = await suspend();
      if (error) throw error;
    }, 60_000);

    it("records the status and the moderator's words, trimmed and verbatim", async () => {
      expect(await ownerStatus()).toEqual({
        suspension_reason: REASON,
        verification_status: "suspended",
      });
    });

    it("hides the agent's listing from seekers", async () => {
      expect(await publiclyVisible()).toBe(false);
    });

    it("lets the agent read their own reason, and nobody else's", async () => {
      const own = await asUser(await mintFreshToken(owner)).rpc("own_agent_suspension_reason");
      expect(own.error).toBeNull();
      expect(own.data).toBe(REASON);

      // Another signed-in agent asking gets their own answer: nothing.
      const theirs = await asUser(await mintFreshToken(stranger)).rpc("own_agent_suspension_reason");
      expect(theirs.error).toBeNull();
      expect(theirs.data).toBeNull();
    });

    it("still withholds the column itself from the agent", async () => {
      const { error } = await asUser(await mintFreshToken(owner))
        .from("agent_profiles")
        .select("suspension_reason")
        .eq("id", ownerProfileId);

      expect(error?.code).toBe("42501");
    });

    it("refuses a revision, so a hidden agent cannot feed the moderation queue", async () => {
      const { error } = await proposeAsOwner();

      expect(error?.message).toContain("AGENT_SUSPENDED");

      const { count } = await svc
        .from("listing_revisions")
        .select("id", { count: "exact", head: true })
        .eq("listing_id", listingId);
      expect(count).toBe(0);
    });

    it("still lets the agent read their own listing: obligations continue", async () => {
      const { data, error } = await asUser(await mintFreshToken(owner))
        .from("listings")
        .select("id, status")
        .eq("id", listingId);

      expect(error).toBeNull();
      expect(data).toEqual([{ id: listingId, status: "approved" }]);
    });

    it("refuses to suspend an agent who is already suspended", async () => {
      const { error } = await suspend("Again.");

      expect(error?.message).toContain("VERIFICATION_STATE_TRANSITION_INVALID");
      expect((await ownerStatus())?.suspension_reason).toBe(REASON);
    });
  });

  describe("reinstating", () => {
    beforeAll(async () => {
      const { error } = await reinstate();
      if (error) throw error;
    }, 60_000);

    it("returns the agent to verified and clears the reason", async () => {
      expect(await ownerStatus()).toEqual({ suspension_reason: null, verification_status: "verified" });
    });

    it("puts the listing back in front of seekers", async () => {
      expect(await publiclyVisible()).toBe(true);
    });

    it("lets the same agent propose the same change again", async () => {
      // The positive control for the revision refusal: identical call, the
      // suspension is the only thing that changed.
      const { error } = await proposeAsOwner();

      expect(error).toBeNull();
    });

    it("leaves the reason function with nothing to say", async () => {
      const { data } = await asUser(await mintFreshToken(owner)).rpc("own_agent_suspension_reason");
      expect(data).toBeNull();
    });

    it("refuses to reinstate an agent who is not suspended", async () => {
      const { error } = await reinstate();

      expect(error?.message).toContain("VERIFICATION_STATE_TRANSITION_INVALID");
    });
  });
});
