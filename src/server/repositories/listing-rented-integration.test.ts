/**
 * `rented` — a listing off the market without being over. Migration 0036.
 *
 * ===========================================================================
 * WHY THIS FILE EXISTS, AND SPECIFICALLY WHY THE PATCH PROBE DOES
 * ===========================================================================
 *
 * Marking a rented listing available again returns it to `approved` with NO
 * MODERATION. That is only legitimate because nothing can have changed while
 * it was off the market — the content a moderator approved is the content that
 * goes back up.
 *
 * That invariant is held by an ABSENCE. `rented` is not in the
 * agents_update_own_listings policy (0021) and not in
 * EDITABLE_LISTING_STATUSES (src/features/listings/editability.ts), so a
 * rented listing is uneditable by precisely the mechanism that makes an
 * approved one uneditable. Nothing anywhere says the word "rented" to make
 * that true; it is true because two lists do not mention it.
 *
 * AN ABSENCE IS INVISIBLE IN REVIEW. Nobody reading either list notices a
 * status that is not in it. So the change that breaks this is not a subtle
 * one — it is somebody adding "rented" to EDITABLE_LISTING_STATUSES next year
 * as an obvious convenience, because agents keep asking to fix a typo while a
 * place is let. That is a one-word diff, it reads as a kindness, and it
 * silently converts "mark available" into a publication of unreviewed content.
 *
 * `refuses every write to a rented listing` below is the only thing in this
 * repository that will object. If you are here because it went red after you
 * widened an editability list: that is the test working. The path for editing
 * a rented listing is submit_listing_revision, which is exercised further
 * down and is deliberately the only one.
 *
 * ===========================================================================
 * HOW A REFUSED WRITE ACTUALLY LOOKS, WHICH IS NOT AS AN ERROR
 * ===========================================================================
 *
 * An UPDATE that no RLS policy admits is NOT an error. PostgREST returns 200
 * and zero affected rows, because "no rows matched" is indistinguishable from
 * a filter that found nothing. A probe asserting `error` is not null would
 * therefore pass against a completely open database.
 *
 * So every content-column assertion here checks two things: that the statement
 * returned no rows, AND that the value in the database is still the old one,
 * read back through service-role. `status` is the exception and fails
 * differently — the column is not granted to `authenticated` at all, so it
 * raises 42501 — which is asserted on its own terms rather than folded in.
 */
import { Client } from "pg";
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

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** A raw connection, because PostgREST does not expose information_schema. */
async function queryColumn(statement: string): Promise<string[]> {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    const result = await client.query<{ value: string }>(statement);
    return result.rows.map((row) => row.value);
  } finally {
    await client.end();
  }
}

/**
 * Two columns `authenticated` holds UPDATE on that the probe deliberately does
 * not attempt, each for a reason that is not "it seemed hard".
 *
 * updated_at carries no content and is overwritten by set_listings_updated_at
 * on the way in, so a write to it proves nothing either way.
 *
 * cover_image_id can only legally hold another image OF THIS LISTING, so
 * attempting it with an arbitrary value tests a foreign key rather than the
 * policy — and BR-MEDIA-006's two triggers, widened to cover 'rented' in 0036,
 * are what actually guard it.
 */
const NOT_PROBED = new Set(["cover_image_id", "updated_at"]);

/**
 * Every OTHER column `authenticated` holds UPDATE on, as patches whose values
 * differ from the fixture's AND are legal against it.
 *
 * PATCHES RATHER THAN SINGLE COLUMNS, and that is not tidiness. The first
 * version of this probe wrote one column at a time and set sublet_months = 4
 * on a fixture whose rental_duration is 'yearly'. That violates
 * listings_sublet_months_matches_duration (0019), so the statement came back
 * as an ERROR — and the probe counted an error as a refusal. When this file
 * was mutation-tested by deliberately widening agents_update_own_listings to
 * admit 'rented', it named 15 breached columns out of 16: sublet_months was
 * wide open and the probe could not see it.
 *
 * So rental_duration and sublet_months are probed as a pair in one statement,
 * where the pairing constraint is satisfied, and the assertion below now
 * treats an error as a PROBE DEFECT rather than as a refusal. A refusal by
 * policy is 200 with zero rows; anything else means this test is not measuring
 * what it claims to.
 */
