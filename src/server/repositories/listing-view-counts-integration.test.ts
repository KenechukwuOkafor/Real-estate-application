/**
 * The view aggregate, against a real database.
 *
 * listing_views is unreadable by anon and authenticated and stays that way
 * (0014). agent_listing_view_counts is the only way an agent sees anything
 * about it, so what this suite has to establish is narrow and specific:
 *
 *   1. the aggregate reaches rows the caller cannot select, and
 *   2. it returns only that caller's listings, and
 *   3. the number it returns is PEOPLE, not page loads.
 *
 * Point 3 is the one worth testing hard. A count that is merely non-zero
 * proves nothing — the raw row count is also non-zero, and the whole reason
 * this function exists is that those two numbers are different. Every
 * assertion below therefore compares against the raw count as a control.
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
import { listingImagePath } from "../../../test/helpers/storage-paths";
import type { Database } from "@/types/database";

type ListingViewInsert = Database["public"]["Tables"]["listing_views"]["Insert"];

const suite = rlsIntegrationEnabled() ? describe : describe.skip;

const DAY = 24 * 60 * 60 * 1000;

function lagosDay(offsetDays = 0) {
  const now = new Date(Date.now() - offsetDays * DAY);
  // en-CA renders ISO-shaped YYYY-MM-DD, which is what the function takes.
  return now.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
}

suite("agent listing view counts", () => {
  let svc: ReturnType<typeof asServiceRole>;
  let agent: CastMember;
  let otherAgent: CastMember;
  let seeker: CastMember;
  let agentProfileId = "";
  let otherProfileId = "";
  let createdProfileIds: string[] = [];
  let listingId = "";
  let otherListingId = "";

  beforeAll(async () => {
    svc = asServiceRole();
    const cast = getCast();
    agent = cast.owningAgent;
    otherAgent = cast.otherAgent;
    seeker = cast.seeker;

    const profile = await ensureProfile(agent.userId, "Views Agent");
    agentProfileId = profile.id;
    const other = await ensureProfile(otherAgent.userId, "Other Views Agent");
    otherProfileId = other.id;
    createdProfileIds = [profile, other]
      .filter((p) => p.created)
      .map((p) => p.id);

    listingId = await createListing(agentProfileId, "views-own");
    otherListingId = await createListing(otherProfileId, "views-other");

    await seedViews();
  });

  afterAll(async () => {
    await teardown();
  });

  describe("the table stays unreadable", () => {
    it("refuses a direct select to the owning agent, who nonetheless has views", async () => {
      // The control first: the rows exist. Without this, "no rows" is equally
      // consistent with the seeding having silently failed, and the denial
      // assertion below would pass against an empty table.
      const { count } = await svc
        .from("listing_views")
        .select("id", { count: "exact", head: true })
        .eq("listing_id", listingId);
      expect(count ?? 0).toBeGreaterThan(0);

      const client = asUser(await tokenFor(agent));
      const { data } = await client
        .from("listing_views")
        .select("id")
        .eq("listing_id", listingId);

      expect(data ?? []).toHaveLength(0);
    });
  });

  describe("what the number means", () => {
    it("counts people, not page loads", async () => {
      // The control. Eight rows exist for this listing; the aggregate must not
      // return eight, and asserting only "greater than zero" would pass on the
      // raw count this function exists to replace.
      const { count: rowCount } = await svc
        .from("listing_views")
        .select("id", { count: "exact", head: true })
        .eq("listing_id", listingId);

      expect(rowCount).toBe(8);
      expect(await countFor(agent, listingId)).toBe(4);
    });

    it("counts the same person twice across two days, once within a day", async () => {
      // The returning-visitor property. Two days of interest is two days of
      // interest; six visits in one afternoon is one person having a look.
      const rows = await rowsFor(agent);
      const mine = rows.filter((row) => row.listing_id === listingId);

      expect(mine).toHaveLength(2);
      expect(mine.map((row) => Number(row.viewers)).sort()).toEqual([1, 3]);
    });

    it("treats one signed-in person on two devices as one viewer", async () => {
      // viewer_user_id takes precedence over session_id. Reverse that and the
      // seeker's phone and laptop become two people.
      const rows = await rowsFor(agent);
      const yesterday = rows.find(
        (row) => row.listing_id === listingId && Number(row.viewers) === 1,
      );

      expect(yesterday).toBeDefined();
    });

    it("does NOT collapse a shared address into one viewer", async () => {
      // Every row in this suite carries the same ip_hash, which is what campus
      // wifi and a tethered phone look like. Deduplicating on it would make
      // today's three people into one and would do it hardest on the busiest
      // listing — the failure mode 0033 exists to avoid.
      const { data: hashes } = await svc
        .from("listing_views")
        .select("ip_hash")
        .eq("listing_id", listingId);
      const distinct = new Set((hashes ?? []).map((row) => row.ip_hash));

      expect(distinct.size).toBe(1);
      expect(await countFor(agent, listingId)).toBe(4);
    });
  });

  describe("whose listings", () => {
    it("returns the caller's listings and not another agent's", async () => {
      const rows = await rowsFor(agent);

      expect(rows.some((row) => row.listing_id === listingId)).toBe(true);
      expect(rows.some((row) => row.listing_id === otherListingId)).toBe(false);
    });

    it("gives the other agent their own, proving the filter is not just empty", async () => {
      const rows = await rowsFor(otherAgent);

      expect(rows.some((row) => row.listing_id === otherListingId)).toBe(true);
      expect(rows.some((row) => row.listing_id === listingId)).toBe(false);
    });
  });

  describe("who may call it", () => {
    it("refuses a signed-in user who is not an agent", async () => {
      const client = asUser(await tokenFor(seeker));
      const { error } = await client.rpc("agent_listing_view_counts", {
        since_day: lagosDay(29),
        until_day: lagosDay(0),
      });

      expect(error?.message).toContain("AGENT_PROFILE_REQUIRED");
    });

    it("refuses anon at the grant, before the body runs", async () => {
      const { error } = await asAnon().rpc("agent_listing_view_counts", {
        since_day: lagosDay(29),
        until_day: lagosDay(0),
      });

      expect(error?.message).toMatch(/permission denied/i);
    });
  });

  describe("the range", () => {
    it("refuses a range that runs backwards", async () => {
      const client = asUser(await tokenFor(agent));
      const { error } = await client.rpc("agent_listing_view_counts", {
        since_day: lagosDay(0),
        until_day: lagosDay(5),
      });

      expect(error?.message).toContain("VIEW_COUNT_RANGE_INVALID");
    });

    it("refuses a range wider than a year", async () => {
      const client = asUser(await tokenFor(agent));
      const { error } = await client.rpc("agent_listing_view_counts", {
        since_day: lagosDay(400),
        until_day: lagosDay(0),
      });

      expect(error?.message).toContain("VIEW_COUNT_RANGE_TOO_WIDE");
    });
  });

  /**
   * One token per cast member, reused.
   *
   * The first version minted a fresh one inside every call, which came to
   * roughly a dozen Clerk round trips for eleven tests. test/helpers/cast.ts
   * exists because that pattern rate-limited the whole run once already; the
   * same calls are also what fail first when the network is unreliable, and a
   * token is valid for the length of a suite.
   */
  const tokens = new Map<string, string>();

  async function tokenFor(member: CastMember) {
    const cached = tokens.get(member.userId);
    if (cached) return cached;

    const token = await mintFreshToken(member);
    tokens.set(member.userId, token);
    return token;
  }

  async function rowsFor(member: CastMember) {
    const client = asUser(await tokenFor(member));
    const { data, error } = await client.rpc("agent_listing_view_counts", {
      since_day: lagosDay(29),
      until_day: lagosDay(0),
    });
    if (error) throw error;
    return (data ?? []) as Array<{
      listing_id: string;
      viewed_on: string;
      viewers: number;
    }>;
  }

  async function countFor(member: CastMember, targetListingId: string) {
    const rows = await rowsFor(member);
    return rows
      .filter((row) => row.listing_id === targetListingId)
      .reduce((total, row) => total + Number(row.viewers), 0);
  }

  /**
   * Six rows, four people, two days — every number in this suite comes from
   * here and each one is load-bearing.
   *
   * Today   : three distinct session ids, one of them visiting four times.
   * Yesterday: one signed-in person on two devices, so two session ids and one
   *            viewer.
   *
   * So: 6 rows today for 3 people, 2 rows yesterday for 1 person. Totals are
   * 8 rows and 4 viewers, and every assertion above names one of those.
   */
  async function seedViews() {
    // MIDDAY LAGOS, not "now". Anchoring to the current instant means a run
    // that starts just after local midnight subtracts minutes across the day
    // boundary and files today's visits under yesterday — a test that fails
    // once a night and passes every time anyone looks at it.
    const today = new Date(`${lagosDay(0)}T12:00:00+01:00`);
    const yesterday = new Date(`${lagosDay(1)}T12:00:00+01:00`);
    const rows: ListingViewInsert[] = [];

    for (const [index, session] of ["a", "b", "c"].entries()) {
      const visits = session === "a" ? 4 : 1;
      for (let visit = 0; visit < visits; visit += 1) {
        rows.push({
          created_at: new Date(today.getTime() - (index + visit) * 60_000).toISOString(),
          ip_hash: "suite-shared-nat",
          listing_id: listingId,
          session_id: `suite-session-${session}`,
        });
      }
    }

    for (const device of ["phone", "laptop"]) {
      rows.push({
        created_at: yesterday.toISOString(),
        ip_hash: "suite-shared-nat",
        listing_id: listingId,
        session_id: `suite-device-${device}`,
        viewer_user_id: seeker.userId,
      });
    }

    rows.push({
      created_at: today.toISOString(),
      ip_hash: "suite-shared-nat",
      listing_id: otherListingId,
      session_id: "suite-other-agent-viewer",
    });

    const { error } = await svc.from("listing_views").insert(rows);
    if (error) throw error;
  }

  /**
   * Order matters here, and the first version of this got it wrong.
   *
   * An APPROVED listing cannot have its cover_image_id nulled — BR-MEDIA-006's
   * trigger refuses it — so the image delete failed, the listing delete then
   * failed on the images foreign key, and because none of it checked `error`,
   * all of it failed SILENTLY. Three runs' worth of fixture listings
   * accumulated in the shared database and broke a different suite:
   * listing-duration asserts the public feed contains exactly the three seeded
   * durations, and it was seeing seven listings.
   *
   * So: status down to draft first, then the cover, then the images, then the
   * listing — and every step's error is thrown rather than dropped. A teardown
   * that cannot fail loudly is a teardown that leaves rows behind.
   */
  async function teardown() {
    const { error: viewsError } = await svc
      .from("listing_views")
      .delete()
      .eq("ip_hash", "suite-shared-nat");
    if (viewsError) throw viewsError;

    for (const id of [listingId, otherListingId]) {
      // Setup can fail partway and leave these empty. Deleting by "" is not a
      // no-op — Postgres rejects it as an invalid uuid, and that error buries
      // the setup failure that actually caused it.
      if (!id) continue;

      const steps: Array<[string, () => PromiseLike<{ error: unknown }>]> = [
        ["status", () => svc.from("listings").update({ status: "draft" }).eq("id", id)],
        ["cover", () => svc.from("listings").update({ cover_image_id: null }).eq("id", id)],
        ["images", () => svc.from("listing_images").delete().eq("listing_id", id)],
        ["listing", () => svc.from("listings").delete().eq("id", id)],
      ];

      for (const [label, step] of steps) {
        const { error } = await step();
        if (error) throw new Error(`teardown ${label} ${id}: ${JSON.stringify(error)}`);
      }
    }

    for (const id of createdProfileIds) {
      const { error } = await svc.from("agent_profiles").delete().eq("id", id);
      if (error) throw error;
    }
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

  async function createListing(profileId: string, slug: string) {
    const { data, error } = await svc
      .from("listings")
      .insert({
        agent_profile_id: profileId,
        area: "Views Area",
        bathrooms: 1,
        bedrooms: 1,
        description: "Fixture listing for the view-count suite.",
        price_naira: 500000,
        property_type: "self_contain",
        rental_duration: "yearly",
        slug: `${slug}-${Date.now()}`,
        title: "Views fixture listing",
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

    await svc.from("listings").update({ cover_image_id: image.id }).eq("id", data.id);
    await svc.from("listings").update({ status: "approved" }).eq("id", data.id);

    return data.id;
  }
});
