import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { AppError } from "@/lib/api/errors";

/**
 * Authorizes a drain invocation.
 *
 * A shared secret in a header, not a Clerk session.
 *
 * The caller is a scheduler, not a person. It has no browser, no cookie jar and
 * no way to complete an interactive sign-in, so a Clerk session is the wrong
 * shape — and minting a long-lived one for a machine would be the worse
 * credential, because it would carry a user identity that RLS policies would
 * then evaluate against.
 *
 * ADR-032 requires only that the route "is authenticated and cannot be invoked
 * by an anonymous caller". This is the smallest credential that fits a machine
 * caller.
 *
 * Fails closed when unset. An unconfigured secret must never mean an open
 * endpoint: that would turn a deployment mistake into a publicly drainable
 * queue, and the drain executes with the service-role key.
 */
export function assertDrainRequestAuthorized(request: Request) {
  const expected = process.env.JOBS_DRAIN_SECRET;

  if (!expected) {
    throw new AppError(
      "JOBS_DRAIN_SECRET_UNSET",
      "JOBS_DRAIN_SECRET is not configured, so the drain route refuses every request. Set it in the environment and pass it as `Authorization: Bearer <secret>`. It is deliberately not optional: the drain executes with the service-role key.",
      500,
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!constantTimeEquals(presented, expected)) {
    throw new AppError(
      "UNAUTHENTICATED",
      "The job drain route requires a bearer token matching JOBS_DRAIN_SECRET.",
      401,
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
