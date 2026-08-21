/**
 * Fields a client must not set, on the INSERT path.
 *
 * 0027 closed this on agent_profiles; the audit found the shape was general,
 * because the escalation story is always told about CHANGING a value and
 * nobody checks that the row can arrive already claiming it.
 *
 * Each denial pairs with a control proving the legitimate write still works —
 * a narrowed grant that also breaks the feature is not a fix, and 42501 looks
 * identical either way.
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

suite("INSERT grants", () => {
  let svc: ReturnType<typeof asServiceRole>;
  let seeker: CastMember;
  let approvedListingId: string;
  let someoneElseId: string;
  let chatId: string;

  beforeAll(async () => {
    svc = asServiceRole();
    seeker = getCast().seeker;

    const listing = await svc
      .from("listings")
      .select("id")
      .eq("status", "approved")
      .limit(1)
      .single();
    approvedListingId = listing.data!.id;

    const other = await svc
      .from("users")
      .select("id")
      .neq("id", seeker.userId)
      .limit(1)
      .single();
    someoneElseId = other.data!.id;

    /**
     * A conversation the CAST seeker is actually in.
     *
     * The seeded chat belongs to the seeded student, not to this cast member,
     * so is_chat_participant() would refuse them — and an RLS refusal reports
     * 42501 exactly as a missing column grant does. Asserting the read_at
     * denial against a chat they cannot post to at all would have proved
     * nothing about the grant, which is the same shape as proving a denial by
     * observing an empty result.
     */
    const listingRow = await svc
      .from("listings")
      .select("agent_profile_id")
      .eq("id", approvedListingId)
      .single();

    const chat = await svc
      .from("chats")
      .insert({
        agent_profile_id: listingRow.data!.agent_profile_id,
        listing_id: approvedListingId,
        student_user_id: seeker.userId,
        type: "inspection",
      })
      .select("id")
      .single();

    if (chat.error) throw chat.error;
    chatId = chat.data.id;
  }, 60_000);

  afterAll(async () => {
    await svc.from("listing_views").delete().like("session_id", "PROBE%");
    await svc.from("reports").delete().like("reason", "PROBE%");
    await svc.from("messages").delete().like("body", "PROBE%");

    if (chatId) {
      await svc.from("messages").delete().eq("chat_id", chatId);
      await svc.from("chats").delete().eq("id", chatId);
    }
  }, 60_000);

  describe("listing_views.viewer_user_id — fabricated evidence about a person", () => {
    it("refuses an anonymous caller naming somebody", async () => {
      const { error } = await asAnon().from("listing_views").insert({
        listing_id: approvedListingId,
        session_id: "PROBE-anon-forge",
        viewer_user_id: someoneElseId,
      });

      expect(error?.code).toBe("42501");

      const { count } = await svc
        .from("listing_views")
        .select("id", { count: "exact", head: true })
        .eq("session_id", "PROBE-anon-forge");

      expect(count).toBe(0);
    });

    it("refuses a signed-in caller naming somebody else", async () => {
      const client = asUser(await mintFreshToken(seeker));
      const { error } = await client.from("listing_views").insert({
        listing_id: approvedListingId,
        session_id: "PROBE-user-forge",
        viewer_user_id: someoneElseId,
      });

      expect(error?.code).toBe("42501");
    });

    it("still records an anonymous view, attributed to nobody", async () => {
      const { error } = await asAnon().from("listing_views").insert({
        listing_id: approvedListingId,
        session_id: "PROBE-anon-ok",
      });

      expect(error).toBeNull();

      const { data } = await svc
        .from("listing_views")
        .select("viewer_user_id")
        .eq("session_id", "PROBE-anon-ok")
        .single();

      // The honest record of an anonymous view.
      expect(data?.viewer_user_id).toBeNull();
    });

    it("names the caller, and only the caller, for a signed-in view", async () => {
      const client = asUser(await mintFreshToken(seeker));
      const { error } = await client.from("listing_views").insert({
        listing_id: approvedListingId,
        session_id: "PROBE-user-ok",
      });

      expect(error).toBeNull();

      const { data } = await svc
        .from("listing_views")
        .select("viewer_user_id")
        .eq("session_id", "PROBE-user-ok")
        .single();

      // Supplied by the column default from the caller's own token, not by
      // anything the request said.
      expect(data?.viewer_user_id).toBe(seeker.userId);
    });
  });

  describe("messages.read_at — a receipt the sender writes about the recipient", () => {
    // Unprovable until the seed gained a conversation: is_chat_participant()
    // refused every probe for want of a participant, which is indistinguishable
    // from a refusal for want of a grant. The fixture below is this suite's
    // own version of that participant.
    it("refuses a message that arrives already marked read", async () => {
      const client = asUser(await mintFreshToken(seeker));
      const { error } = await client.from("messages").insert({
        body: "PROBE pre-read",
        chat_id: chatId,
        read_at: new Date().toISOString(),
        sender_user_id: seeker.userId,
      });

      expect(error?.code).toBe("42501");
    });

    it("still sends an ordinary message, arriving unread", async () => {
      const client = asUser(await mintFreshToken(seeker));
      const { error } = await client.from("messages").insert({
        body: "PROBE ordinary message",
        chat_id: chatId,
        sender_user_id: seeker.userId,
      });

      expect(error).toBeNull();

      const { data } = await svc
        .from("messages")
        .select("read_at")
        .eq("body", "PROBE ordinary message")
        .single();

      expect(data?.read_at).toBeNull();
    });
  });

  describe("reports — moderation outcomes the reporter wrote", () => {
    it("refuses a report that arrives already resolved", async () => {
      const client = asUser(await mintFreshToken(seeker));
      const { error } = await client.from("reports").insert({
        reason: "PROBE pre-resolved",
        reporter_user_id: seeker.userId,
        resolution_notes: "PROBE notes written by the reporter",
        resolved_at: new Date().toISOString(),
        status: "resolved",
        target_id: approvedListingId,
        target_type: "listing",
      });

      expect(error?.code).toBe("42501");
    });

    it("refuses a resolution attributed to somebody else", async () => {
      const client = asUser(await mintFreshToken(seeker));
      const { error } = await client.from("reports").insert({
        reason: "PROBE attributed",
        reporter_user_id: seeker.userId,
        resolved_by: someoneElseId,
        target_id: approvedListingId,
        target_type: "listing",
      });

      expect(error?.code).toBe("42501");
    });

    it("still files an ordinary report, open and unresolved", async () => {
      const client = asUser(await mintFreshToken(seeker));
      const { error } = await client.from("reports").insert({
        reason: "PROBE ordinary report",
        reporter_user_id: seeker.userId,
        target_id: approvedListingId,
        target_type: "listing",
      });

      expect(error).toBeNull();

      const { data } = await svc
        .from("reports")
        .select("status, resolution_notes, resolved_by, resolved_at")
        .eq("reason", "PROBE ordinary report")
        .single();

      expect(data?.status).toBe("open");
      expect(data?.resolution_notes).toBeNull();
      expect(data?.resolved_by).toBeNull();
      expect(data?.resolved_at).toBeNull();
    });
  });
});
