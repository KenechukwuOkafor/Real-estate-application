/**
 * The seeker's own inspection requests, against a real database.
 *
 * Two things need a real Postgres rather than a unit test.
 *
 * THE SCOPING. parties_read_own_inspection_requests already covered this
 * direction — `requester_user_id = current_app_user_id()` — which is why this
 * slice needed no policy work. "Already covered" is exactly the kind of claim
 * that deserves proving rather than repeating, and the failure mode if it were
 * wrong is one seeker reading another's requests and the messages attached to
 * them.
 *
 * THE EMBED. The seeker's query reaches through listings into agent_profiles
 * for the agent's display name, and migration 0026 has just narrowed the anon
 * grant on that table to three columns. An embed that works for the agent's
 * inbox says nothing about one that traverses a differently-granted table as a
 * different role.
 *
 * The denial below pairs with a service-role control proving the withheld row
 * exists, per ADR-010-A1: an empty result is not a denial.
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
import { effectiveInspectionStatus } from "@/features/inspections/expiry";
import { listSeekerInspectionRequests } from "@/server/repositories/inspection-repository";

const suite = rlsIntegrationEnabled() ? describe : describe.skip;

const HOUR = 60 * 60 * 1000;

suite("seeker inspection requests", () => {
  let svc: ReturnType<typeof asServiceRole>;
  let seeker: CastMember;
  let otherSeeker: CastMember;
  let owningAgent: CastMember;

  let agentProfileId: string;
  let profileCreated = false;
  let listingId: string;
  let ownRequestId: string;
  let expiredRequestId: string;
  let otherRequestId: string;

  beforeAll(async () => {
    svc = asServiceRole();

    const cast = getCast();
    seeker = cast.seeker;
    otherSeeker = cast.otherSeeker;
    owningAgent = cast.owningAgent;

    const existing = await svc
      .from("agent_profiles")
      .select("id")
      .eq("user_id", owningAgent.userId)
      .maybeSingle();
    if (existing.error) throw existing.error;

    if (existing.data) {
      agentProfileId = existing.data.id;
    } else {
      const { data, error } = await svc
        .from("agent_profiles")
        .insert({
          display_name: "Seeker View Agency",
          user_id: owningAgent.userId,
          verification_status: "verified",
        })
        .select("id")
        .single();
      if (error) throw error;
      agentProfileId = data.id;
      profileCreated = true;
    }

    // The agent must be verified, or public_can_read_verified_agent_profiles
    // hides the profile and the display-name embed comes back null.
    const { error: verifyError } = await svc
      .from("agent_profiles")
      .update({ display_name: "Seeker View Agency", verification_status: "verified" })
      .eq("id", agentProfileId);
    if (verifyError) throw verifyError;

    listingId = await createListing();

    const now = Date.now();
    ownRequestId = await createRequest({
      expiresAt: new Date(now + 40 * HOUR).toISOString(),
      requesterUserId: seeker.userId,
    });
    // Deadline in the past with the stored status still 'requested' — the row
    // an agent produces by doing nothing, and the one a seeker currently
    // learns about only by never hearing anything.
    expiredRequestId = await createRequest({
      expiresAt: new Date(now - 2 * HOUR).toISOString(),
      requesterUserId: seeker.userId,
    });
    otherRequestId = await createRequest({
      expiresAt: new Date(now + 40 * HOUR).toISOString(),
      requesterUserId: otherSeeker.userId,
    });
  }, 60_000);

  afterAll(async () => {
    /**
     * Ordered, and every step checked.
     *
     * The first version of this deleted images then the listing and ignored
     * both results. Neither delete could succeed: an APPROVED listing cannot
     * have its cover_image_id nulled — the deferred trigger refuses it — and
     * listings.cover_image_id still referenced the image. Swallowing the
     * errors meant three fixture listings survived into the seeded feed, where
     * they broke an unrelated duration suite two files later. A teardown that
     * cannot fail loudly is a teardown that does not run.
     */
    const steps: Array<[string, string, () => PromiseLike<{ error: unknown }>]> =
      [
        [
          "inspection_requests",
          listingId,
          () =>
            svc.from("inspection_requests").delete().eq("listing_id", listingId),
        ],
        [
          "listing status",
          listingId,
          () => svc.from("listings").update({ status: "draft" }).eq("id", listingId),
        ],
        [
          "cover",
          listingId,
          () =>
            svc
              .from("listings")
              .update({ cover_image_id: null })
              .eq("id", listingId),
        ],
        [
          "listing_images",
          listingId,
          () => svc.from("listing_images").delete().eq("listing_id", listingId),
        ],
        ["listings", listingId, () => svc.from("listings").delete().eq("id", listingId)],
      ];

    for (const [label, id, step] of steps) {
      // Setup can fail partway, leaving these ids empty. Deleting by "" is not
      // a no-op — Postgres refuses it as an invalid uuid — and the teardown
      // error would bury the setup error that caused it.
      if (!id) continue;

      const { error } = await step();
      if (error) throw new Error(`teardown ${label}: ${JSON.stringify(error)}`);
    }

    if (profileCreated) {
      const { error } = await svc
        .from("agent_profiles")
        .delete()
        .eq("id", agentProfileId);
      if (error) throw new Error(`teardown agent_profiles: ${JSON.stringify(error)}`);
    }
  }, 60_000);

  it("returns the seeker's own requests", async () => {
    const client = asUser(await mintFreshToken(seeker));
    const rows = await listSeekerInspectionRequests(client, seeker.userId);
    const ids = rows.map((row) => row.id);

    expect(ids).toContain(ownRequestId);
    expect(ids).toContain(expiredRequestId);
  });

  it("does not return another seeker's request, which really exists", async () => {
    const control = await svc
      .from("inspection_requests")
      .select("id, requester_user_id")
      .eq("id", otherRequestId)
      .single();

    expect(control.error).toBeNull();
    expect(control.data?.requester_user_id).toBe(otherSeeker.userId);

    const client = asUser(await mintFreshToken(seeker));
    const rows = await listSeekerInspectionRequests(client, seeker.userId);

    expect(rows.map((row) => row.id)).not.toContain(otherRequestId);
  });

  it("keeps a request the agent never answered, rather than hiding it", async () => {
    // The whole point of the surface. An inbox that dropped these would answer
    // "did that agent ever reply" with the same silence the seeker already has.
    const client = asUser(await mintFreshToken(seeker));
    const rows = await listSeekerInspectionRequests(client, seeker.userId);
    const expired = rows.find((row) => row.id === expiredRequestId);

    expect(expired).toBeDefined();
    expect(effectiveInspectionStatus(expired!)).toBe("expired");
    // The stored column is untouched: expiry is evaluated on read.
    expect(expired!.status).toBe("requested");
  });

  it("reads the agent's display name through the narrowed 0026 grant", async () => {
    const client = asUser(await mintFreshToken(seeker));
    const rows = await listSeekerInspectionRequests(client, seeker.userId);
    const own = rows.find((row) => row.id === ownRequestId);

    expect(own?.listings?.agent_profiles?.display_name).toBe(
      "Seeker View Agency",
    );
  });

  it("carries the area and property type an unanswered request offers instead", async () => {
    const client = asUser(await mintFreshToken(seeker));
    const rows = await listSeekerInspectionRequests(client, seeker.userId);
    const expired = rows.find((row) => row.id === expiredRequestId);

    expect(expired?.listings?.area).toBe("Seeker View Area");
    expect(expired?.listings?.property_type).toBe("self_contain");
  });

  async function createListing() {
    // Approved the long way round: BR-MEDIA-006 refuses an approved listing
    // with no cover image, and a fixture in an impossible state proves things
    // about a database this application never produces.
    const { data, error } = await svc
      .from("listings")
      .insert({
        agent_profile_id: agentProfileId,
        area: "Seeker View Area",
        bathrooms: 1,
        bedrooms: 1,
        description: "Fixture listing for the seeker inspection suite.",
        price_naira: 450000,
        property_type: "self_contain",
        rental_duration: "yearly",
        slug: `seeker-view-fixture-${Date.now()}`,
        title: "Seeker view fixture listing",
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
    requesterUserId: string;
  }) {
    const { data, error } = await svc
      .from("inspection_requests")
      .insert({
        agent_profile_id: agentProfileId,
        expires_at: input.expiresAt,
        listing_id: listingId,
        message: "Fixture request.",
        requester_user_id: input.requesterUserId,
      })
      .select("id")
      .single();
    if (error) throw error;

    return data.id;
  }
});
