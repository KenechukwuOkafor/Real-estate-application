/**
 * RLS group 3: inspection_requests.
 *
 * Parties only: the seeker who made it and the agent who owns the listing.
 * Denials are paired with service-role controls.
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

suite("RLS: inspection_requests", () => {
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
  let owningAgent: CastMember;
  let otherAgent: CastMember;
  let otherSeeker: CastMember;

  let owningProfileId: string;
  let otherProfileId: string;
  let listingId: string;
  let requestId: string;

  async function seedProfile(userId: string, name: string) {
    const { data, error } = await svc
      .from("agent_profiles")
      .insert({ display_name: name, user_id: userId })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  beforeAll(async () => {
    // Identities from the shared cast. otherSeeker is why the cast has five
    // members rather than four: proving a *different ordinary user* is refused
    // is not the same assertion as proving an agent is.
    const cast = getCast();
    seeker = cast.seeker;
    owningAgent = cast.owningAgent;
    otherAgent = cast.otherAgent;
    otherSeeker = cast.otherSeeker;

    owningProfileId = await seedProfile(owningAgent.userId, "Owning Agent");
    otherProfileId = await seedProfile(otherAgent.userId, "Other Agent");

    const { data: listing, error: listingError } = await svc
      .from("listings")
      .insert({
        agent_profile_id: owningProfileId,
        area: "Odenigbo",
        bathrooms: 1,
        bedrooms: 1,
        description: "RLS inspection fixture.",
        price_naira: 250000,
        property_type: "self_contain",
        rental_duration: "yearly",
        slug: `rls-insp-${Date.now()}`,
        // draft, not approved: BR-MEDIA-006 now requires an approved
        // listing to have a cover image, and nothing here depends on
        // the status.
        status: "draft",
        title: "RLS inspection fixture",
      })
      .select("id")
      .single();
    if (listingError) throw listingError;
    listingId = listing.id;

    const { data: request, error: requestError } = await svc
      .from("inspection_requests")
      .insert({
        agent_profile_id: owningProfileId,
        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        listing_id: listingId,
        message: "Is this still available?",
        requester_user_id: seeker.userId,
      })
      .select("id")
      .single();
    if (requestError) throw requestError;
    requestId = request.id;
  });

  afterAll(async () => {
    if (requestId) await svc.from("inspection_requests").delete().eq("id", requestId);
    if (listingId) await svc.from("listings").delete().eq("id", listingId);
    // Domain data only; the cast outlives this suite. agent_profiles.user_id is
    // UNIQUE, so a leftover profile breaks the next suite that needs one.
    for (const id of [owningProfileId, otherProfileId]) {
      if (id) await svc.from("agent_profiles").delete().eq("id", id);
    }
  });

  it("control: the request exists", async () => {
    const { data } = await svc
      .from("inspection_requests")
      .select("id")
      .eq("id", requestId);
    expect(data).toHaveLength(1);
  });

  it("the requesting seeker reads it", async () => {
    const { data, error } = await asUser(await mintFreshToken(seeker))
      .from("inspection_requests")
      .select("id, message")
      .eq("id", requestId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].message).toBe("Is this still available?");
  });

  it("the owning agent reads it", async () => {
    const { data, error } = await asUser(await mintFreshToken(owningAgent))
      .from("inspection_requests")
      .select("id")
      .eq("id", requestId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("a seeker who is not party to it cannot read it", async () => {
    const { data } = await asUser(await mintFreshToken(otherSeeker))
      .from("inspection_requests")
      .select("id")
      .eq("id", requestId);

    expect(data).toEqual([]);

    const { data: control } = await svc
      .from("inspection_requests")
      .select("id")
      .eq("id", requestId);
    expect(control).toHaveLength(1);
  });

  it("an agent who does not own the listing cannot read it", async () => {
    const { data } = await asUser(await mintFreshToken(otherAgent))
      .from("inspection_requests")
      .select("id")
      .eq("id", requestId);

    expect(data).toEqual([]);

    const { data: control } = await svc
      .from("inspection_requests")
      .select("id")
      .eq("id", requestId);
    expect(control).toHaveLength(1);
  });

  it("an anonymous caller cannot read it", async () => {
    const { data } = await asAnon()
      .from("inspection_requests")
      .select("id")
      .eq("id", requestId);

    expect(data ?? []).toEqual([]);
  });

  /**
   * THE WRITE HALF, AS OF 0030.
   *
   * These used to prove that the owning agent — and only they — could write
   * `status` directly, because 0012 granted `update (status, responded_at,
   * updated_at)`. That grant is gone: the privilege that writes 'accepted' is
   * the privilege that writes 'completed', so an agent holding it could mark a
   * visit complete that never happened, on a request nobody accepted, at any
   * time. Every transition now goes through a SECURITY DEFINER function.
   *
   * The failure mode changed with it, and it is worth naming: an RLS POLICY
   * denial silently affects zero rows, but a missing GRANT is a hard 42501.
   * So these assert an error code AND a service-role control, where the old
   * ones could only assert the control.
   */
  it("the owning agent cannot write status directly any more", async () => {
    const { error } = await asUser(await mintFreshToken(owningAgent))
      .from("inspection_requests")
      .update({ status: "accepted" })
      .eq("id", requestId);

    expect(error?.code).toBe("42501");

    const { data: control } = await svc
      .from("inspection_requests")
      .select("status")
      .eq("id", requestId)
      .single();
    expect(control?.status).toBe("requested");
  });

  it("the owning agent cannot mark an inspection complete by hand", async () => {
    // The whole four-day window rests on this being impossible. If status were
    // writable, the deadline would be advisory.
    const { error } = await asUser(await mintFreshToken(owningAgent))
      .from("inspection_requests")
      .update({ completed_at: new Date().toISOString(), status: "completed" })
      .eq("id", requestId);

    expect(error?.code).toBe("42501");

    const { data: control } = await svc
      .from("inspection_requests")
      .select("completed_at, status")
      .eq("id", requestId)
      .single();
    expect(control?.status).toBe("requested");
    expect(control?.completed_at).toBeNull();
  });

  it("the owning agent cannot give themselves more time", async () => {
    const { error } = await asUser(await mintFreshToken(owningAgent))
      .from("inspection_requests")
      .update({ completion_deadline: "2099-01-01T00:00:00.000Z" })
      .eq("id", requestId);

    expect(error?.code).toBe("42501");

    const { data: control } = await svc
      .from("inspection_requests")
      .select("completion_deadline")
      .eq("id", requestId)
      .single();
    expect(control?.completion_deadline).toBeNull();
  });

  it("the requesting seeker cannot accept their own request", async () => {
    // Now refused for two independent reasons: no UPDATE grant at all, and no
    // agent profile to satisfy the function's ownership check.
    const { error } = await asUser(await mintFreshToken(seeker))
      .from("inspection_requests")
      .update({ status: "accepted" })
      .eq("id", requestId);

    expect(error?.code).toBe("42501");

    const { data: control } = await svc
      .from("inspection_requests")
      .select("status")
      .eq("id", requestId)
      .single();
    expect(control?.status).toBe("requested");
  });

  it("a non-owning agent cannot accept it through the function", async () => {
    const { error } = await asUser(await mintFreshToken(otherAgent)).rpc(
      "respond_to_inspection_request",
      { decision: "accepted", target_request_id: requestId },
    );

    // Not found rather than forbidden: a distinguishable refusal would confirm
    // the id names a real request.
    expect(error?.message).toContain("INSPECTION_REQUEST_NOT_FOUND");

    const { data: control } = await svc
      .from("inspection_requests")
      .select("status")
      .eq("id", requestId)
      .single();
    expect(control?.status).toBe("requested");
  });

  it("the owning agent cannot rewrite who requested it", async () => {
    // REB-ARCH-004: "Cannot modify requester information." Was enforced by the
    // column grant being narrow; now by there being no UPDATE grant at all.
    const { error } = await asUser(await mintFreshToken(owningAgent))
      .from("inspection_requests")
      .update({ requester_user_id: otherSeeker.userId })
      .eq("id", requestId);

    expect(error?.code).toBe("42501");

    const { data: control } = await svc
      .from("inspection_requests")
      .select("requester_user_id")
      .eq("id", requestId)
      .single();
    expect(control?.requester_user_id).toBe(seeker.userId);
  });

  /**
   * The positive control, last because it is the only one that changes the row.
   *
   * Without it every assertion above is satisfied by a table nobody can write
   * to at all, which would be a passing suite over a broken product.
   */
  it("the owning agent accepts through the function, which sets the deadline", async () => {
    const { error } = await asUser(await mintFreshToken(owningAgent)).rpc(
      "respond_to_inspection_request",
      { decision: "accepted", target_request_id: requestId },
    );

    expect(error).toBeNull();

    const { data: control } = await svc
      .from("inspection_requests")
      .select("completion_deadline, responded_at, status")
      .eq("id", requestId)
      .single();

    expect(control?.status).toBe("accepted");
    expect(control?.responded_at).not.toBeNull();
    expect(control?.completion_deadline).not.toBeNull();

    // Four days out, give or take the round trip.
    const deadline = new Date(control!.completion_deadline!).getTime();
    const expected = Date.now() + 4 * 24 * 60 * 60 * 1000;
    expect(Math.abs(deadline - expected)).toBeLessThan(60_000);
  });

  it("marks it complete inside the window, and refuses a second time", async () => {
    // Runs after the acceptance above: this suite's cases share one row on
    // purpose, so the lifecycle is exercised in the order it really happens.
    const { error } = await asUser(await mintFreshToken(owningAgent)).rpc(
      "complete_inspection_request",
      { target_request_id: requestId },
    );

    expect(error).toBeNull();

    const { data: control } = await svc
      .from("inspection_requests")
      .select("completed_at, status")
      .eq("id", requestId)
      .single();
    expect(control?.status).toBe("completed");
    expect(control?.completed_at).not.toBeNull();

    const { error: second } = await asUser(
      await mintFreshToken(owningAgent),
    ).rpc("complete_inspection_request", { target_request_id: requestId });

    expect(second?.message).toContain("INSPECTION_STATE_TRANSITION_INVALID");
  });

  /**
   * The seeker's own exit — 0032.
   *
   * Uses its own row, because the shared one above is walked through
   * accept -> complete in order and cancellation is a different ending.
   */
  describe("a seeker withdrawing", () => {
    let cancellableId = "";

    beforeAll(async () => {
      const { data, error } = await svc
        .from("inspection_requests")
        .insert({
          agent_profile_id: owningProfileId,
          expires_at: new Date(Date.now() + 40 * 60 * 60 * 1000).toISOString(),
          listing_id: listingId,
          message: "Cancellable fixture.",
          requester_user_id: seeker.userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      cancellableId = data.id;
    }, 60_000);

    afterAll(async () => {
      await svc.from("inspection_requests").delete().eq("id", cancellableId);
    }, 60_000);

    it("refuses somebody else's inspection, as not found", async () => {
      const { error } = await asUser(await mintFreshToken(otherSeeker)).rpc(
        "cancel_inspection_request",
        { target_request_id: cancellableId },
      );

      expect(error?.message).toContain("INSPECTION_REQUEST_NOT_FOUND");

      const { data: control } = await svc
        .from("inspection_requests")
        .select("status")
        .eq("id", cancellableId)
        .single();
      expect(control?.status).toBe("requested");
    });

    it("refuses the owning agent — cancelling is not theirs to do", async () => {
      // Deliberate: an agent who accepted and cannot attend says so in the
      // chat. A one-tap withdrawal would weaken the commitment accepting
      // makes, and would double as a way to clear a lapse on day four.
      const { error } = await asUser(await mintFreshToken(owningAgent)).rpc(
        "cancel_inspection_request",
        { target_request_id: cancellableId },
      );

      expect(error?.message).toContain("INSPECTION_REQUEST_NOT_FOUND");

      const { data: control } = await svc
        .from("inspection_requests")
        .select("status")
        .eq("id", cancellableId)
        .single();
      expect(control?.status).toBe("requested");
    });

    it("lets the requesting seeker withdraw, and records when", async () => {
      const { error } = await asUser(await mintFreshToken(seeker)).rpc(
        "cancel_inspection_request",
        { target_request_id: cancellableId },
      );

      expect(error).toBeNull();

      const { data: control } = await svc
        .from("inspection_requests")
        .select("cancelled_at, status")
        .eq("id", cancellableId)
        .single();
      expect(control?.status).toBe("cancelled");
      expect(control?.cancelled_at).not.toBeNull();
    });

    it("refuses a second withdrawal", async () => {
      const { error } = await asUser(await mintFreshToken(seeker)).rpc(
        "cancel_inspection_request",
        { target_request_id: cancellableId },
      );

      expect(error?.message).toContain("INSPECTION_STATE_TRANSITION_INVALID");
    });

    it("will not let even service role un-cancel it", async () => {
      const { error } = await svc
        .from("inspection_requests")
        .update({ status: "requested" })
        .eq("id", cancellableId);

      expect(error?.message).toContain("INSPECTION_COMPLETED_IS_TERMINAL");
    });
  });

  it("will not let even service role reopen a completed inspection", async () => {
    // Terminal for every caller, matching listings_archived_is_terminal. The
    // service-role client bypasses RLS and both functions entirely, so a
    // trigger is the only thing that holds here.
    const { error } = await svc
      .from("inspection_requests")
      .update({ status: "accepted" })
      .eq("id", requestId);

    expect(error?.message).toContain("INSPECTION_COMPLETED_IS_TERMINAL");
  });
});
