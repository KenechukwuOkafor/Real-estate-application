import "server-only";

import { AppError } from "@/lib/api/errors";

/**
 * Verifies the Clerk session token carries `role: "authenticated"`.
 *
 * This is the highest-consequence piece of configuration that cannot live in
 * this repository. The claim is added in the Clerk Dashboard under session
 * token customization; nothing in the codebase can create it, and
 * scripts/setup-clerk-personas.mjs does not add it either. Provisioning a Clerk
 * instance is two steps and only one of them is code.
 *
 * Without the claim, PostgREST never switches to the `authenticated` Postgres
 * role. Every RLS policy then evaluates against no identity, every ownership
 * predicate is false, and every authenticated query returns HTTP 200 with an
 * empty array — which is indistinguishable from a policy that is working
 * correctly and denying access. That is the specific failure mode worth a day
 * of someone's life, and the reason a generic auth error is not good enough.
 *
 * Checked once per process, not once per request. The first authenticated
 * request pays a base64 decode; every subsequent one pays nothing. See
 * assertSessionTokenHasRoleClaim for why this location was chosen.
 */
let roleClaimVerified = false;

/** Exposed for tests; production never needs to reset this. */
export function resetRoleClaimVerificationForTests() {
  roleClaimVerified = false;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.split(".");

  if (segments.length !== 3) {
    return null;
  }

  try {
    const padded = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(
      Buffer.from(padded, "base64").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const REMEDY = [
  "Clerk Dashboard -> Configure -> Sessions -> customize the session token, and add:",
  '  { "role": "authenticated" }',
  "",
  "Provisioning a Clerk instance is two steps:",
  "  1. node scripts/setup-clerk-personas.mjs   (creates the users)",
  "  2. add the role claim in the dashboard      (makes RLS work at all)",
].join("\n");

export function assertSessionTokenHasRoleClaim(token: string) {
  if (roleClaimVerified) {
    return;
  }

  const payload = decodeJwtPayload(token);

  if (!payload) {
    throw new AppError(
      "CLERK_SESSION_TOKEN_UNREADABLE",
      `The Clerk session token could not be decoded as a JWT, so its role claim cannot be verified.\n\n${REMEDY}`,
      500,
    );
  }

  if (!("role" in payload)) {
    throw new AppError(
      "CLERK_ROLE_CLAIM_MISSING",
      `The Clerk session token has no "role" claim, so Supabase will not assume the authenticated Postgres role. Every row-level-security policy will evaluate against no identity and every authenticated query will return an empty array — which looks exactly like a working policy denying access, not like a misconfiguration.\n\n${REMEDY}`,
      500,
    );
  }

  if (payload.role !== "authenticated") {
    throw new AppError(
      "CLERK_ROLE_CLAIM_UNEXPECTED",
      `The Clerk session token's "role" claim is ${JSON.stringify(payload.role)}, but Supabase requires exactly "authenticated". Postgres will attempt to assume a role of that name and the request will fail or silently match no rows.\n\n${REMEDY}`,
      500,
    );
  }

  roleClaimVerified = true;
}
