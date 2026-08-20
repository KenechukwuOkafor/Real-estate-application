/**
 * Media storage security.
 *
 * Storage policies are separate from table RLS, so these exercise
 * storage.objects directly. Every denial pairs with a service-role control
 * proving the object exists and is being withheld — a missing object and a
 * refused one are indistinguishable from the client otherwise.
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

const IMAGES = "property-images";
const DOCS = "verification-documents";

/** Real WEBP bytes so the bucket's MIME allowlist accepts the upload. */
const WEBP = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");

suite("media storage policies", () => {
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

  let agentA: CastMember;
  let agentB: CastMember;
  let admin: CastMember;
  let profileAId: string;
  let profileBId: string;

  let approvedListingId: string;
  let draftListingId: string;
  let rejectedListingId: string;
  let approvedPath: string;
  let draftPath: string;
  let rejectedPath: string;
  let documentPath: string;

  // The user and its role come from the shared cast; only the profile is this
  // suite's to create. See test/helpers/cast.ts.
  async function seedProfile(userId: string, name: string) {
    const { data: profile, error } = await svc
      .from("agent_profiles")
      .insert({ display_name: name, user_id: userId })
      .select("id")
      .single();
    if (error) throw error;
    return profile.id;
  }

  async function seedListing(profileId: string, status: string) {
    const { data, error } = await svc
      .from("listings")
      .insert({
        agent_profile_id: profileId,
        area: "Odenigbo",
        bathrooms: 1,
        bedrooms: 1,
        description: "Media policy fixture.",
        price_naira: 250000,
        property_type: "self_contain",
        rental_duration: "yearly",
        slug: `media-${status}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: status as "draft",
        title: `Media fixture ${status}`,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async function putObject(bucket: string, path: string) {
    const { error } = await svc.storage
      .from(bucket)
      .upload(path, WEBP, { contentType: "image/webp", upsert: true });
    if (error) throw error;
  }

  beforeAll(async () => {
    const cast = getCast();
    agentA = cast.owningAgent;
    agentB = cast.otherAgent;
    admin = cast.admin;

    profileAId = await seedProfile(agentA.userId, "Media Agent A");
    profileBId = await seedProfile(agentB.userId, "Media Agent B");

    draftListingId = await seedListing(profileAId, "draft");
    rejectedListingId = await seedListing(profileAId, "rejected");
    approvedListingId = await seedListing(profileAId, "draft");

    draftPath = `listings/${draftListingId}/01992a11-0001-7000-8000-00000000d001.webp`;
    rejectedPath = `listings/${rejectedListingId}/01992a11-0002-7000-8000-00000000d002.webp`;
    approvedPath = `listings/${approvedListingId}/01992a11-0003-7000-8000-00000000d003.webp`;
    documentPath = `verification/${profileAId}/01992a11-0004-7000-8000-00000000d004.webp`;

    await putObject(IMAGES, draftPath);
    await putObject(IMAGES, rejectedPath);
    await putObject(IMAGES, approvedPath);
    await putObject(DOCS, documentPath);

    // The approved listing needs a cover before it may go live (BR-MEDIA-006).
    const { data: image, error: imageError } = await svc
      .from("listing_images")
      .insert({
        is_cover: true,
        listing_id: approvedListingId,
        mime_type: "image/webp",
        position: 0,
        size_bytes: WEBP.length,
        storage_path: approvedPath,
      })
      .select("id")
      .single();
    if (imageError) throw imageError;

    await svc
      .from("listings")
      .update({ cover_image_id: image.id, status: "approved" })
      .eq("id", approvedListingId);
  });

  afterAll(async () => {
    await svc.storage.from(IMAGES).remove([draftPath, rejectedPath, approvedPath]);
    await svc.storage.from(DOCS).remove([documentPath]);
    for (const id of [approvedListingId, draftListingId, rejectedListingId]) {
      if (!id) continue;
      await svc.from("listings").update({ cover_image_id: null, status: "draft" }).eq("id", id);
      await svc.from("listing_images").delete().eq("listing_id", id);
      await svc.from("listings").delete().eq("id", id);
    }
    // Domain data only; the cast outlives this suite. agent_profiles.user_id is
    // UNIQUE, so a leftover profile breaks the next suite that needs one.
    for (const id of [profileAId, profileBId]) {
      if (id) await svc.from("agent_profiles").delete().eq("id", id);
    }
  });

  describe("controls", () => {
    it("every fixture object exists", async () => {
      for (const [bucket, path] of [
        [IMAGES, approvedPath],
        [IMAGES, draftPath],
        [IMAGES, rejectedPath],
        [DOCS, documentPath],
      ] as const) {
        const { data, error } = await svc.storage
          .from(bucket)
          .createSignedUrl(path, 60);
        expect(error, `${bucket}/${path}`).toBeNull();
        expect(data?.signedUrl).toBeTruthy();
      }
    });

    it("neither bucket is public", async () => {
      // A public bucket serves /object/public/...; a private one refuses.
      // This is the exposure the slice closes, so it is asserted directly
      // rather than inferred from the bucket row.
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
      for (const [bucket, path] of [
        [IMAGES, approvedPath],
        [DOCS, documentPath],
      ] as const) {
        const response = await fetch(`${base}/storage/v1/object/public/${bucket}/${path}`);
        expect(response.ok, `${bucket} public read`).toBe(false);
      }
    });
  });

  describe("verification documents", () => {
    it("an anonymous caller cannot read one", async () => {
      const { data, error } = await asAnon()
        .storage.from(DOCS)
        .createSignedUrl(documentPath, 60);

      expect(data?.signedUrl ?? null).toBeNull();
      expect(error).not.toBeNull();

      const { data: control } = await svc.storage
        .from(DOCS)
        .createSignedUrl(documentPath, 60);
      expect(control?.signedUrl).toBeTruthy();
    });

    it("an anonymous caller cannot fetch one by URL", async () => {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const response = await fetch(
        `${base}/storage/v1/object/public/${DOCS}/${documentPath}`,
      );

      expect(response.ok).toBe(false);
    });

    it("another agent cannot read it", async () => {
      const { data } = await asUser(await mintFreshToken(agentB))
        .storage.from(DOCS)
        .createSignedUrl(documentPath, 60);

      expect(data?.signedUrl ?? null).toBeNull();

      const { data: control } = await svc.storage
        .from(DOCS)
        .createSignedUrl(documentPath, 60);
      expect(control?.signedUrl).toBeTruthy();
    });

    it("the owning agent can read their own", async () => {
      const { data } = await asUser(await mintFreshToken(agentA))
        .storage.from(DOCS)
        .createSignedUrl(documentPath, 60);

      expect(data?.signedUrl).toBeTruthy();
    });

    it("an admin can read it, and the URL actually resolves", async () => {
      const { data } = await asUser(await mintFreshToken(admin))
        .storage.from(DOCS)
        .createSignedUrl(documentPath, 60);

      expect(data?.signedUrl).toBeTruthy();

      const response = await fetch(data!.signedUrl);
      expect(response.status).toBe(200);
    });

    it("the signed URL carries a short expiry", async () => {
      const { data } = await asUser(await mintFreshToken(admin))
        .storage.from(DOCS)
        .createSignedUrl(documentPath, 60);

      const token = new URL(data!.signedUrl, "http://localhost").searchParams.get("token");
      const claims = JSON.parse(
        Buffer.from(token!.split(".")[1], "base64").toString("utf8"),
      );

      expect(claims.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(61);
    });
  });

  describe("listing images", () => {
    it("an anonymous visitor can read an approved listing's image", async () => {
      const { data } = await asAnon()
        .storage.from(IMAGES)
        .createSignedUrl(approvedPath, 3600);

      expect(data?.signedUrl).toBeTruthy();

      const response = await fetch(data!.signedUrl);
      expect(response.status).toBe(200);
    });

    it("an anonymous caller cannot read a draft listing's image", async () => {
      const { data } = await asAnon()
        .storage.from(IMAGES)
        .createSignedUrl(draftPath, 3600);

      expect(data?.signedUrl ?? null).toBeNull();

      const { data: control } = await svc.storage
        .from(IMAGES)
        .createSignedUrl(draftPath, 60);
      expect(control?.signedUrl).toBeTruthy();
    });

    it("an anonymous caller cannot read a rejected listing's image", async () => {
      const { data } = await asAnon()
        .storage.from(IMAGES)
        .createSignedUrl(rejectedPath, 3600);

      expect(data?.signedUrl ?? null).toBeNull();

      const { data: control } = await svc.storage
        .from(IMAGES)
        .createSignedUrl(rejectedPath, 60);
      expect(control?.signedUrl).toBeTruthy();
    });

    it("another agent cannot read a draft image", async () => {
      const { data } = await asUser(await mintFreshToken(agentB))
        .storage.from(IMAGES)
        .createSignedUrl(draftPath, 3600);

      expect(data?.signedUrl ?? null).toBeNull();
    });

    it("the owning agent can read their own draft image", async () => {
      const { data } = await asUser(await mintFreshToken(agentA))
        .storage.from(IMAGES)
        .createSignedUrl(draftPath, 3600);

      expect(data?.signedUrl).toBeTruthy();
    });

    it("an admin can read a draft image for moderation", async () => {
      const { data } = await asUser(await mintFreshToken(admin))
        .storage.from(IMAGES)
        .createSignedUrl(draftPath, 3600);

      expect(data?.signedUrl).toBeTruthy();
    });
  });

  describe("bucket-level upload validation", () => {
    it("refuses a disallowed MIME type at the bucket", async () => {
      const { error } = await svc.storage
        .from(IMAGES)
        .upload(
          `listings/${draftListingId}/01992a11-0009-7000-8000-00000000d009.webp`,
          Buffer.from("#!/bin/sh\necho pwned\n"),
          { contentType: "application/x-sh", upsert: true },
        );

      // Service role bypasses RLS but not the bucket's allowed_mime_types.
      expect(error).not.toBeNull();
      expect(String(error?.message)).toMatch(/mime|type/i);
    });

    it("refuses an oversized upload at the bucket", async () => {
      const oversized = Buffer.alloc(11 * 1024 * 1024, 1);

      const { error } = await svc.storage
        .from(IMAGES)
        .upload(
          `listings/${draftListingId}/01992a11-0010-7000-8000-00000000d010.webp`,
          oversized,
          { contentType: "image/webp", upsert: true },
        );

      expect(error).not.toBeNull();
      expect(String(error?.message)).toMatch(/size|large|exceed/i);
    });

    it("refuses an executable in the documents bucket", async () => {
      const { error } = await svc.storage
        .from(DOCS)
        .upload(
          `verification/${profileAId}/01992a11-0011-7000-8000-00000000d011.webp`,
          Buffer.from("MZ\x90\x00"),
          { contentType: "application/x-msdownload", upsert: true },
        );

      expect(error).not.toBeNull();
    });
  });

  describe("BR-MEDIA-004: no original filenames in storage paths", () => {
    it("every stored object name is uuidv7.ext", async () => {
      const { data: rows, error: rowsError } = await svc
        .from("listing_images")
        .select("storage_path");
      const { data: documents, error: documentsError } = await svc
        .from("verification_documents")
        .select("storage_path");

      // Assert the reads succeeded before asserting on their contents. Without
      // this the test passes vacuously when service_role lacks a grant: the
      // error is ignored, data is null, and an empty loop asserts nothing.
      expect(rowsError).toBeNull();
      expect(documentsError).toBeNull();
      expect(rows?.length ?? 0).toBeGreaterThan(0);

      const uuidv7File =
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/;

      for (const row of [...(rows ?? []), ...(documents ?? [])]) {
        const fileName = row.storage_path.split("/").pop() ?? "";
        expect(fileName, row.storage_path).toMatch(uuidv7File);
      }
    });
  });
});
