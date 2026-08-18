import { beforeEach, describe, expect, it } from "vitest";

import {
  assertSessionTokenHasRoleClaim,
  resetRoleClaimVerificationForTests,
} from "@/lib/auth/verify-role-claim";

function tokenWith(payload: Record<string, unknown>) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

beforeEach(() => {
  resetRoleClaimVerificationForTests();
});

describe("assertSessionTokenHasRoleClaim", () => {
  it("accepts a token carrying role=authenticated", () => {
    expect(() =>
      assertSessionTokenHasRoleClaim(tokenWith({ role: "authenticated", sub: "user_1" })),
    ).not.toThrow();
  });

  it("rejects a token with no role claim, naming the dashboard setting", () => {
    let thrown: unknown;
    try {
      assertSessionTokenHasRoleClaim(tokenWith({ sub: "user_1" }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: "CLERK_ROLE_CLAIM_MISSING" });
    // The message must be actionable, not generic — that is the whole point.
    expect(String((thrown as Error).message)).toContain("Clerk Dashboard");
    expect(String((thrown as Error).message)).toContain("session token");
    // And it must name the symptom, so a reader connects it to what they see.
    expect(String((thrown as Error).message)).toContain("empty array");
  });

  it("rejects a role claim that is present but wrong", () => {
    expect(() =>
      assertSessionTokenHasRoleClaim(tokenWith({ role: "authenticaded", sub: "user_1" })),
    ).toThrow(/authenticaded/);
  });

  it("rejects a token that is not a JWT", () => {
    expect(() => assertSessionTokenHasRoleClaim("not-a-jwt")).toThrow(
      /could not be decoded/,
    );
  });

  it("verifies once per process, not once per request", () => {
    assertSessionTokenHasRoleClaim(tokenWith({ role: "authenticated", sub: "user_1" }));

    // A later token is not re-inspected. The claim is instance configuration,
    // so one confirmation is enough and per-request decoding would be waste.
    expect(() => assertSessionTokenHasRoleClaim("not-a-jwt")).not.toThrow();
  });

  it("does not latch until a token actually passes", () => {
    expect(() => assertSessionTokenHasRoleClaim(tokenWith({ sub: "user_1" }))).toThrow();
    // Still unverified, so the next bad token throws too rather than being
    // waved through by a flag set during the failure.
    expect(() => assertSessionTokenHasRoleClaim(tokenWith({ sub: "user_2" }))).toThrow();
  });
});