const CONTENT_PATCHES: Array<{ covers: string[]; patch: Record<string, unknown> }> = [
  { covers: ["amenities"], patch: { amenities: ["parking"] } },
  { covers: ["area"], patch: { area: "Hilltop" } },
  { covers: ["bathrooms"], patch: { bathrooms: 3 } },
  { covers: ["bedrooms"], patch: { bedrooms: 3 } },
  { covers: ["city"], patch: { city: "Enugu" } },
  { covers: ["description"], patch: { description: "Rewritten after approval." } },
  { covers: ["latitude"], patch: { latitude: 6.85 } },
  { covers: ["longitude"], patch: { longitude: 7.4 } },
  { covers: ["price_naira"], patch: { price_naira: 999999 } },
  { covers: ["property_type"], patch: { property_type: "shop" } },
  { covers: ["rental_duration"], patch: { rental_duration: "monthly" } },
  // The pair. Legal against a yearly fixture precisely because both move.
  {
    covers: ["sublet_months"],
    patch: { rental_duration: "sublet", sublet_months: 6 },
  },
  { covers: ["slug"], patch: { slug: "rewritten-after-approval" } },
  { covers: ["state"], patch: { state: "Anambra" } },
  { covers: ["title"], patch: { title: "Rewritten after approval" } },
  { covers: ["video_url"], patch: { video_url: "https://example.invalid/rewritten" } },
];

