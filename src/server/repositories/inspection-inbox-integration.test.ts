/**
 * The inspection inbox, against a real database.
 *
 * Two things here are worth a real Postgres rather than a unit test.
 *
 * THE RE-REQUEST DEFECT. findActiveInspectionRequest filtered
 * `status in ('requested','accepted')` with no deadline check, so a request an
 * agent simply ignored past 48 hours blocked that seeker from ever asking about
 * that listing again — permanently, as a consequence of the agent doing
 * nothing. The rule now lives in features/inspections/expiry and the unit tests
 * there cover it exhaustively; what THIS proves is that the repository actually
 * consults it, with a genuinely stale row on disk rather than an object literal.
 *
 * READ RECEIPTS (migration 0024). messages.read_at had no UPDATE grant at all,
 * so the unread count the inbox shows would have been a badge that never
 * cleared. The grant is one column wide and the policy turns on who sent the
 * message, and neither of those is observable from TypeScript.
 *
 * Every denial below is paired with a service-role control proving the row is
 * there and is being withheld — a refused UPDATE under RLS reports zero rows
 * affected, which is indistinguishable from a filter that matched nothing.
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
import { findActiveInspectionRequest } from "@/server/repositories/inspection-repository";

const suite = rlsIntegrationEnabled() ? describe : describe.skip;

const HOUR = 60 * 60 * 1000;

suite("inspection inbox", () => {
  let svc: ReturnType<typeof asServiceRole>;
  let agent: CastMember;
  let seeker: CastMember;
  let outsider: CastMember;
  let agentProfileId = "";
  let createdProfileIds: string[] = [];
  let listingId = "";
  let chatId = "";
  let expiredRequestId = "";
  let liveRequestId = "";
  const originalNames = new Map<string, string | null>();
  let seekerMessageId = "";
  let agentMessageId = "";

  beforeAll(async () => {
    svc = asServiceRole();
    const cast = getCast();
    agent = cast.owningAgent;
    seeker = cast.seeker;
    outsider = cast.otherSeeker;

    const profile = await ensureProfile(agent.userId, "Inbox Agent");
    agentProfileId = profile.id;
    createdProfileIds = profile.created ? [profile.id] : [];

    listingId = await createListing();

    // The stale one. Requested two days ago with a deadline that has passed and
    // a status column that still, correctly, says 'requested' — nothing
    // rewrites it, because expiry is evaluated on read.
    expiredRequestId = await createRequest({
      expiresAt: new Date(Date.now() - 5 * HOUR).toISOString(),
      requestedAt: new Date(Date.now() - 53 * HOUR).toISOString(),
    });

    chatId = await createChat();
    await seedMessages();

    // The shared cast carries no full_name, and the disclosure tests are about
    // whether a NAME crosses the boundary — a null one proves nothing either
    // way. Set here rather than in the shared fixture because this is the only
    // suite that needs it, and restored in teardown because the cast belongs to
    // the whole run.
    await nameUser(seeker.userId, "Inbox Seeker");
    await nameUser(outsider.userId, "Inbox Outsider");
  });

  afterAll(async () => {
    await teardown();
  });

  describe("a request the agent ignored past its deadline", () => {
    it("still says 'requested' in the column", async () => {
      // The control for everything below. If the status had been rewritten by
      // something, the next test would pass for the wrong reason.
      const { data, error } = await svc
        .from("inspection_requests")
        .select("status, expires_at")
        .eq("id", expiredRequestId)
        .single();

      if (error) throw error;

      expect(data.status).toBe("requested");
      expect(new Date(data.expires_at).getTime()).toBeLessThan(Date.now());
    });

    it("no longer blocks the seeker asking about that listing again", async () => {
      const active = await findActiveInspectionRequest(
        svc,
        listingId,
        seeker.userId,
      );

      expect(active).toBeNull();
    });

    it("blocks again the moment a fresh request exists", async () => {
      // The positive control. Without it, "returns null" is equally consistent
      // with the query being broken, the ids being wrong, or the listing not
      // existing — and the fix would look correct while blocking nothing ever.
      liveRequestId = await createRequest({
        expiresAt: new Date(Date.now() + 40 * HOUR).toISOString(),
        requestedAt: new Date().toISOString(),
      });

      const active = await findActiveInspectionRequest(
        svc,
        listingId,
        seeker.userId,
      );

      expect(active?.id).toBe(liveRequestId);
    });
  });

  describe("marking a message read", () => {
    it("lets the recipient mark what the other party sent", async () => {
      const client = asUser(await mintFreshToken(agent));

      const { error } = await client
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("id", seekerMessageId);

      if (error) throw error;

      const { data } = await svc
        .from("messages")
        .select("read_at")
        .eq("id", seekerMessageId)
        .single();

      expect(data?.read_at).not.toBeNull();
    });

    it("refuses to let a sender mark their own message read", async () => {
      // Otherwise either party could silently clear a badge the other had never
      // looked at, which is the failure mode that makes an unread count stop
      // meaning anything.
      const client = asUser(await mintFreshToken(agent));

      await client
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("id", agentMessageId);

      const { data } = await svc
        .from("messages")
        .select("read_at")
        .eq("id", agentMessageId)
        .single();

      expect(data?.read_at).toBeNull();
    });

    it("refuses somebody who is not in the conversation", async () => {
      const client = asUser(await mintFreshToken(outsider));

      await client
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("id", agentMessageId);

      const { data } = await svc
        .from("messages")
        .select("read_at")
        .eq("id", agentMessageId)
        .single();

      expect(data?.read_at).toBeNull();
    });

    it("refuses to let the recipient edit what was actually said", async () => {
      // The grant is one column wide. A policy allowing UPDATE on this row
      // would, without the column grant, let a recipient rewrite the message
      // they are marking read — and this is a trust product.
      const client = asUser(await mintFreshToken(agent));
      const { error } = await client
        .from("messages")
        .update({ body: "tampered" })
        .eq("id", seekerMessageId);

      expect(error).not.toBeNull();

      const { data } = await svc
        .from("messages")
        .select("body")
        .eq("id", seekerMessageId)
        .single();

      expect(data?.body).toBe("Is this still available?");
    });
  });

  describe("counterparty_display_names", () => {
    it("gives the agent the name of a seeker who asked about their listing", async () => {
      const client = asUser(await mintFreshToken(agent));
      const { data, error } = await client.rpc("counterparty_display_names", {
        user_ids: [seeker.userId],
      });

      if (error) throw error;

      expect(data?.[0]?.user_id).toBe(seeker.userId);
      expect(data?.[0]?.full_name).toBeTruthy();
    });

    it("gives an agent nothing about a stranger", async () => {
      // The whole justification for a function instead of a policy is that the
      // disclosure is bounded. Unbounded, it would be a directory of every user
      // in the system, readable by anyone who registered as an agent.
      const client = asUser(await mintFreshToken(agent));
      const { data, error } = await client.rpc("counterparty_display_names", {
        user_ids: [outsider.userId],
      });

      if (error) throw error;
      expect(data ?? []).toHaveLength(0);

      // Paired control: the row exists and has a name. Without this, an empty
      // result is equally consistent with the fixture being wrong.
      const { data: control } = await svc
        .from("users")
        .select("full_name")
        .eq("id", outsider.userId)
        .single();
      expect(control?.full_name).toBeTruthy();
    });

    it("still discloses nothing but the name", async () => {
      // users.email and users.phone_number are column-granted to authenticated,
      // which is exactly why this is a function with a two-column select list
      // and not a policy on the table. If somebody later widens that select
      // list, this fails.
      const client = asUser(await mintFreshToken(agent));
      const { data } = await client.rpc("counterparty_display_names", {
        user_ids: [seeker.userId],
      });

      expect(Object.keys(data?.[0] ?? {}).sort()).toEqual([
        "full_name",
        "user_id",
      ]);
    });

    it("leaves the users table itself unreadable", async () => {
      // The row policy is untouched. An agent who can see a name must still not
      // be able to read the row it came from.
      const client = asUser(await mintFreshToken(agent));
      const { data } = await client
        .from("users")
        .select("id, email, phone_number")
        .eq("id", seeker.userId);

      expect(data ?? []).toHaveLength(0);

      const { data: control } = await svc
        .from("users")
        .select("email")
        .eq("id", seeker.userId)
        .single();
      expect(control?.email).toBeTruthy();
    });
  });

  async function nameUser(userId: string, name: string) {
    const { data, error } = await svc
      .from("users")
      .select("full_name")
      .eq("id", userId)
      .single();
    if (error) throw error;

    originalNames.set(userId, data.full_name);

    const { error: updateError } = await svc
      .from("users")
      .update({ full_name: name })
      .eq("id", userId);
    if (updateError) throw updateError;
  }

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
   * An APPROVED listing, built the long way round.
   *
   * Inserting one directly with status 'approved' is refused by BR-MEDIA-006:
   * an approved listing must have a cover image, and the trigger does not care
   * that this is a fixture. So it goes in as a draft, gets an image, gets that
   * image as its cover, and only then rises to approved — which is the order
   * the application uses too.
   *
   * Approved rather than draft because that is the only state a seeker can
   * request an inspection from, and a fixture in an impossible state proves
   * things about a database this application never produces.
   */
  async function createListing() {
    const { data, error } = await svc
      .from("listings")
      .insert({
        agent_profile_id: agentProfileId,
        area: "Inbox Area",
        bathrooms: 1,
        bedrooms: 1,
        description: "Fixture listing for the inspection inbox suite.",
        price_naira: 500000,
        property_type: "self_contain",
        rental_duration: "yearly",
        slug: `inbox-fixture-${Date.now()}`,
        title: "Inbox fixture listing",
      })
      .select("id")
      .single();
    if (error) throw error;

    const { data: image, error: imageError } = await svc
      .from("listing_images")
      .insert({
        is_cover: true,
        listing_id: data.id,
        mime_type: "image/webp",
        position: 0,
        size_bytes: 1024,
        storage_path: listingImagePath(data.id),
      })
      .select("id")
      .single();
    if (imageError) throw imageError;

    const { error: coverError } = await svc
      .from("listings")
      .update({ cover_image_id: image.id })
      .eq("id", data.id);
    if (coverError) throw coverError;

    const { error: statusError } = await svc
      .from("listings")
      .update({ status: "approved" })
      .eq("id", data.id);
    if (statusError) throw statusError;

    return data.id;
  }

  async function createRequest(input: {
    expiresAt: string;
    requestedAt: string;
  }) {
    const { data, error } = await svc
      .from("inspection_requests")
      .insert({
        agent_profile_id: agentProfileId,
        expires_at: input.expiresAt,
        listing_id: listingId,
        message: "Fixture request.",
        requested_at: input.requestedAt,
        requester_user_id: seeker.userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    return data.id;
  }

  async function createChat() {
    const { data, error } = await svc
      .from("chats")
      .insert({
        agent_profile_id: agentProfileId,
        listing_id: listingId,
        student_user_id: seeker.userId,
        type: "inspection",
      })
      .select("id")
      .single();
    if (error) throw error;

    return data.id;
  }

  async function seedMessages() {
    const { data, error } = await svc
      .from("messages")
      .insert([
        {
          body: "Is this still available?",
          chat_id: chatId,
          sender_user_id: seeker.userId,
        },
        {
          body: "Yes, when would you like to see it?",
          chat_id: chatId,
          sender_user_id: agent.userId,
        },
      ])
      .select("id, sender_user_id");
    if (error) throw error;

    seekerMessageId = data.find((row) => row.sender_user_id === seeker.userId)!.id;
    agentMessageId = data.find((row) => row.sender_user_id === agent.userId)!.id;
  }

  /**
   * Ordered by the constraints, and every step checked.
   *
   * A suite that leaves an agent_profiles row behind breaks the next suite that
   * needs one for the same agent — user_id is UNIQUE — and an unchecked failure
   * here is how that leak goes unnoticed until it surfaces somewhere else as a
   * pile of skipped tests.
   */
  async function teardown() {
    const steps: Array<[string, string, () => PromiseLike<{ error: unknown }>]> = [
      ["messages", chatId, () => svc.from("messages").delete().eq("chat_id", chatId)],
      // The chats.inspection_request_id backlink is UNIQUE and points the wrong
      // way for cascade, so the chat goes before the requests.
      ["chats", chatId, () => svc.from("chats").delete().eq("id", chatId)],
      [
        "inspection_requests",
        listingId,
        () => svc.from("inspection_requests").delete().eq("listing_id", listingId),
      ],
      // Status first. An APPROVED listing cannot have its cover_image_id
      // nulled — the deferred trigger refuses it — so the listing has to come
      // back down to draft before its images can go.
      [
        "listing status",
        listingId,
        () => svc.from("listings").update({ status: "draft" }).eq("id", listingId),
      ],
      [
        "cover",
        listingId,
        () => svc.from("listings").update({ cover_image_id: null }).eq("id", listingId),
      ],
      [
        "listing_images",
        listingId,
        () => svc.from("listing_images").delete().eq("listing_id", listingId),
      ],
      ["listings", listingId, () => svc.from("listings").delete().eq("id", listingId)],
    ];

    for (const [label, id, step] of steps) {
      // Setup can fail partway, and then these ids are empty strings. Deleting
      // by "" is not a no-op — Postgres refuses it as an invalid uuid, and the
      // resulting teardown error buries the setup error that actually caused
      // it. Skipping what was never created keeps the first failure legible.
      if (!id) continue;

      const { error } = await step();
      if (error) throw new Error(`teardown ${label}: ${JSON.stringify(error)}`);
    }

    for (const [userId, name] of originalNames) {
      const { error } = await svc
        .from("users")
        .update({ full_name: name })
        .eq("id", userId);
      if (error) throw error;
    }

    for (const id of createdProfileIds) {
      const { error } = await svc.from("agent_profiles").delete().eq("id", id);
      if (error) throw error;
    }
  }
});
