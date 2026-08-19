/**
 * RLS group 1: chats and messages.
 *
 * Every denial assertion is paired with a service-role control read proving
 * the withheld row exists. A read denial returns HTTP 200 with an empty array,
 * so "no rows" on its own is equally consistent with a policy that denies
 * everything, a filter typo, or the row never having been inserted. Only the
 * control distinguishes a working policy from a broken one.
 *
 * Tokens are minted per request, never reused across assertions: they live 60
 * seconds and an expired token produces the same empty result as a denial.
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

suite("RLS: chats and messages", () => {
  // Built in a hook, not in the suite body.
  //
  // Vitest evaluates a describe body during collection even when the suite is
  // skipped, so constructing a client here throws on a missing environment
  // variable before the skip can take effect. That is how a missing credential
  // became a collection failure instead of the skip this suite asks for.
  // beforeAll does not run for a skipped suite, so the gate above holds.
  let svc: ReturnType<typeof asServiceRole>;

  beforeAll(() => {
    svc = asServiceRole();
  });

  let seeker: CastMember;
  let agent: CastMember;
  let outsider: CastMember;

  let agentProfileId: string;
  let listingId: string;
  let chatId: string;
  let seekerMessageId: string;

  beforeAll(async () => {
    // Identities from the shared cast; the outsider is a second ordinary user,
    // not an agent, so "not a participant" is what the denials actually prove.
    const cast = getCast();
    seeker = cast.seeker;
    agent = cast.owningAgent;
    outsider = cast.otherSeeker;

    const { data: profile, error: profileError } = await svc
      .from("agent_profiles")
      .insert({ display_name: "RLS Chat Agent", user_id: agent.userId })
      .select("id")
      .single();
    if (profileError) throw profileError;
    agentProfileId = profile.id;

    const { data: listing, error: listingError } = await svc
      .from("listings")
      .insert({
        agent_profile_id: agentProfileId,
        area: "Odenigbo",
        bathrooms: 1,
        bedrooms: 1,
        description: "RLS fixture listing.",
        price_naira: 250000,
        property_type: "self_contain",
        slug: `rls-chat-fixture-${Date.now()}`,
        // draft, not approved: BR-MEDIA-006 now requires an approved
        // listing to have a cover image, and nothing here depends on
        // the status.
        status: "draft",
        title: "RLS chat fixture",
      })
      .select("id")
      .single();
    if (listingError) throw listingError;
    listingId = listing.id;

    const { data: chat, error: chatError } = await svc
      .from("chats")
      .insert({
        agent_profile_id: agentProfileId,
        listing_id: listingId,
        student_user_id: seeker.userId,
        type: "inspection",
      })
      .select("id")
      .single();
    if (chatError) throw chatError;
    chatId = chat.id;

    const { data: message, error: messageError } = await svc
      .from("messages")
      .insert({
        body: "Private message between the two participants.",
        chat_id: chatId,
        sender_user_id: seeker.userId,
      })
      .select("id")
      .single();
    if (messageError) throw messageError;
    seekerMessageId = message.id;
  });

  afterAll(async () => {
    if (chatId) {
      await svc.from("messages").delete().eq("chat_id", chatId);
      await svc.from("chats").delete().eq("id", chatId);
    }
    if (listingId) await svc.from("listings").delete().eq("id", listingId);
    // Domain data only; the cast outlives this suite. agent_profiles.user_id is
    // UNIQUE, so a leftover profile breaks the next suite that needs one.
    if (agentProfileId) await svc.from("agent_profiles").delete().eq("id", agentProfileId);
  });

  describe("control: the fixture exists", () => {
    it("service role sees the chat and the message", async () => {
      const { data: chats } = await svc.from("chats").select("id").eq("id", chatId);
      const { data: messages } = await svc
        .from("messages")
        .select("id")
        .eq("chat_id", chatId);

      expect(chats).toHaveLength(1);
      expect(messages).toHaveLength(1);
    });
  });

  describe("access", () => {
    it("the seeker participant reads their own chat", async () => {
      const { data, error } = await asUser(await mintFreshToken(seeker))
        .from("chats")
        .select("id, student_user_id")
        .eq("id", chatId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0].id).toBe(chatId);
    });

    it("the agent participant reads the same chat", async () => {
      const { data, error } = await asUser(await mintFreshToken(agent))
        .from("chats")
        .select("id")
        .eq("id", chatId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("a participant reads the messages in it", async () => {
      const { data, error } = await asUser(await mintFreshToken(seeker))
        .from("messages")
        .select("id, body")
        .eq("chat_id", chatId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0].id).toBe(seekerMessageId);
    });
  });

  describe("denial", () => {
    it("user B cannot read user A's chat", async () => {
      const { data, error } = await asUser(await mintFreshToken(outsider))
        .from("chats")
        .select("id")
        .eq("id", chatId);

      expect(error).toBeNull();
      expect(data).toEqual([]);

      // Control: the row is present and is being withheld, not absent.
      const { data: control } = await svc.from("chats").select("id").eq("id", chatId);
      expect(control).toHaveLength(1);
    });

    it("user B cannot read the messages in that chat", async () => {
      const { data, error } = await asUser(await mintFreshToken(outsider))
        .from("messages")
        .select("id, body")
        .eq("chat_id", chatId);

      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: control } = await svc
        .from("messages")
        .select("id")
        .eq("chat_id", chatId);
      expect(control).toHaveLength(1);
    });

    it("user B cannot reach the message even by its primary key", async () => {
      const { data } = await asUser(await mintFreshToken(outsider))
        .from("messages")
        .select("id")
        .eq("id", seekerMessageId);

      expect(data).toEqual([]);
    });

    it("an unauthenticated caller sees no chats or messages", async () => {
      const anon = asAnon();
      const { data: chats } = await anon.from("chats").select("id").eq("id", chatId);
      const { data: messages } = await anon
        .from("messages")
        .select("id")
        .eq("chat_id", chatId);

      expect(chats ?? []).toEqual([]);
      expect(messages ?? []).toEqual([]);
    });

    it("user B cannot inject a message into a chat they are not in", async () => {
      const { error } = await asUser(await mintFreshToken(outsider))
        .from("messages")
        .insert({
          body: "I should not be able to post here.",
          chat_id: chatId,
          sender_user_id: outsider.userId,
        });

      expect(error).not.toBeNull();

      const { data: control } = await svc
        .from("messages")
        .select("id")
        .eq("chat_id", chatId);
      expect(control).toHaveLength(1);
    });

    it("a participant cannot post as the other party", async () => {
      const { error } = await asUser(await mintFreshToken(agent))
        .from("messages")
        .insert({
          body: "Posted while impersonating the seeker.",
          chat_id: chatId,
          sender_user_id: seeker.userId,
        });

      expect(error).not.toBeNull();
    });

    it("messages cannot be edited after sending, even by their sender", async () => {
      await asUser(await mintFreshToken(seeker))
        .from("messages")
        .update({ body: "edited" })
        .eq("id", seekerMessageId);

      // Asserting on content, not on the error object. A denied UPDATE that
      // matches no rows returns 200 with an empty result rather than an error,
      // so the stored value is the only trustworthy signal.
      const { data: control } = await svc
        .from("messages")
        .select("body")
        .eq("id", seekerMessageId)
        .single();
      expect(control?.body).toBe("Private message between the two participants.");
    });

    it("an agent participant cannot repoint the chat at a different student", async () => {
      // Regression guard for the hole 0010 closed. The agent satisfies the
      // UPDATE policy's WITH CHECK through the agent_profile_id branch, so the
      // row predicate alone does not stop them rewriting ownership. Only the
      // column-level grant does.
      await asUser(await mintFreshToken(agent))
        .from("chats")
        .update({ student_user_id: outsider.userId })
        .eq("id", chatId);

      const { data: control } = await svc
        .from("chats")
        .select("student_user_id")
        .eq("id", chatId)
        .single();
      expect(control?.student_user_id).toBe(seeker.userId);
    });

    it("a participant can still stamp last_message_at", async () => {
      const stamp = new Date().toISOString();

      await asUser(await mintFreshToken(seeker))
        .from("chats")
        .update({ last_message_at: stamp })
        .eq("id", chatId);

      const { data: control } = await svc
        .from("chats")
        .select("last_message_at")
        .eq("id", chatId)
        .single();

      // Compared as instants: Postgres renders timestamptz as
      // "…41.26+00:00" where the client sent "…41.260Z". Same moment.
      expect(new Date(control!.last_message_at!).getTime()).toBe(
        new Date(stamp).getTime(),
      );
    });

    it("user B cannot repoint the chat at themselves", async () => {
      await asUser(await mintFreshToken(outsider))
        .from("chats")
        .update({ student_user_id: outsider.userId })
        .eq("id", chatId);

      const { data: control } = await svc
        .from("chats")
        .select("student_user_id")
        .eq("id", chatId)
        .single();
      expect(control?.student_user_id).toBe(seeker.userId);
    });
  });
});
