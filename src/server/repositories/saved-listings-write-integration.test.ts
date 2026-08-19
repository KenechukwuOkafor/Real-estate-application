/**
 * Saving a listing under the real grants.
 *
 * Second instance of the same defect as upsertAgentProfile, found by auditing
 * every `.upsert()` in the codebase after the first one. Saving a listing failed
 * 42501 permission denied for every user, on every attempt, including the first
 * where no conflict was possible.
 *
 * `authenticated` holds INSERT and SELECT on saved_listings and no UPDATE at
 * all, which is correct: every column — id, user_id, listing_id, created_at —
 * is part of the fact being recorded, and the row's existence *is* the saved
 * state. The policies say the same thing, being SELECT, INSERT and DELETE with
 * no UPDATE. An upsert was conceptually wrong here, not merely incompatible.
 *
 * The second test is the one that matters for regression: it asserts the call is
 * idempotent, which is the only reason anyone reached for upsert in the first
 * place. Read-then-insert has to keep that property or the fix is not a fix.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { saveListing, unsaveListing } from "@/server/repositories/listings-repository";

import { type CastMember, getCast } from "../../../test/helpers/cast";
import { mintFreshToken } from "../../../test/helpers/clerk-tokens";
import {
  asServiceRole,
  asUser,
  rlsIntegrationEnabled,
} from "../../../test/helpers/rls-clients";

const suite = rlsIntegrationEnabled() ? describe : describe.skip;

suite("saving a listing as the user themselves", () => {
  let svc: ReturnType<typeof asServiceRole>;
  let seeker: CastMember;
  let listingId: string;

  beforeAll(async () => {
    svc = asServiceRole();
    seeker = getCast().seeker;

    const { data, error } = await svc
      .from("listings")
      .select("id")
      .eq("status", "approved")
      .is("deleted_at", null)
      .limit(1)
      .single();

    if (error) throw error;
    listingId = data.id;
  });

  async function cleanup() {
    await svc.from("saved_listings").delete().eq("user_id", seeker.userId);
  }

  async function countSaves() {
    const { count, error } = await svc
      .from("saved_listings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", seeker.userId)
      .eq("listing_id", listingId);

    if (error) throw error;
    return count ?? 0;
  }

  it("saves a listing", async () => {
    await cleanup();

    try {
      const saved = await saveListing(
        asUser(await mintFreshToken(seeker)),
        seeker.userId,
        listingId,
      );

      expect(saved.id).toBeTruthy();
      expect(await countSaves()).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it("is idempotent: saving twice leaves one row and returns the same id", async () => {
    await cleanup();

    try {
      const first = await saveListing(
        asUser(await mintFreshToken(seeker)),
        seeker.userId,
        listingId,
      );
      const second = await saveListing(
        asUser(await mintFreshToken(seeker)),
        seeker.userId,
        listingId,
      );

      expect(second.id).toBe(first.id);
      expect(await countSaves()).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it("unsaving removes it, and saving again works", async () => {
    await cleanup();

    try {
      const client = asUser(await mintFreshToken(seeker));
      await saveListing(client, seeker.userId, listingId);
      await unsaveListing(
        asUser(await mintFreshToken(seeker)),
        seeker.userId,
        listingId,
      );
      expect(await countSaves()).toBe(0);

      await saveListing(
        asUser(await mintFreshToken(seeker)),
        seeker.userId,
        listingId,
      );
      expect(await countSaves()).toBe(1);
    } finally {
      await cleanup();
    }
  });
});
