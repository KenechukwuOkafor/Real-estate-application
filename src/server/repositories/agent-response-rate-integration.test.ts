/**
 * The response rate exists twice, and this is what stops the two drifting.
 *
 * The agent dashboard computes it in TypeScript, from rows it already holds,
 * because the rule depends on read-time expiry and expiry.ts is where that
 * rule lives. The public profile cannot do that: its caller is anon, and
 * handing an anonymous caller one row per inspection request would publish an
 * agent's demand timeline to anyone calling PostgREST directly — far more than
 * the page's "Replied to 9 of 10" says. So agent_response_rate() aggregates in
 * SQL and returns two integers.
 *
 * Two implementations of one rule. expiry.ts's own header records two live
 * defects caused by exactly that, so the duplication is pinned rather than
 * trusted: every case below is driven through BOTH from the same rows on disk,
 * and asserted equal.
 *
 * The cases are chosen to be the ones that separate the implementations. A
 * fixture of nothing but answered requests would agree under any rule at all,
 * including a rule that just counts rows.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database";

import { type CastMember, getCast } from "../../../test/helpers/cast";
import { responseRate } from "@/features/agents/dashboard/metrics";
import {
  asAnon,
  asServiceRole,
  rlsIntegrationEnabled,
} from "../../../test/helpers/rls-clients";

const suite = rlsIntegrationEnabled() ? describe : describe.skip;

const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();
const ahead = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

suite("agent_response_rate against responseRate", () => {
  let svc: ReturnType<typeof asServiceRole>;
  let agent: CastMember;
  let seeker: CastMember;
  let agentProfileId = "";
  let listingId = "";
  let createdProfile = false;

  beforeAll(async () => {
    svc = asServiceRole();
    const cast = getCast();
    agent = cast.owningAgent;
    seeker = cast.seeker;

    const existing = await svc
      .from("agent_profiles")
      .select("id")
      .eq("user_id", agent.userId)
      .maybeSingle();

    if (existing.data) {
      agentProfileId = existing.data.id;
    } else {
      const { data, error } = await svc
        .from("agent_profiles")
        .insert({ display_name: "Response Rate Agent", user_id: agent.userId })
        .select("id")
        .single();
      if (error) throw error;
      agentProfileId = data.id;
      createdProfile = true;
    }

    const { data: listing, error } = await svc
      .from("listings")
      .insert({
        agent_profile_id: agentProfileId,
        area: "Rate Area",
        bathrooms: 1,
        bedrooms: 1,
        description: "Fixture listing for the response rate suite.",
        price_naira: 500000,
        property_type: "self_contain",
        rental_duration: "yearly",
        slug: `rate-fixture-${Date.now()}`,
        title: "Rate fixture listing",
      })
      .select("id")
      .single();
    if (error) throw error;
    listingId = listing.id;

    /**
     * THE FIXTURE, and every row in it is a case the rule treats differently.
     *
     * Without the last three, a green result would prove only that both sides
     * can count — which is the shape of fixture ADR-010-A1's measurement table
     * records six times, one that cannot fail the way production fails.
     */
    await seedRequests([
      // Answered: accepted, and answered before the window closed.
      { respondedAt: ago(70), status: "accepted" },
      { respondedAt: ago(69), status: "accepted" },
      { respondedAt: ago(68), status: "declined" },
      // Answered, then lapsed — accepted and never marked complete. Still a
      // reply. A lapse is a completion failure, not a response failure, and
      // conflating them would publish the wrong accusation.
      {
        completionDeadline: ago(2),
        respondedAt: ago(50),
        status: "accepted",
      },
      // Unanswered and out of time. In the denominator, out of the numerator.
      // This is the row that makes the number mean anything: without it an
      // agent who ignores everything scores 100%.
      { expiresAt: ago(5), requestedAt: ago(53), status: "requested" },
      { expiresAt: ago(3), requestedAt: ago(51), status: "requested" },
      // Unanswered and still inside its window. In NEITHER half — the agent
      // has not failed to answer it, they have not answered it yet.
      { expiresAt: ahead(40), requestedAt: ago(8), status: "requested" },
      // Withdrawn by the seeker before any reply. Excluded entirely: counting
      // it would let a seeker damage an agent's public number by changing
      // their mind.
      { expiresAt: ahead(30), requestedAt: ago(6), status: "cancelled" },
      // Withdrawn AFTER a reply. Answered — the reply happened, and the
      // cancellation says nothing about the agent.
      { respondedAt: ago(20), status: "cancelled" },
    ]);
  }, 60_000);

  afterAll(async () => {
    await svc.from("inspection_requests").delete().eq("listing_id", listingId);
    await svc.from("listing_images").delete().eq("listing_id", listingId);
    await svc.from("listings").delete().eq("id", listingId);

    if (createdProfile) {
      // agent_profiles.user_id is UNIQUE; a profile left behind breaks the
      // next suite that needs one for this agent.
      await svc.from("agent_profiles").delete().eq("id", agentProfileId);
    }
  }, 60_000);

  it("agrees with the TypeScript rule on both halves", async () => {
    const [sql, ts] = await Promise.all([sqlRate(), typescriptRate()]);

    expect(sql).toEqual(ts);
  });

  it("counts what the fixture was built to contain", async () => {
    // Pinning the expected numbers, not just the agreement. Two identical
    // implementations of a WRONG rule agree perfectly, and the test above
    // would stay green through it.
    //
    // Nine rows: five answered (three replies, one accepted-then-lapsed, one
    // cancelled after a reply), two ignored past their window, one still open,
    // one withdrawn before a reply. Answerable is the five plus the two.
    expect(await sqlRate()).toEqual({ answerable: 7, answered: 5 });
  });

  it("excludes an open request from both halves, not just the numerator", async () => {
    // The clause most easily written as "count it as a miss", which would drop
    // an agent's public number every time a new request arrived.
    const before = await sqlRate();

    const id = await seedRequest({
      expiresAt: ahead(47),
      requestedAt: ago(1),
      status: "requested",
    });

    try {
      expect(await sqlRate()).toEqual(before);
    } finally {
      await svc.from("inspection_requests").delete().eq("id", id);
    }
  });

  it("moves a request into the denominator when its window closes", async () => {
    // The same row, on both sides of its deadline, with nothing rewriting the
    // status column. This is the read-time rule actually being read — and the
    // obligation the public number takes on: an agent who ignores requests
    // must not keep a clean record by leaving them at 'requested' forever.
    const id = await seedRequest({
      expiresAt: ahead(1),
      requestedAt: ago(47),
      status: "requested",
    });

    try {
      const open = await sqlRate();

      await svc
        .from("inspection_requests")
        .update({ expires_at: ago(1) })
        .eq("id", id);

      const stored = await svc
        .from("inspection_requests")
        .select("status")
        .eq("id", id)
        .single();

      // The column still says 'requested'. Nothing wrote a lapse; the change
      // below is entirely a consequence of reading the deadline.
      expect(stored.data?.status).toBe("requested");

      const closed = await sqlRate();

      expect(closed.answerable).toBe(open.answerable + 1);
      expect(closed.answered).toBe(open.answered);
      expect(closed).toEqual(await typescriptRate());
    } finally {
      await svc.from("inspection_requests").delete().eq("id", id);
    }
  });

  it("answers an anonymous caller, and gives them nothing else", async () => {
    // The page's caller. anon can read no inspection_requests row at all, so
    // the two integers are the entire disclosure — which is the reason this
    // aggregates in SQL rather than returning rows to TypeScript.
    const anon = asAnon();

    const { data, error } = await anon.rpc("agent_response_rate", {
      target_agent_profile_id: agentProfileId,
    });

    expect(error).toBeNull();
    expect(data?.[0]).toEqual({ answerable: 7, answered: 5 });

    const rows = await anon
      .from("inspection_requests")
      .select("id")
      .eq("agent_profile_id", agentProfileId);

    expect(rows.data ?? []).toHaveLength(0);
  });

  async function sqlRate() {
    const { data, error } = await svc.rpc("agent_response_rate", {
      target_agent_profile_id: agentProfileId,
    });
    if (error) throw error;

    return { answerable: data![0].answerable, answered: data![0].answered };
  }

  async function typescriptRate() {
    const { data, error } = await svc
      .from("inspection_requests")
      .select("completion_deadline, expires_at, listing_id, requested_at, responded_at, status")
      .eq("agent_profile_id", agentProfileId)
      .is("deleted_at", null);
    if (error) throw error;

    const rate = responseRate(data!);

    return { answerable: rate.answerable, answered: rate.answered };
  }

  async function seedRequest(input: {
    completionDeadline?: string;
    expiresAt?: string;
    requestedAt?: string;
    respondedAt?: string;
    status: Database["public"]["Enums"]["inspection_status"];
  }) {
    const { data, error } = await svc
      .from("inspection_requests")
      .insert({
        agent_profile_id: agentProfileId,
        completion_deadline: input.completionDeadline ?? null,
        expires_at: input.expiresAt ?? ahead(40),
        listing_id: listingId,
        message: "Fixture request.",
        requested_at: input.requestedAt ?? ago(72),
        requester_user_id: seeker.userId,
        responded_at: input.respondedAt ?? null,
        status: input.status,
      })
      .select("id")
      .single();
    if (error) throw error;

    return data.id;
  }

  async function seedRequests(
    inputs: Parameters<typeof seedRequest>[0][],
  ) {
    for (const input of inputs) {
      await seedRequest(input);
    }
  }
});
