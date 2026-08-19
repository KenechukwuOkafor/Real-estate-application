import { AppError } from "@/lib/api/errors";

/**
 * A canonical UUID. Case-insensitive; version-agnostic, because the schema mixes
 * `gen_random_uuid()` (v4) and `public.uuidv7()`.
 */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * Reject a path segment that cannot be an identifier, before it reaches a query.
 *
 * Postgres raises 22P02 `invalid input syntax for type uuid` when a non-UUID is
 * compared against a uuid column. That surfaced as HTTP 500, because a
 * PostgrestError is a plain object rather than an Error instance and so falls
 * through resolveRouteError's message matching to INTERNAL_ERROR. A crawler
 * requesting a junk path was therefore indistinguishable from the database
 * being down.
 *
 * Two things were wrong with that, and this fixes both. A malformed identifier
 * is not a server fault, and a 500 says it is. And the round trip was wasted:
 * the value cannot match a uuid column, so the query could never have returned
 * a row.
 *
 * 404 rather than 400, deliberately. Several of these routes are reachable
 * without a session, and "no such resource" is the same answer whether the
 * identifier is malformed, well-formed but unknown, or real but withheld.
 * Distinguishing them would let an anonymous caller probe for existence.
 */
export function requireUuid(value: string | null | undefined, label: string) {
  if (!isUuid(value)) {
    throw new AppError("NOT_FOUND", `${label} not found.`, 404);
  }

  return value;
}
