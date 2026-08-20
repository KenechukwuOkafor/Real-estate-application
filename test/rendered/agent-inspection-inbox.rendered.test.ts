/**
 * The inspection inbox, rendered.
 *
 * Accept and decline existed only inside a chat thread, so an agent's only
 * signal that somebody wanted to see a property was an unfamiliar conversation
 * appearing in /chats. These assert the queue exists, that it tells the truth
 * about time, and — the part that matters most — that a request the agent
 * ignored past its window is still shown rather than quietly dropped.
 *
 * See test/helpers/rendered-page.ts for what this can and cannot prove. The
 * countdown ticks on the client, so what is asserted here is the server's first
 * honest answer, not the ticking.
 *
 * LOCAL ONLY. Run with `npm run test:rendered` against `npm run dev`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEV_AUTH_USERS } from "@/lib/auth/dev-auth";

import { asServiceRole } from "../helpers/rls-clients";
import {
  assertCanRenderPages,
  renderAnonymously,
  renderAsPersona,
} from "../helpers/rendered-page";

const HOUR = 60 * 60 * 1000;
const PATH = "/agent/inspections";

describe("agent inspection inbox", () => {
  const svc = asServiceRole();
  let listingId = "";
  let listingTitle = "";
  let seekerUserId = "";
  let seekerName = "";
  let agentProfileId = "";
  let createdRequestIds: string[] = [];

  beforeAll(async () => {
    await assertCanRenderPages();

    // The seeded listings belong to the verified agent persona, which is the
    // persona this renders as — so these are requests for a property this agent
    // genuinely owns.
    const { data: listing, error } = await svc
      .from("listings")
      .select("id, title, agent_profile_id")
      .eq("status", "approved")
      .limit(1)
      .single();
    if (error) throw error;

    listingId = listing.id;
    listingTitle = listing.title;
    agentProfileId = listing.agent_profile_id;

    // The Student persona specifically, not "any user that isn't the agent".
    // A request whose requester happens to be another agent would still render,
    // so the looser lookup could pass while the real pairing was broken.
    const student = DEV_AUTH_USERS.find((user) => user.label === "Student")!;
    const { data: seeker, error: seekerError } = await svc
      .from("users")
      .select("id, full_name")
      .eq("clerk_user_id", student.clerkUserId)
      .single();
    if (seekerError) throw seekerError;

    seekerUserId = seeker.id;
    seekerName = seeker.full_name ?? "";
    if (!seekerName) {
      throw new Error("The Student persona needs a full_name for this suite.");
    }

    // One inside its window, one long past it. The pair is the point: a page
    // that showed only the live one would pass a test that asserted only on the
    // live one.
    createdRequestIds = [
      await createRequest({
        expiresAt: new Date(Date.now() + 5 * HOUR).toISOString(),
        message: "Could I see this on Saturday morning?",
        requestedAt: new Date(Date.now() - 43 * HOUR).toISOString(),
      }),
      await createRequest({
        expiresAt: new Date(Date.now() - 9 * HOUR).toISOString(),
        message: "Is this one still free?",
        requestedAt: new Date(Date.now() - 57 * HOUR).toISOString(),
      }),
    ];
  });

  afterAll(async () => {
    if (createdRequestIds.length > 0) {
      const { error } = await svc
        .from("inspection_requests")
        .delete()
        .in("id", createdRequestIds);
      if (error) throw error;
    }
  });

  it("is not readable without a session", async () => {
    const page = await renderAnonymously(PATH);

    expect(page.status).not.toBe(200);
  });

  it("lists a waiting request with who asked and which listing", async () => {
    const page = await renderAsPersona(PATH, "Agent (verified)");

    expect(page.status).toBe(200);
    expect(page.text).toContain(listingTitle);
    expect(page.text).toContain("Could I see this on Saturday morning?");
    expect(page.text).toContain("Waiting for your answer");

    // The seeker's ACTUAL name, not the "A seeker" fallback.
    //
    // Without this the page could render every row anonymously and every other
    // assertion here would still pass — the name is read through an embed on a
    // table the agent does not own rows in, so whether RLS lets them see it is
    // a real question and not one to assume.
    expect(page.text).toContain(seekerName);
    expect(page.text).not.toContain("A seeker");
  });

  it("shows the countdown on the request that still has time", async () => {
    const page = await renderAsPersona(PATH, "Agent (verified)");

    // Coarse by design — 5 hours out reads as "4 hours left" or "5 hours left"
    // depending on where the clock sits inside the minute. Asserting the exact
    // number would make this fail on a slow render rather than on a defect.
    expect(page.text).toMatch(/\d+ hours? left/);
  });

  it("keeps a request the agent never answered, labelled rather than hidden", async () => {
    // The honesty requirement. An inbox that hid these would answer "am I
    // responsive" with silence, and the answer lives precisely in the ones that
    // were missed.
    const page = await renderAsPersona(PATH, "Agent (verified)");

    expect(page.text).toContain("Is this one still free?");
    expect(page.text).toContain("Expired");
    expect(page.text).toContain("did not respond in time");
  });

  it("counts only the requests that still need an answer", async () => {
    const page = await renderAsPersona(PATH, "Agent (verified)");

    // The expired one must not be counted as needing an answer — it cannot be
    // answered any more.
    expect(page.text).toMatch(/requests? need|request needs/);
    expect(page.text).not.toContain("2 requests need an answer");
  });

  it("says what accepting commits the agent to, before they accept", async () => {
    const page = await renderAsPersona(PATH, "Agent (verified)");

    // The confirmation panel is client-rendered on click, so what is asserted
    // here is the standing explanation on the page: 48 hours, and what running
    // out of them means for the seeker.
    expect(page.text).toContain("48 hours");
    expect(page.text).toContain("start again");
  });

  it("is refused to a seeker", async () => {
    const page = await renderAsPersona(PATH, "Student");

    expect(page.status).not.toBe(200);
  });

  async function createRequest(input: {
    expiresAt: string;
    message: string;
    requestedAt: string;
  }) {
    const { data, error } = await svc
      .from("inspection_requests")
      .insert({
        agent_profile_id: agentProfileId,
        expires_at: input.expiresAt,
        listing_id: listingId,
        message: input.message,
        requested_at: input.requestedAt,
        requester_user_id: seekerUserId,
      })
      .select("id")
      .single();
    if (error) throw error;

    return data.id;
  }
});
