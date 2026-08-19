/**
 * Step 1 proof: a Clerk-issued JWT reaches auth.jwt() inside Postgres.
 *
 * This is the foundation every policy in this slice rests on. If the token
 * does not arrive, `auth.jwt() ->> 'sub'` is null, every ownership policy
 * evaluates false, and every table silently returns nothing — which looks
 * exactly like a correctly-denying policy. Proving the path independently,
 * before any policy exists, is what makes later failures diagnosable.
 *
 * Deliberately asserts on a value, not on a status code.
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  type CastMember,
  getCast,
} from "../../../../test/helpers/cast";
import {
  decodeJwtPayload,
  mintFreshToken,
} from "../../../../test/helpers/clerk-tokens";
import {
  asAnon,
  asUser,
  rlsIntegrationEnabled,
} from "../../../../test/helpers/rls-clients";

const suite = rlsIntegrationEnabled() ? describe : describe.skip;

suite("Clerk token path into Postgres", () => {
  // Borrowed from the shared cast rather than minted here. This suite creating
  // its own user is what earned the HTTP 429 that took all five of these tests
  // down. See test/helpers/cast.ts.
  //
  // Nothing to tear down: the cast outlives the suite, and this suite writes no
  // domain data of its own.
  let probe: CastMember;

  beforeAll(() => {
    probe = getCast().seeker;
  });

  it("mints a token whose sub is the Clerk user id", async () => {
    const token = await mintFreshToken(probe);
    const payload = decodeJwtPayload(token);

    expect(payload.sub).toBe(probe.clerkUserId);
  });

  it("carries role=authenticated so Postgres assumes the right role", async () => {
    const token = await mintFreshToken(probe);
    const payload = decodeJwtPayload(token);

    expect(payload.role).toBe("authenticated");
  });

  it("mints a distinct, short-lived token on every call", async () => {
    const first = await mintFreshToken(probe);
    const second = await mintFreshToken(probe);
    const payload = decodeJwtPayload(first);

    expect(first).not.toBe(second);
    expect((payload.exp as number) - (payload.iat as number)).toBe(60);
  });

  it("reaches auth.jwt() inside Postgres as the Clerk subject", async () => {
    const token = await mintFreshToken(probe);
    const { data, error } = await asUser(token).rpc("clerk_user_id");

    expect(error).toBeNull();
    expect(data).toBe(probe.clerkUserId);
  });

  it("yields a null subject for an anonymous caller", async () => {
    const { data, error } = await asAnon().rpc("clerk_user_id");

    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});
