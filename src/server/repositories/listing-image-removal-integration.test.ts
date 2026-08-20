/**
 * Removing a listing image, against a real database.
 *
 * The rule being defended is that removal is escalated into
 * public.remove_listing_image rather than granted, so these call the function
 * AS THE AGENT — through the authenticated client, with a real Clerk token —
 * because that is the only way the ownership and status checks inside it are
 * actually exercised. Calling it as service-role would prove nothing about who
 * may invoke it.
 *
 * The cover promotion assertions matter most. Both cover triggers guard only
 * approved listings, and removal is permitted only on draft and rejected ones,
 * so nothing in the database stops a removal from orphaning
 * listings.cover_image_id. If promotion regressed, no test here would fail and
 * no constraint would fire — the damage would surface days later as
 * LISTING_COVER_REQUIRED on a moderator's approval.
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

suite("remove_listing_image", () => {
  let svc: ReturnType<typeof asServiceRole>;
  let owner: CastMember;
  let stranger: CastMember;
  let ownerProfileId = "";
  let strangerProfileId = "";
  let listingId = "";

  beforeAll(async () => {
    svc = asServiceRole();
    const cast = getCast();
    owner = cast.owningAgent;
    stranger = cast.otherAgent;

    ownerProfileId = await seedProfile(owner.userId, "Removal Owner");
    strangerProfileId = await seedProfile(stranger.userId, "Removal Stranger");
  });

  afterAll(async () => {
    await destroyFixtureListing();

    for (const id of [ownerProfileId, strangerProfileId]) {
      if (id) {
        const { error } = await svc.from("agent_profiles").delete().eq("id", id);
        if (error) throw error;
      }
    }
  });

  /**
   * Tear the fixture down in an order the constraints permit, and shout if any
   * step fails.
   *
   * The order is not incidental. An APPROVED listing cannot have its
   * cover_image_id nulled — the deferred BR-MEDIA-006 trigger refuses it — so
   * the status has to come down first. Getting that wrong is how this suite
   * first leaked: every cleanup step failed in turn, none of them was checked,
   * and two approved fixtures survived the run. They then broke an unrelated
   * suite that counts the seeded feed, and the leftover agent_profiles rows
   * broke every other suite that seeds a profile for the same cast user, since
   * user_id is UNIQUE. Those suites reported their tests as SKIPPED rather than
   * failed, which is how a leak in one file becomes fifty silent skips.
   *
   * Every step is error-checked for that reason: a cleanup that fails quietly
   * is worse than one that fails loudly, because the damage lands somewhere
   * else.
   */
  async function destroyFixtureListing() {
    if (!listingId) return;

    const toDelete = listingId;
    listingId = "";

    const demote = await svc
      .from("listings")
      .update({ status: "draft" })
      .eq("id", toDelete);
    if (demote.error) throw demote.error;

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

  async function seedProfile(userId: string, name: string) {
    const { data, error } = await svc
      .from("agent_profiles")
      .insert({ display_name: name, user_id: userId })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  /**
   * A listing with three images, cover on the lowest position — the shape a
   * submittable listing has, so removal is tested against the real minimum
   * rather than a single-image toy.
   */
  async function seedListingWithImages(status: "draft" | "rejected" | "approved") {
    await destroyFixtureListing();

    const { data: listing, error } = await svc
      .from("listings")
      .insert({
        agent_profile_id: ownerProfileId,
        area: "Odenigbo",
        bathrooms: 1,
        bedrooms: 1,
        description: "Image removal fixture.",
        price_naira: 250000,
        property_type: "1_bedroom",
        rental_duration: "yearly",
        slug: `image-removal-${crypto.randomUUID().slice(0, 8)}`,
        status: "draft",
        title: "Image removal fixture",
      })
      .select("id")
      .single();
    if (error) throw error;
    listingId = listing.id;

    const ids: string[] = [];
    for (const position of [0, 1, 2]) {
      const { data: image, error: imageError } = await svc
        .from("listing_images")
        .insert({
          is_cover: position === 0,
          listing_id: listingId,
          mime_type: "image/webp",
          position,
          size_bytes: 1000 + position,
          storage_path: `listings/${listingId}/image-${position}.webp`,
        })
        .select("id")
        .single();
      if (imageError) throw imageError;
      ids.push(image.id);
    }

    await svc.from("listings").update({ cover_image_id: ids[0] }).eq("id", listingId);

    if (status !== "draft") {
      const { error: statusError } = await svc
        .from("listings")
        .update({ status })
        .eq("id", listingId);
      if (statusError) throw statusError;
    }

    return ids;
  }

  async function removeAs(member: CastMember, imageId: string) {
    return asUser(await mintFreshToken(member))
      .rpc("remove_listing_image", { target_image_id: imageId })
      .single();
  }

  async function readListing() {
    const { data } = await svc
      .from("listings")
      .select("cover_image_id, status")
      .eq("id", listingId)
      .single();
    return data;
  }

  async function readImage(imageId: string) {
    const { data } = await svc
      .from("listing_images")
      .select("deleted_at, is_cover, storage_path")
      .eq("id", imageId)
      .single();
    return data;
  }

  describe("on a draft", () => {
    it("soft-deletes a non-cover image and leaves the cover alone", async () => {
      const [cover, second] = await seedListingWithImages("draft");

      const { error } = await removeAs(owner, second);
      expect(error).toBeNull();

      const removed = await readImage(second);
      expect(removed?.deleted_at).not.toBeNull();

      const listing = await readListing();
      expect(listing?.cover_image_id).toBe(cover);
    });

    // Soft, not hard. The row survives so the storage path stays addressable
    // for the cleanup job that will one day reclaim the object.
    it("keeps the row and its storage path rather than deleting them", async () => {
      const [, second] = await seedListingWithImages("draft");

      await removeAs(owner, second);

      const removed = await readImage(second);
      expect(removed).not.toBeNull();
      expect(removed?.storage_path).toContain("image-1.webp");
    });

    it("promotes the lowest-position survivor when the cover is removed", async () => {
      const [cover, second] = await seedListingWithImages("draft");

      const { data, error } = await removeAs(owner, cover);
      expect(error).toBeNull();

      const listing = await readListing();
      expect(listing?.cover_image_id).toBe(second);
      expect(
        (data as { new_cover_image_id: string | null }).new_cover_image_id,
      ).toBe(second);
    });

    it("moves the is_cover flag with the promotion", async () => {
      const [cover, second] = await seedListingWithImages("draft");

      await removeAs(owner, cover);

      // The removed row must not still claim to be the cover: anything
      // filtering on is_cover without also filtering deleted_at would find two.
      expect((await readImage(cover))?.is_cover).toBe(false);
      expect((await readImage(second))?.is_cover).toBe(true);
    });

    it("nulls the cover when the last image is removed", async () => {
      const ids = await seedListingWithImages("draft");

      for (const id of ids) {
        const { error } = await removeAs(owner, id);
        expect(error).toBeNull();
      }

      const listing = await readListing();
      expect(listing?.cover_image_id).toBeNull();
    });

    it("refuses an image that was already removed", async () => {
      const [, second] = await seedListingWithImages("draft");

      await removeAs(owner, second);
      const { error } = await removeAs(owner, second);

      expect(error?.message).toContain("LISTING_IMAGE_NOT_FOUND");
    });
  });

  /**
   * Remove the cover, then upload a replacement. The sequence that the
   * one-cover-per-listing index from 0021 made dangerous.
   *
   * Promotion moves the cover to the surviving image at position 1. Image
   * registration used to insert a position-0 image with is_cover already true,
   * which then collided with the promoted cover and failed the whole upload
   * with a duplicate key error — a regression introduced by the index, not by
   * the removal. Insertion no longer sets the flag at all; the cover is set in
   * one place that maintains the pointer and the flag together.
   */
  it("allows a replacement upload after the cover was removed", async () => {
    const [cover] = await seedListingWithImages("draft");

    await removeAs(owner, cover);

    const { error } = await svc.from("listing_images").insert({
      is_cover: false,
      listing_id: listingId,
      mime_type: "image/webp",
      position: 0,
      size_bytes: 500,
      storage_path: `listings/${listingId}/replacement.webp`,
    });

    expect(error).toBeNull();

    const { data } = await svc
      .from("listing_images")
      .select("id")
      .eq("listing_id", listingId)
      .eq("is_cover", true)
      .is("deleted_at", null);

    // Exactly one, still. Not zero, and not two.
    expect(data).toHaveLength(1);
  });

  it("works the same on a rejected listing, which is when it is most needed", async () => {
    const [cover, second] = await seedListingWithImages("rejected");

    const { error } = await removeAs(owner, cover);

    expect(error).toBeNull();
    expect((await readListing())?.cover_image_id).toBe(second);
  });

  /**
   * The reason this is a function and not a grant.
   *
   * A column grant would have reached these rows too, because
   * agents_reorder_own_listing_images carries no status predicate.
   */
  it("refuses to remove from an approved listing", async () => {
    const [, second] = await seedListingWithImages("approved");

    const { error } = await removeAs(owner, second);

    expect(error?.message).toContain("LISTING_STATE_TRANSITION_INVALID");
    expect((await readImage(second))?.deleted_at).toBeNull();
  });

  it("refuses another agent's image, and says not found rather than forbidden", async () => {
    const [, second] = await seedListingWithImages("draft");

    const { error } = await removeAs(stranger, second);

    // Not "forbidden": an id belonging to someone else must not confirm that it
    // exists. Same answer the RLS policies give.
    expect(error?.message).toContain("LISTING_IMAGE_NOT_FOUND");
    expect((await readImage(second))?.deleted_at).toBeNull();
  });

  it("refuses an id that does not exist", async () => {
    await seedListingWithImages("draft");

    const { error } = await removeAs(owner, crypto.randomUUID());

    expect(error?.message).toContain("LISTING_IMAGE_NOT_FOUND");
  });

  /**
   * The grant itself, asserted directly.
   *
   * If deleted_at were ever added to the agent update grant this fails, which is
   * the point — the whole design rests on that column staying ungranted.
   */
  it("still refuses a direct write to deleted_at", async () => {
    const [, second] = await seedListingWithImages("draft");

    const { error } = await asUser(await mintFreshToken(owner))
      .from("listing_images")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", second);

    expect(error?.message).toContain("permission denied");
    expect((await readImage(second))?.deleted_at).toBeNull();
  });
});
