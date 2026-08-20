/**
 * Edit-with-re-review, against a real database.
 *
 * The guarantee being defended is the one the product sells: a moderator
 * reviewed what a seeker sees. So the assertions that matter most are not that
 * a revision can be created — they are that creating one changes NOTHING a
 * seeker can see, and that only an approval does.
 *
 * The submit path is called as the agent with a real Clerk token, because the
 * ownership and state checks live inside the function. The apply and reject
 * paths are called as service-role, because that is how admin-service calls
 * them and they are granted to nobody else.
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

const APPROVED_TITLE = "Approved Title";
const APPROVED_PRICE = 250000;

suite("listing revisions", () => {
  let svc: ReturnType<typeof asServiceRole>;
  let owner: CastMember;
  let stranger: CastMember;
  let ownerProfileId = "";
  let createdProfileIds: string[] = [];
  let listingId = "";
  let imageId = "";
  let reviewerUserId = "";

  beforeAll(async () => {
    svc = asServiceRole();
    const cast = getCast();
    owner = cast.owningAgent;
    stranger = cast.otherAgent;

    const ownerProfile = await ensureProfile(owner.userId, "Revision Owner");
    const strangerProfile = await ensureProfile(stranger.userId, "Revision Stranger");
    ownerProfileId = ownerProfile.id;
    createdProfileIds = [ownerProfile, strangerProfile]
      .filter((profile) => profile.created)
      .map((profile) => profile.id);

    // Any real user will do as the reviewer; the functions record it, they do
    // not authorise from it — admin-service is what authorises.
    const { data: someUser, error } = await svc
      .from("users")
      .select("id")
      .limit(1)
      .single();
    if (error) throw error;
    reviewerUserId = someUser.id;
  });

  afterAll(async () => {
    await destroyFixture();

    for (const id of createdProfileIds) {
      const { error } = await svc.from("agent_profiles").delete().eq("id", id);
      if (error) throw error;
    }
  });

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

  async function destroyFixture() {
    if (!listingId) return;

    const toDelete = listingId;
    listingId = "";

    let r = await svc.from("listing_revisions").delete().eq("listing_id", toDelete);
    if (r.error) throw r.error;
    r = await svc.from("listings").update({ status: "draft" }).eq("id", toDelete);
    if (r.error) throw r.error;
    r = await svc.from("listings").update({ cover_image_id: null }).eq("id", toDelete);
    if (r.error) throw r.error;
    r = await svc.from("listing_images").delete().eq("listing_id", toDelete);
    if (r.error) throw r.error;
    r = await svc.from("listings").delete().eq("id", toDelete);
    if (r.error) throw r.error;
  }

  async function seedApprovedListing() {
    await destroyFixture();

    const { data: listing, error } = await svc
      .from("listings")
      .insert({
        agent_profile_id: ownerProfileId,
        area: "Odenigbo",
        bathrooms: 1,
        bedrooms: 1,
        description: "The description a moderator approved.",
        price_naira: APPROVED_PRICE,
        property_type: "1_bedroom",
        rental_duration: "yearly",
        slug: `revision-${crypto.randomUUID().slice(0, 8)}`,
        status: "draft",
        title: APPROVED_TITLE,
      })
      .select("id")
      .single();
    if (error) throw error;
    listingId = listing.id;

    const { data: image, error: imageError } = await svc
      .from("listing_images")
      .insert({
        is_cover: true,
        listing_id: listingId,
        mime_type: "image/webp",
        position: 0,
        size_bytes: 1000,
        storage_path: `listings/${listingId}/${crypto.randomUUID()}.webp`,
      })
      .select("id")
      .single();
    if (imageError) throw imageError;
    imageId = image.id;

    await svc.from("listings").update({ cover_image_id: imageId }).eq("id", listingId);
    const { error: statusError } = await svc
      .from("listings")
      .update({ status: "approved" })
      .eq("id", listingId);
    if (statusError) throw statusError;

    return listingId;
  }

  async function proposeAs(
    member: CastMember,
    overrides: Partial<{
      amenities: string[];
      description: string;
      priceNaira: number;
      rentalDuration: "yearly" | "monthly" | "sublet";
      subletMonths: number | null;
      title: string;
    }> = {},
    target = listingId,
  ) {
    return asUser(await mintFreshToken(member))
      .rpc("submit_listing_revision", {
        new_amenities: overrides.amenities ?? [],
        new_description: overrides.description ?? "A proposed description.",
        new_price_naira: overrides.priceNaira ?? 300000,
        new_rental_duration: overrides.rentalDuration ?? "yearly",
        new_sublet_months: overrides.subletMonths ?? null,
        new_title: overrides.title ?? "Proposed Title",
        target_listing_id: target,
      })
      .single();
  }

  async function readListing() {
    const { data } = await svc
      .from("listings")
      .select("title, price_naira, description, status, rental_duration, sublet_months")
      .eq("id", listingId)
      .single();
    return data;
  }

  /**
   * DECISION 1, asserted. The listing stays live and stays as approved.
   *
   * This is the whole promise. If a proposal changed anything visible, the
   * moderator's approval would be decorative.
   */
  describe("a pending revision changes nothing a seeker sees", () => {
    it("leaves the listing's values untouched", async () => {
      await seedApprovedListing();

      const { error } = await proposeAs(owner, {
        priceNaira: 999999,
        title: "Proposed Title",
      });
      expect(error).toBeNull();

      const listing = await readListing();
      expect(listing?.title).toBe(APPROVED_TITLE);
      expect(listing?.price_naira).toBe(APPROVED_PRICE);
    });

    it("leaves the listing approved and in public view", async () => {
      await seedApprovedListing();
      await proposeAs(owner);

      expect((await readListing())?.status).toBe("approved");
    });

    it("is still returned by the public feed while a change waits", async () => {
      await seedApprovedListing();
      await proposeAs(owner, { title: "Proposed Title" });

      const { data } = await svc
        .from("listings")
        .select("id, title")
        .eq("status", "approved")
        .eq("id", listingId);

      // Present, and showing the approved title rather than the proposed one.
      expect(data).toHaveLength(1);
      expect(data?.[0].title).toBe(APPROVED_TITLE);
    });
  });

  describe("who may propose, and when", () => {
    it("refuses another agent's listing, as not found", async () => {
      await seedApprovedListing();

      const { error } = await proposeAs(stranger);

      expect(error?.message).toContain("LISTING_NOT_FOUND");
    });

    it.each(["draft", "rejected", "flagged", "under_dispute"] as const)(
      "refuses a listing that is %s",
      async (status) => {
        await seedApprovedListing();
        // Cover must be cleared before leaving approved for some statuses; the
        // trigger only guards approved, so lowering the status first is safe.
        await svc.from("listings").update({ status }).eq("id", listingId);

        const { error } = await proposeAs(owner);

        expect(error?.message).toContain("LISTING_STATE_TRANSITION_INVALID");
      },
    );

    /**
     * Flagging exists to freeze something under investigation. An agent
     * revising the description while a moderator examines it is the evidence
     * moving underneath the review — covered above, and called out here because
     * it is the case with a reason rather than a rule.
     */
    it("refuses a flagged listing specifically", async () => {
      await seedApprovedListing();
      await svc.from("listings").update({ status: "flagged" }).eq("id", listingId);

      const { error } = await proposeAs(owner);

      expect(error?.message).toContain("LISTING_STATE_TRANSITION_INVALID");
    });

    // DECISION 2's bound: rate, not entitlement.
    it("allows only one pending revision at a time", async () => {
      await seedApprovedListing();

      expect((await proposeAs(owner)).error).toBeNull();
      const second = await proposeAs(owner, { title: "Another Proposal" });

      expect(second.error?.message).toContain("LISTING_REVISION_ALREADY_PENDING");
    });

    it("allows a new proposal once the previous one is reviewed", async () => {
      await seedApprovedListing();
      const first = await proposeAs(owner);
      const revisionId = (first.data as { revision_id: string }).revision_id;

      await svc.rpc("reject_listing_revision", {
        reason: "Not this time.",
        reviewer_user_id: reviewerUserId,
        target_revision_id: revisionId,
      });

      expect((await proposeAs(owner)).error).toBeNull();
    });
  });

  describe("applying a revision", () => {
    it("moves the proposed values onto the listing", async () => {
      await seedApprovedListing();
      const proposal = await proposeAs(owner, {
        description: "A corrected description.",
        priceNaira: 310000,
        title: "Corrected Title",
      });
      const revisionId = (proposal.data as { revision_id: string }).revision_id;

      const { error } = await svc
        .rpc("apply_listing_revision", {
          reviewer_user_id: reviewerUserId,
          target_revision_id: revisionId,
        })
        .single();
      expect(error).toBeNull();

      const listing = await readListing();
      expect(listing?.title).toBe("Corrected Title");
      expect(listing?.price_naira).toBe(310000);
      expect(listing?.description).toBe("A corrected description.");
      // Still live throughout. The listing never left public view.
      expect(listing?.status).toBe("approved");
    });

    it("carries a duration change across, pair intact", async () => {
      await seedApprovedListing();
      const proposal = await proposeAs(owner, {
        rentalDuration: "sublet",
        subletMonths: 6,
      });
      const revisionId = (proposal.data as { revision_id: string }).revision_id;

      await svc
        .rpc("apply_listing_revision", {
          reviewer_user_id: reviewerUserId,
          target_revision_id: revisionId,
        })
        .single();

      const listing = await readListing();
      expect(listing?.rental_duration).toBe("sublet");
      expect(listing?.sublet_months).toBe(6);
    });

    it("refuses to apply the same revision twice", async () => {
      await seedApprovedListing();
      const proposal = await proposeAs(owner);
      const revisionId = (proposal.data as { revision_id: string }).revision_id;

      await svc.rpc("apply_listing_revision", {
        reviewer_user_id: reviewerUserId,
        target_revision_id: revisionId,
      });

      const { error } = await svc
        .rpc("apply_listing_revision", {
          reviewer_user_id: reviewerUserId,
          target_revision_id: revisionId,
        })
        .single();

      expect(error?.message).toContain("LISTING_REVISION_ALREADY_REVIEWED");
    });

    it("leaves the listing alone when a revision is rejected", async () => {
      await seedApprovedListing();
      const proposal = await proposeAs(owner, { priceNaira: 999999 });
      const revisionId = (proposal.data as { revision_id: string }).revision_id;

      await svc.rpc("reject_listing_revision", {
        reason: "The price looks wrong.",
        reviewer_user_id: reviewerUserId,
        target_revision_id: revisionId,
      });

      expect((await readListing())?.price_naira).toBe(APPROVED_PRICE);
    });
  });

  /**
   * The write path is a function precisely so the table is not writable. If
   * these ever pass, the escalation has leaked into a grant.
   */
  describe("the table itself is not writable by an agent", () => {
    it("refuses a direct insert", async () => {
      await seedApprovedListing();

      const { error } = await asUser(await mintFreshToken(owner))
        .from("listing_revisions")
        .insert({
          description: "Straight in.",
          listing_id: listingId,
          price_naira: 1,
          rental_duration: "yearly",
          title: "Straight in.",
        });

      expect(error?.message).toContain("permission denied");
    });

    it("refuses a direct status update", async () => {
      await seedApprovedListing();
      const proposal = await proposeAs(owner);
      const revisionId = (proposal.data as { revision_id: string }).revision_id;

      const { error } = await asUser(await mintFreshToken(owner))
        .from("listing_revisions")
        .update({ status: "approved" })
        .eq("id", revisionId);

      expect(error?.message).toContain("permission denied");

      const { data } = await svc
        .from("listing_revisions")
        .select("status")
        .eq("id", revisionId)
        .single();
      expect(data?.status).toBe("pending_review");
    });

    // An agent must still be able to SEE their own pending change and why one
    // was rejected, or the queue is invisible to the person waiting on it.
    it("lets an agent read their own revisions", async () => {
      await seedApprovedListing();
      await proposeAs(owner);

      const { data, error } = await asUser(await mintFreshToken(owner))
        .from("listing_revisions")
        .select("id, status")
        .eq("listing_id", listingId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("does not let another agent read them", async () => {
      await seedApprovedListing();
      await proposeAs(owner);

      const { data } = await asUser(await mintFreshToken(stranger))
        .from("listing_revisions")
        .select("id")
        .eq("listing_id", listingId);

      expect(data).toEqual([]);
    });
  });
});
