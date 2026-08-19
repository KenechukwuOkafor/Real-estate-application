/**
 * RLS group 5: saved_listings, reports, audit_logs, user_roles,
 * subscriptions, users.
 *
 * Denials paired with service-role controls throughout.
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

suite("RLS: remaining tables", () => {
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

  let userA: CastMember;
  let userB: CastMember;
  let admin: CastMember;
  let listingId: string;
  let savedId: string;
  let reportId: string;
  let auditId: string;

  beforeAll(async () => {
    // Identities from the shared cast. Both ordinary users are seekers: the
    // point of userB is that one user cannot read another's saved listings.
    const cast = getCast();
    userA = cast.seeker;
    userB = cast.otherSeeker;
    admin = cast.admin;

    const { data: listing } = await svc
      .from("listings")
      .select("id")
      .eq("status", "approved")
      .limit(1)
      .single();
    listingId = listing!.id;

    const { data: saved, error: savedError } = await svc
      .from("saved_listings")
      .insert({ listing_id: listingId, user_id: userA.userId })
      .select("id")
      .single();
    if (savedError) throw savedError;
    savedId = saved.id;

    const { data: report, error: reportError } = await svc
      .from("reports")
      .insert({
        reason: "Private report by user A.",
        reporter_user_id: userA.userId,
        target_id: listingId,
        target_type: "listing",
      })
      .select("id")
      .single();
    if (reportError) throw reportError;
    reportId = report.id;

    const { data: audit, error: auditError } = await svc
      .from("audit_logs")
      .insert({
        action: "test.rls_probe",
        actor_user_id: userA.userId,
        entity_id: listingId,
        entity_type: "listing",
      })
      .select("id")
      .single();
    if (auditError) throw auditError;
    auditId = audit.id;
  });

  afterAll(async () => {
    if (auditId) await svc.from("audit_logs").delete().eq("id", auditId);
    if (reportId) await svc.from("reports").delete().eq("id", reportId);
    if (savedId) await svc.from("saved_listings").delete().eq("id", savedId);
    // Domain data only; the cast's users and roles outlive this suite. Saved
    // listings are cleared per cast member because a test may create its own.
    for (const member of [userA, userB, admin]) {
      if (member?.userId) {
        await svc.from("saved_listings").delete().eq("user_id", member.userId);
      }
    }
  });

  describe("saved_listings", () => {
    it("the owner reads their own save", async () => {
      const { data } = await asUser(await mintFreshToken(userA))
        .from("saved_listings")
        .select("id")
        .eq("id", savedId);
      expect(data).toHaveLength(1);
    });

    it("another user cannot read it", async () => {
      const { data } = await asUser(await mintFreshToken(userB))
        .from("saved_listings")
        .select("id")
        .eq("id", savedId);
      expect(data).toEqual([]);

      const { data: control } = await svc
        .from("saved_listings")
        .select("id")
        .eq("id", savedId);
      expect(control).toHaveLength(1);
    });

    it("another user cannot delete it", async () => {
      await asUser(await mintFreshToken(userB))
        .from("saved_listings")
        .delete()
        .eq("id", savedId);

      const { data: control } = await svc
        .from("saved_listings")
        .select("id")
        .eq("id", savedId);
      expect(control).toHaveLength(1);
    });

    it("a user cannot save on someone else's behalf", async () => {
      const { error } = await asUser(await mintFreshToken(userB))
        .from("saved_listings")
        .insert({ listing_id: listingId, user_id: userA.userId });
      expect(error).not.toBeNull();
    });
  });

  describe("reports", () => {
    it("the reporter reads their own report", async () => {
      const { data } = await asUser(await mintFreshToken(userA))
        .from("reports")
        .select("id")
        .eq("id", reportId);
      expect(data).toHaveLength(1);
    });

    it("another user cannot read it", async () => {
      const { data } = await asUser(await mintFreshToken(userB))
        .from("reports")
        .select("id, reason")
        .eq("id", reportId);
      expect(data).toEqual([]);

      const { data: control } = await svc
        .from("reports")
        .select("id")
        .eq("id", reportId);
      expect(control).toHaveLength(1);
    });

    it("an admin reads every report", async () => {
      const { data } = await asUser(await mintFreshToken(admin))
        .from("reports")
        .select("id")
        .eq("id", reportId);
      expect(data).toHaveLength(1);
    });

    it("a user cannot resolve a report", async () => {
      await asUser(await mintFreshToken(userA))
        .from("reports")
        .update({ status: "resolved" })
        .eq("id", reportId);

      const { data: control } = await svc
        .from("reports")
        .select("status")
        .eq("id", reportId)
        .single();
      expect(control?.status).toBe("open");
    });

    it("a user cannot file a report as someone else", async () => {
      const { error } = await asUser(await mintFreshToken(userB))
        .from("reports")
        .insert({
          reason: "Filed in another user's name.",
          reporter_user_id: userA.userId,
          target_id: listingId,
          target_type: "listing",
        });
      expect(error).not.toBeNull();
    });
  });

  describe("audit_logs", () => {
    it("a non-admin cannot read audit logs", async () => {
      const { data } = await asUser(await mintFreshToken(userA))
        .from("audit_logs")
        .select("id")
        .eq("id", auditId);
      expect(data).toEqual([]);

      const { data: control } = await svc
        .from("audit_logs")
        .select("id")
        .eq("id", auditId);
      expect(control).toHaveLength(1);
    });

    it("an admin can read them", async () => {
      const { data } = await asUser(await mintFreshToken(admin))
        .from("audit_logs")
        .select("id")
        .eq("id", auditId);
      expect(data).toHaveLength(1);
    });

    it("nobody can forge an audit entry", async () => {
      // BR-RLS-005: append-only, and the append is the system's, not the
      // user's. No INSERT grant means a user cannot fabricate the record of
      // their own actions.
      const { error } = await asUser(await mintFreshToken(admin))
        .from("audit_logs")
        .insert({
          action: "forged.entry",
          actor_user_id: admin.userId,
          entity_id: listingId,
          entity_type: "listing",
        });
      expect(error).not.toBeNull();
    });

    it("an admin cannot rewrite history", async () => {
      await asUser(await mintFreshToken(admin))
        .from("audit_logs")
        .update({ action: "tampered" })
        .eq("id", auditId);

      const { data: control } = await svc
        .from("audit_logs")
        .select("action")
        .eq("id", auditId)
        .single();
      expect(control?.action).toBe("test.rls_probe");
    });

    it("an admin cannot delete history", async () => {
      await asUser(await mintFreshToken(admin))
        .from("audit_logs")
        .delete()
        .eq("id", auditId);

      const { data: control } = await svc
        .from("audit_logs")
        .select("id")
        .eq("id", auditId);
      expect(control).toHaveLength(1);
    });
  });

  describe("user_roles", () => {
    it("a user reads their own roles", async () => {
      const { data } = await asUser(await mintFreshToken(userA))
        .from("user_roles")
        .select("role")
        .eq("user_id", userA.userId);
      expect(data).toHaveLength(1);
      expect(data?.[0].role).toBe("student");
    });

    it("a user cannot read another user's roles", async () => {
      const { data } = await asUser(await mintFreshToken(userA))
        .from("user_roles")
        .select("role")
        .eq("user_id", admin.userId);
      expect(data).toEqual([]);
    });

    it("a user cannot promote themselves to admin", async () => {
      const { error } = await asUser(await mintFreshToken(userA))
        .from("user_roles")
        .insert({ role: "admin", user_id: userA.userId });
      expect(error).not.toBeNull();

      const { data: control } = await svc
        .from("user_roles")
        .select("role")
        .eq("user_id", userA.userId);
      expect(control).toHaveLength(1);
      expect(control?.[0].role).toBe("student");
    });
  });

  describe("users", () => {
    it("a user reads only themselves", async () => {
      const { data } = await asUser(await mintFreshToken(userA))
        .from("users")
        .select("id, email");
      expect(data).toHaveLength(1);
      expect(data?.[0].id).toBe(userA.userId);
    });

    it("an anonymous caller reads no users at all", async () => {
      const { data } = await asAnon().from("users").select("id");
      expect(data ?? []).toEqual([]);
    });

    it("a user cannot repoint their clerk_user_id at another identity", async () => {
      await asUser(await mintFreshToken(userA))
        .from("users")
        .update({ clerk_user_id: userB.clerkUserId })
        .eq("id", userA.userId);

      const { data: control } = await svc
        .from("users")
        .select("clerk_user_id")
        .eq("id", userA.userId)
        .single();
      expect(control?.clerk_user_id).toBe(userA.clerkUserId);
    });
  });
});
