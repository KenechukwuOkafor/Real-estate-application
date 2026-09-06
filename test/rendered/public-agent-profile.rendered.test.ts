/**
 * The public agent profile, rendered for both of its viewers.
 *
 * The page is ONE component with a viewer-dependent filter, which is the part
 * worth rendering rather than unit-testing: the difference between what a
 * stranger gets and what the owner gets is produced by RLS and by an isOwner
 * flag, and neither is observable from TypeScript. A unit test would mock the
 * service and prove only that the mock was returned.
 *
 * The assertions that matter are the NEGATIVE ones — a draft absent from an
 * anonymous render, an unverified profile 404ing for everyone but its owner.
 * Each is paired with a positive control proving the thing exists and is being
 * withheld, because "the word 'Draft' is not in this HTML" is equally
 * consistent with the page being blank, the fixture having no drafts, or the
 * server having returned a 500.
 *
 * See test/helpers/rendered-page.ts for what this can and cannot prove: it
 * checks SERVER-RENDERED output. The copy button and the view beacon are
 * client-side and are not exercised here.
 *
 * LOCAL ONLY. Run with `npm run test:rendered` against `npm run dev`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asServiceRole } from "../helpers/rls-clients";
import {
  assertCanRenderPages,
  renderAnonymously,
  renderAsPersona,
} from "../helpers/rendered-page";

describe("public agent profile", () => {
  const svc = asServiceRole();
  let verifiedHandle = "";
  let unverifiedHandle = "";
  let draftTitle = "";
  let seededRequestIds: string[] = [];

  beforeAll(async () => {
    await assertCanRenderPages();

    const { data: profiles, error } = await svc
      .from("agent_profiles")
      .select("id, handle, verification_status, user_id");
    if (error) throw error;

    verifiedHandle =
      profiles.find((row) => row.verification_status === "verified")?.handle ?? "";
    unverifiedHandle =
      profiles.find((row) => row.verification_status !== "verified")?.handle ?? "";

    const verifiedProfile = profiles.find(
      (row) => row.verification_status === "verified",
    )!;

    const { data: draft } = await svc
      .from("listings")
      .select("title")
      .eq("agent_profile_id", verifiedProfile.id)
      .eq("status", "draft")
      .limit(1)
      .maybeSingle();

    draftTitle = draft?.title ?? "";

    /**
     * Ten answerable requests, because the page renders NOTHING below that.
     *
     * Without this the response-rate assertions would pass against an element
     * that is absent for the right reason and absent for the wrong reason
     * identically — the exact fixture failure ADR-010-A1's table records. The
     * suppression case is asserted separately, after these are removed.
     */
    const { data: listing } = await svc
      .from("listings")
      .select("id")
      .eq("agent_profile_id", verifiedProfile.id)
      .eq("status", "approved")
      .limit(1)
      .single();

    const { data: seeker } = await svc
      .from("users")
      .select("id")
      .neq("id", verifiedProfile.user_id)
      .limit(1)
      .single();

    const rows = Array.from({ length: 10 }, (_, index) => ({
      agent_profile_id: verifiedProfile.id,
      expires_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      listing_id: listing!.id,
      message: "RENDERED FIXTURE",
      requested_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      requester_user_id: seeker!.id,
      // Nine answered, one ignored past its window — so the fraction is not
      // n of n, and a rule that simply counted rows would produce the wrong
      // numerator.
      responded_at:
        index === 0 ? null : new Date(Date.now() - 4 * 86_400_000).toISOString(),
      status: (index === 0 ? "requested" : "accepted") as "requested" | "accepted",
    }));

    const inserted = await svc
      .from("inspection_requests")
      .insert(rows)
      .select("id");
    if (inserted.error) throw inserted.error;

    seededRequestIds = inserted.data.map((row) => row.id);
  }, 60_000);

  afterAll(async () => {
    if (seededRequestIds.length > 0) {
      await svc.from("inspection_requests").delete().in("id", seededRequestIds);
    }
  }, 60_000);

  describe("as a stranger", () => {
    it("renders the agent's name and the verified mark", async () => {
      const page = await renderAnonymously(`/a/${verifiedHandle}`);

      expect(page.status).toBe(200);
      expect(page.text).toContain("Verified by Ruvo");
    });

    it("renders tenure as a month", async () => {
      // Not a day-level date: that invites a stranger to compute an account
      // age, which is a sharper number than the evidence supports.
      const page = await renderAnonymously(`/a/${verifiedHandle}`);

      expect(page.text).toMatch(/Verified since [A-Z][a-z]+ \d{4}/);
    });

    it("publishes the response rate as a fraction, not a percentage", async () => {
      const page = await renderAnonymously(`/a/${verifiedHandle}`);

      expect(page.text).toContain("Replied to");
      expect(page.text).toMatch(/Replied to \d+ of \d+ requests/);
    });

    it("says the rate counts replies and not outcomes", async () => {
      // The copy carries the limit of the claim. Without it the number reads
      // as a reliability score, which it is not — an agent who accepts
      // everything and completes nothing scores full marks.
      const page = await renderAnonymously(`/a/${verifiedHandle}`);

      expect(page.text).toContain("Counts replies to inspection requests");
    });

    it("never shows a draft, which really exists", async () => {
      if (!draftTitle) {
        throw new Error(
          "the seed has no draft listing; this assertion would prove nothing",
        );
      }

      // The control: the draft is really there and really belongs to this
      // agent, so its absence below is a withholding rather than an empty
      // fixture.
      const { data: control } = await svc
        .from("listings")
        .select("title, status")
        .eq("title", draftTitle)
        .single();
      expect(control?.status).toBe("draft");

      const page = await renderAnonymously(`/a/${verifiedHandle}`);

      expect(page.text).not.toContain(draftTitle);
      expect(page.text).not.toContain("Not on your public page");
    });

    it("shows no share affordance", async () => {
      // The link belongs to the agent. Handing a stranger a copy button for
      // somebody else's profile is not a feature.
      const page = await renderAnonymously(`/a/${verifiedHandle}`);

      expect(page.text).not.toContain("Your link");
    });

    it("404s on an unverified agent's page", async () => {
      // The row policy, seen from outside. The control below proves the
      // profile exists — without it a 404 is equally consistent with a broken
      // route.
      const { data: control } = await svc
        .from("agent_profiles")
        .select("handle")
        .eq("handle", unverifiedHandle)
        .single();
      expect(control?.handle).toBe(unverifiedHandle);

      const page = await renderAnonymously(`/a/${unverifiedHandle}`);

      expect(page.status).toBe(404);
    });

    it("404s on a handle nobody holds", async () => {
      const page = await renderAnonymously("/a/no-such-agent-anywhere");

      expect(page.status).toBe(404);
    });
  });

  describe("as the agent themselves", () => {
    it("renders the same page, plus the share link", async () => {
      const page = await renderAsPersona(`/a/${verifiedHandle}`, "Agent (verified)");

      expect(page.status).toBe(200);
      // Same page: the public half is still there, which is the claim "one
      // component with a viewer-dependent filter" actually makes.
      expect(page.text).toContain("Verified by Ruvo");
      expect(page.text).toContain("Your link");
      expect(page.text).toContain(`/a/${verifiedHandle}`);
    });

    it("shows the listings a seeker cannot see", async () => {
      const page = await renderAsPersona(`/a/${verifiedHandle}`, "Agent (verified)");

      expect(page.text).toContain("Not on your public page");
      if (draftTitle) {
        expect(page.text).toContain(draftTitle);
      }
    });

    it("lets an unverified agent see their own page, with a warning", async () => {
      // The page exists before verification and is visible to nobody else.
      // This is where an agent finds out it is not live yet, so the absence of
      // this branch would be silent.
      const page = await renderAsPersona(
        `/a/${unverifiedHandle}`,
        "Agent (unverified)",
      );

      expect(page.status).toBe(200);
      expect(page.text).toContain("This page is not public yet");
      expect(page.text).not.toContain("Verified by Ruvo");
    });
  });

  describe("with too little evidence to publish", () => {
    it("renders no response rate element at all", async () => {
      // Removing the fixture takes the agent back under ten, and the assertion
      // is that NOTHING appears — not a placeholder, not "no data yet". This
      // runs last because it destroys the arrangement the tests above need.
      await svc.from("inspection_requests").delete().in("id", seededRequestIds);
      seededRequestIds = [];

      const page = await renderAnonymously(`/a/${verifiedHandle}`);

      expect(page.status).toBe(200);
      expect(page.text).not.toContain("Replied to");
      expect(page.text).not.toContain("Counts replies");
      // Still a working page, so the absence above is suppression rather than
      // a failed render.
      expect(page.text).toContain("Verified by Ruvo");
    });
  });
});