suite("rented listings", () => {
  let svc: ReturnType<typeof asServiceRole>;
  let owner: CastMember;
  let stranger: CastMember;
  let seeker: CastMember;
  let ownerProfileId = "";
  let createdProfileIds: string[] = [];
  let listingId = "";
  let extraListingIds: string[] = [];

  beforeAll(async () => {
    svc = asServiceRole();
    const cast = getCast();
    owner = cast.owningAgent;
    stranger = cast.otherAgent;
    seeker = cast.seeker;

    const ownerProfile = await ensureProfile(owner.userId, "Rented Owner");
    const strangerProfile = await ensureProfile(stranger.userId, "Rented Stranger");
    ownerProfileId = ownerProfile.id;
    createdProfileIds = [ownerProfile, strangerProfile]
      .filter((profile) => profile.created)
      .map((profile) => profile.id);
  });

  afterAll(async () => {
    await destroyFixture();

    for (const id of extraListingIds) {
      await svc.from("listings").delete().eq("id", id);
    }
    extraListingIds = [];

    for (const id of createdProfileIds) {
      const { error } = await svc.from("agent_profiles").delete().eq("id", id);
      if (error) throw error;
    }
  });

  /** Borrow an existing profile rather than colliding — see 0022's suite. */
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
   * Teardown past BR-MEDIA-006, which 0036 widened.
   *
   * The cover cannot be cleared while the listing is approved OR rented, and
   * the status cannot come down once archived. Demoting to draft first
   * satisfies both, and is now needed for one more status than it used to be —
   * which is exactly the sort of thing that only shows up in a teardown.
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

    // chats and inspection_requests reference EACH OTHER, so neither can be
    // deleted first. Breaking the cycle by nulling chat_id is the same dance
    // the seeker inspection suite does — and the reason the first version of
    // this teardown failed is that it skipped the dance, so the
    // inspection_requests delete errored, the error was swallowed, and the
    // damage surfaced two statements later as a foreign key violation on the
    // LISTING. Every step below is checked for that reason.
    const unlink = await svc
      .from("inspection_requests")
      .update({ chat_id: null })
      .eq("listing_id", toDelete);
    if (unlink.error) throw unlink.error;

    const messages = await svc
      .from("messages")
      .delete()
      .in(
        "chat_id",
        ((
          await svc.from("chats").select("id").eq("listing_id", toDelete)
        ).data ?? []).map((chat) => chat.id),
      );
    if (messages.error) throw messages.error;

    const chats = await svc.from("chats").delete().eq("listing_id", toDelete);
    if (chats.error) throw chats.error;

    const requests = await svc
      .from("inspection_requests")
      .delete()
      .eq("listing_id", toDelete);
    if (requests.error) throw requests.error;

    const revisions = await svc
      .from("listing_revisions")
      .delete()
      .eq("listing_id", toDelete);
    if (revisions.error) throw revisions.error;

    const images = await svc.from("listing_images").delete().eq("listing_id", toDelete);
    if (images.error) throw images.error;

    const listing = await svc.from("listings").delete().eq("id", toDelete);
    if (listing.error) throw listing.error;
  }

  async function seedListing(
    status: "approved" | "draft" | "flagged" | "archived",
    overrides: Record<string, unknown> = {},
  ) {
    await destroyFixture();

    const { data: listing, error } = await svc
      .from("listings")
      .insert({
        agent_profile_id: ownerProfileId,
        area: "Odenigbo",
        bathrooms: 1,
        bedrooms: 1,
        description: "Rented fixture.",
        price_naira: 250000,
        property_type: "1_bedroom",
        rental_duration: "yearly",
        slug: `rented-${crypto.randomUUID().slice(0, 8)}`,
        status: "draft",
        title: "Rented fixture",
        ...overrides,
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

    await svc.from("listings").update({ cover_image_id: image.id }).eq("id", listingId);

    if (status !== "draft") {
      // approved_at is stamped here because the round-trip test asserts it
      // survives, and a null would make that assertion vacuous.
      const { error: statusError } = await svc
        .from("listings")
        .update({ approved_at: new Date().toISOString(), status })
        .eq("id", listingId);
      if (statusError) throw statusError;
    }

    return listingId;
  }

  async function markRentedAs(member: CastMember, target: string) {
    return asUser(await mintFreshToken(member))
      .rpc("mark_own_listing_rented", { target_listing_id: target })
      .single();
  }

  async function markAvailableAs(member: CastMember, target: string) {
    return asUser(await mintFreshToken(member))
      .rpc("mark_own_listing_available", { target_listing_id: target })
      .single();
  }

  async function readListing() {
    const { data } = await svc
      .from("listings")
      .select("status, rented_at, approved_at, archived_at, title, price_naira")
      .eq("id", listingId)
      .single();
    return data;
  }

  // ======================================================================
  // The transitions
  // ======================================================================

  it("takes an approved listing off the market and stamps rented_at", async () => {
    await seedListing("approved");

    const { error } = await markRentedAs(owner, listingId);
    expect(error).toBeNull();

    const listing = await readListing();
    expect(listing?.status).toBe("rented");
    expect(listing?.rented_at).not.toBeNull();
  });

  /**
   * The whole reason this status exists. Archived costs a submission slot to
   * undo because it cannot be undone at all; this round trip must be free and
   * must leave the listing indistinguishable from one that never left.
   */
  it("puts it back on the market, keeping the original approval instant", async () => {
    await seedListing("approved");
    const before = await readListing();

    await markRentedAs(owner, listingId);
    const { error } = await markAvailableAs(owner, listingId);
    expect(error).toBeNull();

    const after = await readListing();
    expect(after?.status).toBe("approved");
    // Cleared, because it names the CURRENT let and there is no longer one.
    expect(after?.rented_at).toBeNull();
    // NOT restamped. approved_at records when a moderator approved this
    // content, and no moderator did anything here. The dashboard activity feed
    // orders on it, so restamping would announce an approval that never
    // happened — and would do it every letting season.
    expect(after?.approved_at).toBe(before?.approved_at);
  });

  it("refuses a draft, which was never on the market", async () => {
    await seedListing("draft");

    const { error } = await markRentedAs(owner, listingId);

    expect(error?.message).toContain("LISTING_STATE_TRANSITION_INVALID");
    expect((await readListing())?.status).toBe("draft");
  });

  /**
   * Same reasoning archive_own_listing records: a listing under investigation
   * must not be movable by the agent being investigated.
   */
  it("refuses a flagged listing", async () => {
    await seedListing("flagged");

    const { error } = await markRentedAs(owner, listingId);

    expect(error?.message).toContain("LISTING_STATE_TRANSITION_INVALID");
    expect((await readListing())?.status).toBe("flagged");
  });

  it("refuses another agent's listing, and says not found rather than forbidden", async () => {
    await seedListing("approved");

    const { error } = await markRentedAs(stranger, listingId);

    expect(error?.message).toContain("LISTING_NOT_FOUND");
    expect((await readListing())?.status).toBe("approved");
  });

  /**
   * Archived is terminal, and this asserts the FUNCTION says so — the caller
   * gets a state-transition error they can read, not a raw trigger violation.
   * That the trigger would also refuse it is 0022's suite's business.
   */
  it("refuses to bring an archived listing back", async () => {
    await seedListing("archived");

    const { error } = await markAvailableAs(owner, listingId);

    expect(error?.message).toContain("LISTING_STATE_TRANSITION_INVALID");
    expect((await readListing())?.status).toBe("archived");
  });

  it("refuses to mark an already-rented listing rented again", async () => {
    await seedListing("approved");
    await markRentedAs(owner, listingId);

    const { error } = await markRentedAs(owner, listingId);

    expect(error?.message).toContain("LISTING_STATE_TRANSITION_INVALID");
  });

  // ======================================================================
  // The probe. Read the header of this file before changing anything here.
  // ======================================================================

  describe("a rented listing is not a workspace object", () => {
    /**
     * Guards the probe itself, by asking the database what it granted rather
     * than trusting a list somebody typed.
     *
     * Without this the probe silently narrows: a column granted to
     * `authenticated` in some later migration is a column the next test never
     * attempts, so the hole and the green tick coexist. That is the exact
     * shape of failure this codebase keeps finding — a check that cannot fail
     * the way production fails.
     */
    it("covers every column authenticated may write", async () => {
      const granted = await queryColumn(`
        select column_name as value
        from information_schema.column_privileges
        where table_schema = 'public'
          and table_name = 'listings'
          and grantee = 'authenticated'
          and privilege_type = 'UPDATE'
      `);

      const probed = new Set(CONTENT_PATCHES.flatMap((entry) => entry.covers));
      const unprobed = granted
        .filter((column) => !NOT_PROBED.has(column) && !probed.has(column))
        .sort();

      // Named, not counted: a failure here should say which column opened.
      expect(unprobed).toEqual([]);

      // And the other direction — a column dropped from the schema but left in
      // CONTENT_PATCHES would make the probe attempt a write that fails for an
      // irrelevant reason and read as a refusal.
      const stale = [...probed].filter((column) => !granted.includes(column)).sort();
      expect(stale).toEqual([]);
    });

    it("refuses every write to a rented listing", async () => {
      await seedListing("approved");
      await markRentedAs(owner, listingId);

      const token = await mintFreshToken(owner);
      const agent = asUser(token);

      const accepted: string[] = [];
      const errored: string[] = [];

      for (const { covers, patch } of CONTENT_PATCHES) {
        const { data, error } = await agent
          .from("listings")
          .update(patch)
          .eq("id", listingId)
          .select("id");

        if (error) {
          // NOT a refusal. A policy declining a row is 200 with zero rows; an
          // error means the statement never reached the policy — a constraint,
          // a bad value, a missing grant. Counting it as a pass is how
          // sublet_months hid. See CONTENT_PATCHES.
          errored.push(`${covers.join("+")}: ${error.code} ${error.message}`);
          continue;
        }

        if (data && data.length > 0) {
          accepted.push(...covers);
        }
      }

      // Named rather than counted, so a failure says WHICH column opened.
      expect(accepted).toEqual([]);
      expect(errored).toEqual([]);

      // The second half, and the one that would catch a policy that matched
      // the row but wrote nothing: the values are still the fixture's.
      const listing = await readListing();
      expect(listing?.title).toBe("Rented fixture");
      expect(listing?.price_naira).toBe(250000);
      expect(listing?.status).toBe("rented");
    });

    /**
     * status fails differently and is asserted differently: it is not granted
     * to `authenticated` on any row in any state, so this is 42501 at the
     * column level rather than a policy declining to match.
     *
     * Without this, an agent could put their own listing back on the market by
     * writing the column directly — which is the same transition
     * mark_own_listing_available performs, so it would not even be an
     * escalation. It matters because the FUNCTION is where the state machine
     * lives: direct writes would also reach 'approved' from 'flagged'.
     */
    it("refuses a direct status write back to approved", async () => {
      await seedListing("approved");
      await markRentedAs(owner, listingId);

      const { error } = await asUser(await mintFreshToken(owner))
        .from("listings")
        .update({ status: "approved" })
        .eq("id", listingId);

      expect(error).not.toBeNull();
      expect(error?.code).toBe("42501");
      expect((await readListing())?.status).toBe("rented");
    });
  });

  // ======================================================================
  // The one editing path that stays open
  // ======================================================================

  it("accepts a revision on a rented listing, and leaves it rented", async () => {
    await seedListing("approved");
    await markRentedAs(owner, listingId);

    const { error } = await asUser(await mintFreshToken(owner))
      .rpc("submit_listing_revision", {
        new_amenities: [],
        new_description: "Corrected while off the market.",
        new_price_naira: 260000,
        new_rental_duration: "yearly",
        new_sublet_months: null,
        new_title: "Corrected title",
        target_listing_id: listingId,
      })
      .single();

    expect(error).toBeNull();

    // The proposal is queued; the listing is untouched and still off-market.
    const listing = await readListing();
    expect(listing?.status).toBe("rented");
    expect(listing?.title).toBe("Rented fixture");
  });

  // ======================================================================
  // What a rented listing stops doing, and what it keeps doing
  // ======================================================================

  it("cannot be inspected, because it is not in the feed", async () => {
    await seedListing("approved");
    await markRentedAs(owner, listingId);

    const { error } = await asUser(await mintFreshToken(seeker))
      .rpc("create_inspection_request_with_chat", {
        request_message: "Is this still going?",
        target_listing_id: listingId,
      })
      .single();

    expect(error?.message).toContain("LISTING_NOT_FOUND");
  });

  /**
   * The seeker with an accepted inspection may well be the person who rented
   * it. Taking the listing off the market must not take their chat with it.
   */
  it("leaves an inspection accepted before it went off the market alone", async () => {
    await seedListing("approved");

    const created = await asUser(await mintFreshToken(seeker))
      .rpc("create_inspection_request_with_chat", {
        request_message: "Can I see it?",
        target_listing_id: listingId,
      })
      .single();
    expect(created.error).toBeNull();

    const requestId = (created.data as { inspection_request_id: string })
      .inspection_request_id;

    await markRentedAs(owner, listingId);

    const { data, error } = await asUser(await mintFreshToken(seeker))
      .from("inspection_requests")
      .select("id, status")
      .eq("id", requestId)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.id).toBe(requestId);
  });

  /**
   * A rented property is coming back, so its identity is not free. The refusal
   * has to land here, at submission — the alternative is that it lands weeks
   * later on the agent marking the original available again, for a reason
   * produced by a submission they have long forgotten.
   */
  it("keeps holding its property's duplicate fingerprint", async () => {
    const fingerprint = `rented-fp-${crypto.randomUUID().slice(0, 8)}`;
    await seedListing("approved", { duplicate_fingerprint: fingerprint });
    await markRentedAs(owner, listingId);

    const { data, error } = await svc
      .from("listings")
      .insert({
        agent_profile_id: ownerProfileId,
        area: "Odenigbo",
        bathrooms: 1,
        bedrooms: 1,
        description: "The same property, listed twice.",
        duplicate_fingerprint: fingerprint,
        price_naira: 250000,
        property_type: "1_bedroom",
        rental_duration: "yearly",
        slug: `rented-dup-${crypto.randomUUID().slice(0, 8)}`,
        status: "pending_review",
        title: "The same property, listed twice",
      })
      .select("id")
      .single();

    if (data?.id) extraListingIds.push(data.id);

    expect(error?.code).toBe("23505");
    expect(error?.message).toContain("listings_duplicate_fingerprint_active_idx");
  });

  // ======================================================================
  // What a seeker holding the link sees
  // ======================================================================

  describe("honest absence", () => {
    it("hides a rented listing from anonymous readers entirely", async () => {
      await seedListing("approved");
      await markRentedAs(owner, listingId);

      const { data } = await asAnon()
        .from("listings")
        .select("id")
        .eq("id", listingId);

      expect(data).toEqual([]);

      // The control read, without which "no rows" proves nothing: the row is
      // there, and it is being withheld.
      const control = await svc.from("listings").select("id").eq("id", listingId);
      expect(control.data?.length).toBe(1);
    });

    it("tells an anonymous seeker why, and the least that identifies it", async () => {
      await seedListing("approved");
      await markRentedAs(owner, listingId);

      const { data: listing } = await svc
        .from("listings")
        .select("public_uuid")
        .eq("id", listingId)
        .single();

      const { data, error } = await asAnon()
        .rpc("listing_absence_notice", {
          target_public_uuid: listing!.public_uuid,
        })
        .single();

      expect(error).toBeNull();
      expect(data).toMatchObject({
        absence_status: "rented",
        area: "Odenigbo",
        city: "Nsukka",
        title: "Rented fixture",
      });
      // Four columns and no more. A tombstone that kept serving the price and
      // the description would be republishing an offer nobody stands behind —
      // most obviously for an archived listing removed BECAUSE it was wrong.
      expect(Object.keys(data as object).sort()).toEqual([
        "absence_status",
        "area",
        "city",
        "title",
      ]);
    });

    it("distinguishes removed from taken, because they are different news", async () => {
      await seedListing("archived");

      const { data: listing } = await svc
        .from("listings")
        .select("public_uuid")
        .eq("id", listingId)
        .single();

      const { data } = await asAnon()
        .rpc("listing_absence_notice", {
          target_public_uuid: listing!.public_uuid,
        })
        .single();

      expect((data as { absence_status: string }).absence_status).toBe("archived");
    });

    /**
     * A draft has never been public, so its existence is not a fact a stranger
     * is entitled to. This is the boundary that keeps the tombstone from
     * becoming an enumeration oracle over unpublished inventory.
     */
    it("says nothing about a draft", async () => {
      await seedListing("draft");

      const { data: listing } = await svc
        .from("listings")
        .select("public_uuid")
        .eq("id", listingId)
        .single();

      const { data } = await asAnon().rpc("listing_absence_notice", {
        target_public_uuid: listing!.public_uuid,
      });

      expect(data).toEqual([]);
    });

    it("says nothing about a listing that is still live", async () => {
      await seedListing("approved");

      const { data: listing } = await svc
        .from("listings")
        .select("public_uuid")
        .eq("id", listingId)
        .single();

      const { data } = await asAnon().rpc("listing_absence_notice", {
        target_public_uuid: listing!.public_uuid,
      });

      expect(data).toEqual([]);
    });
  });
});
