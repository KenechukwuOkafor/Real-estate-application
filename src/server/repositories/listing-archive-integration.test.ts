/**
 * Agent-initiated withdrawal, against a real database.
 *
 * Called AS THE AGENT with a real Clerk token, because the ownership and status
 * checks live inside the function and calling it as service-role would prove
 * nothing about who may invoke it.
 *
 * The terminality assertions are the ones that matter most, and they are
 * deliberately made through the SERVICE-ROLE client. Agents cannot write status
 * at all, so asserting that an agent cannot un-archive would prove only that a
 * grant is missing — which was already true before this migration and is not
 * what "terminal" means. The trigger is what makes it terminal for every
 * caller, and service-role is the caller that would otherwise get past
 * everything else.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type CastMember, getCast } from "../../../test/helpers/cast";
import { mintFreshToken } from "../../../test/helpers/clerk-tokens";
import {
  asServiceRole,
  asUser,
  rlsIntegrationEnabled,
} from "../../../test/helpers/rls-clients";
import { listingImagePath } from "../../../test/helpers/storage-paths";

const suite = rlsIntegrationEnabled() ? describe : describe.skip;

suite("archive_own_listing", () => {
  let svc: ReturnType<typeof asServiceRole>;
  let owner: CastMember;
  let stranger: CastMember;
  let ownerProfileId = "";
  let createdProfileIds: string[] = [];
  let listingId = "";
  let imageId = "";

  beforeAll(async () => {
    svc = asServiceRole();
    const cast = getCast();
    owner = cast.owningAgent;
    stranger = cast.otherAgent;

    const ownerProfile = await ensureProfile(owner.userId, "Archive Owner");
    const strangerProfile = await ensureProfile(stranger.userId, "Archive Stranger");
    ownerProfileId = ownerProfile.id;
    // The stranger's profile is created for its effect, not its id: an agent
    // with no profile is refused earlier and for a different reason, which
    // would make "another agent cannot do this" pass for the wrong reason.
    createdProfileIds = [ownerProfile, strangerProfile]
      .filter((profile) => profile.created)
      .map((profile) => profile.id);
  });

  afterAll(async () => {
    await destroyFixture();

    // Only what this suite created. A borrowed profile belongs to whoever
    // made it and must survive this teardown.
    for (const id of createdProfileIds) {
      const { error } = await svc.from("agent_profiles").delete().eq("id", id);
      if (error) throw error;
    }
  });

  /**
   * Reuse an existing profile for this cast user rather than colliding with it.
   *
   * agent_profiles.user_id is UNIQUE and eight suites seed a profile for the
   * same two cast members. Inserting unconditionally makes every suite depend on
   * every earlier suite having cleaned up perfectly: one failure leaves a row
   * behind, the next suite's beforeAll throws on the unique violation, its
   * tests report as skipped rather than failed, and its own teardown never
   * runs. That cascade is what turned one broken teardown into two unrelated
   * failing suites.
   *
   * Only profiles this suite actually created are deleted, so borrowing one
   * cannot delete it out from under whoever owns it.
   */
  async function ensureProfile(userId: string, name: string) {
    const existing = await svc
      .from("agent_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing.error) throw existing.error;

    if (existing.data) {
      return { created: false, id: existing.data.id };
    }

    const { data, error } = await svc
      .from("agent_profiles")
      .insert({ display_name: name, user_id: userId })
      .select("id")
      .single();
    if (error) throw error;

    return { created: true, id: data.id };
  }

  /**
   * Teardown has to get past two triggers that pull in opposite directions, and
   * getting it wrong is how this suite first failed.
   *
   * BR-MEDIA-006 refuses a null cover on an APPROVED listing, so the status has
   * to come down before the cover can be cleared. But this migration makes
   * ARCHIVED terminal, so the status of an archived fixture cannot come down at
   * all — and it does not need to, because that trigger only guards 'approved'.
   *
   * Hence the branch. Every step is checked: a cleanup that fails quietly does
   * its damage in another suite, which is exactly what happened the last time
   * this trigger was met in a teardown.
   */
  async function destroyFixture() {
    if (!listingId) return;

    const toDelete = listingId;
    listingId = "";

    const { data: current } = await svc
      .from("listings")
      .select("status")
      .eq("id", toDelete)
      .single();

    if (current && current.status !== "archived") {
      const demote = await svc
        .from("listings")
        .update({ status: "draft" })
        .eq("id", toDelete);
      if (demote.error) throw demote.error;
    }

    const uncover = await svc
      .from("listings")
      .update({ cover_image_id: null })
      .eq("id", toDelete);
    if (uncover.error) throw uncover.error;

    const images = await svc
      .from("listing_images")
      .delete()
      .eq("listing_id", toDelete);
    if (images.error) throw images.error;

    const listing = await svc.from("listings").delete().eq("id", toDelete);
    if (listing.error) throw listing.error;
  }

  async function seedListing(status: "approved" | "draft" | "flagged") {
    await destroyFixture();

    const { data: listing, error } = await svc
      .from("listings")
      .insert({
        agent_profile_id: ownerProfileId,
        area: "Odenigbo",
        bathrooms: 1,
        bedrooms: 1,
        description: "Archive fixture.",
        price_naira: 250000,
        property_type: "1_bedroom",
        rental_duration: "yearly",
        slug: `archive-${crypto.randomUUID().slice(0, 8)}`,
        status: "draft",
        title: "Archive fixture",
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
        storage_path: listingImagePath(listingId),
      })
      .select("id")
      .single();
    if (imageError) throw imageError;
    imageId = image.id;

    await svc.from("listings").update({ cover_image_id: imageId }).eq("id", listingId);

    if (status !== "draft") {
      const { error: statusError } = await svc
        .from("listings")
        .update({ status })
        .eq("id", listingId);
      if (statusError) throw statusError;
    }

    return listingId;
  }

  async function archiveAs(member: CastMember, target: string) {
    return asUser(await mintFreshToken(member))
      .rpc("archive_own_listing", { target_listing_id: target })
      .single();
  }

  async function readStatus() {
    const { data } = await svc
      .from("listings")
      .select("status, archived_at")
      .eq("id", listingId)
      .single();
    return data;
  }

  it("withdraws an approved listing", async () => {
    await seedListing("approved");

    const { error } = await archiveAs(owner, listingId);
    expect(error).toBeNull();

    const listing = await readStatus();
    expect(listing?.status).toBe("archived");
    expect(listing?.archived_at).not.toBeNull();
  });

  it("refuses a draft, which is deleted rather than withdrawn", async () => {
    await seedListing("draft");

    const { error } = await archiveAs(owner, listingId);

    expect(error?.message).toContain("LISTING_STATE_TRANSITION_INVALID");
    expect((await readStatus())?.status).toBe("draft");
  });

  /**
   * A listing under investigation must not be removable by the agent being
   * investigated — that would let someone end an investigation by ending the
   * thing being investigated.
   */
  it("refuses a flagged listing", async () => {
    await seedListing("flagged");

    const { error } = await archiveAs(owner, listingId);

    expect(error?.message).toContain("LISTING_STATE_TRANSITION_INVALID");
    expect((await readStatus())?.status).toBe("flagged");
  });

  it("refuses another agent's listing, and says not found rather than forbidden", async () => {
    await seedListing("approved");

    const { error } = await archiveAs(stranger, listingId);

    expect(error?.message).toContain("LISTING_NOT_FOUND");
    expect((await readStatus())?.status).toBe("approved");
  });

  it("refuses an id that does not exist", async () => {
    await seedListing("approved");

    const { error } = await archiveAs(owner, crypto.randomUUID());

    expect(error?.message).toContain("LISTING_NOT_FOUND");
  });

  it("is idempotent in effect: archiving twice refuses the second time", async () => {
    await seedListing("approved");

    expect((await archiveAs(owner, listingId)).error).toBeNull();
    const second = await archiveAs(owner, listingId);

    expect(second.error?.message).toContain("LISTING_STATE_TRANSITION_INVALID");
    expect((await readStatus())?.status).toBe("archived");
  });

  describe("archived is terminal at the database", () => {
    /**
     * Through service-role, which bypasses RLS and every column grant. If the
     * guarantee were only "agents cannot write status", these would pass
     * trivially and prove nothing — the specification says archived cannot
     * return, and until the trigger existed nothing enforced it.
     */
    it.each([
      "approved",
      "draft",
      "pending_review",
      "rejected",
      "flagged",
      "under_dispute",
    ] as const)("even service-role cannot move archived back to %s", async (target) => {
      await seedListing("approved");
      await archiveAs(owner, listingId);

      const { error } = await svc
        .from("listings")
        .update({ status: target })
        .eq("id", listingId);

      expect(error?.message).toContain("LISTING_ARCHIVED_IS_TERMINAL");
      expect((await readStatus())?.status).toBe("archived");
    });

    // Terminality is about the status, not about the row. An archived listing
    // must still be soft-deletable and its other columns still writable, or
    // ordinary maintenance becomes impossible.
    it("still allows non-status writes on an archived listing", async () => {
      await seedListing("approved");
      await archiveAs(owner, listingId);

      const { error } = await svc
        .from("listings")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", listingId);

      expect(error).toBeNull();
      expect((await readStatus())?.status).toBe("archived");
    });
  });

  // The slot is not returned. Asserted so a future change to that policy is a
  // deliberate edit to a failing test rather than a silent behaviour change.
  it("does not return the submission slot", async () => {
    await seedListing("approved");

    const before = await svc
      .from("agent_profiles")
      .select("free_listing_quota")
      .eq("id", ownerProfileId)
      .single();

    await archiveAs(owner, listingId);

    const after = await svc
      .from("agent_profiles")
      .select("free_listing_quota")
      .eq("id", ownerProfileId)
      .single();

    expect(after.data?.free_listing_quota).toBe(before.data?.free_listing_quota);
  });
});
