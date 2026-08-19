import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { AppError } from "@/lib/api/errors";

/**
 * Authorizes a machine caller — a scheduler, not a person.
 *
 * A shared secret in a header, not a Clerk session. The caller has no browser,
 * no cookie jar and no way to complete an interactive sign-in, and minting a
 * long-lived session for a machine would be the worse credential, because it
 * would carry a user identity that RLS policies would then evaluate against.
 *
 * `CRON_SECRET` is accepted alongside the named secret because that is the
 * header a platform scheduler injects into cron requests. Accepting either
 * means a schedule can be wired without duplicating one value into two places,
 * which is the kind of duplication that drifts.
 *
 * FAILS CLOSED when neither is set. An unconfigured secret must never mean an
 * open endpoint: that turns a deployment mistake into a publicly invokable
 * route, and these routes run with the service-role key.
 */
export function assertMachineRequestAuthorized(
  request: Request,
  secretEnvVar: string,
) {
  const accepted = [process.env[secretEnvVar], process.env.CRON_SECRET].filter(
    (value): value is string => Boolean(value),
  );

  if (accepted.length === 0) {
    throw new AppError(
      "JOBS_DRAIN_SECRET_UNSET",
      `${secretEnvVar} is not configured, so this route refuses every request. Set it in the environment and pass it as \`Authorization: Bearer <secret>\`. It is deliberately not optional: this route runs with the service-role key.`,
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!accepted.some((secret) => constantTimeEquals(presented, secret))) {
    throw new AppError(
      "UNAUTHENTICATED",
      `This route requires a bearer token matching ${secretEnvVar}.`,
    );
  }
}

/**
 * Length-independent constant-time comparison.
 *
 * timingSafeEqual throws when the buffers differ in length, and returning early
 * on that would leak the secret's length. Hashing both sides to a fixed width
 * first makes the comparison equal-length for any input.
 */
function constantTimeEquals(a: string, b: string) {
  const digest = (value: string) =>
    createHash("sha256").update(value, "utf8").digest();

  return timingSafeEqual(digest(a), digest(b));
}
