/**
 * The shared identity fixture.
 *
 * WHY THIS EXISTS: Clerk's Backend API rate-limits.
 *
 * This is not a tidiness preference. Every integration suite used to mint its
 * own probe users, which came to nineteen `POST /users` calls and nineteen
 * `POST /sessions` calls inside about fifteen seconds. Clerk answered with
 * HTTP 429 `too_many_requests`, and because the calls sit in `beforeAll`, a
 * refusal took a whole suite down with it — reporting its tests as *skipped*,
 * which reads as a deliberate gate rather than a failure.
 *
 * It was intermittent, and it moved: one CI run lost four tests, the next lost
 * thirteen from two different files, on identical code. Diagnosing it cost two
 * full runs.
 *
 * So the cast below is created ONCE per run and shared by every suite. Do not
 * reintroduce per-suite user creation. It will appear to work locally, where
 * one suite runs at a time against a warm instance, and it will fail in CI
 * against a fresh one — which is exactly how this was found the first time.
 *
 * Retries and backoff are deliberately not the answer here: spending more calls
 * to survive spending too many treats the symptom. Fewer identities is the fix,
 * and it is also closer to how the application behaves, where a small set of
 * real people accumulate domain data over time.
 *
 * WHAT THIS OWNS vs WHAT A SUITE OWNS
 *
 * This fixture owns identity, both halves of it: the Clerk user and its
 * `public.users` row, plus the `user_roles` grant. They persist for the whole
 * run.
 *
 * A suite owns its own domain data — agent profiles, listings, submissions,
 * chats — and must delete it in `afterAll`. `agent_profiles.user_id` is UNIQUE,
 * so a suite that leaves a profile behind breaks the next suite that needs one
 * for the same agent. Suites run sequentially (`fileParallelism: false`), which
 * makes that safe only for as long as everyone cleans up after themselves.
 */
import { inject } from "vitest";

/** A cast member. Superset of ProbeUser, so it works with mintFreshToken. */
export type CastMember = {
  clerkUserId: string;
  email: string;
  sessionId: string;
  /** The `public.users` row id, seeded alongside the Clerk user. */
  userId: string;
};

/**
 * The cast.
 *
 * Five rather than four. `otherSeeker` is not decoration: the inspection and
 * saved-listing policies have to prove that a *different ordinary user* is
 * refused, which an agent or an admin cannot stand in for without changing what
 * the test proves.
 */
export type Cast = {
  seeker: CastMember;
  otherSeeker: CastMember;
  owningAgent: CastMember;
  otherAgent: CastMember;
  admin: CastMember;
};

export type CastRole = keyof Cast;

export const CAST_ROLES: readonly CastRole[] = [
  "seeker",
  "otherSeeker",
  "owningAgent",
  "otherAgent",
  "admin",
];

/** The app-level role each cast member holds in `user_roles`. */
export const CAST_APP_ROLE: Record<CastRole, "student" | "agent" | "admin"> = {
  admin: "admin",
  otherAgent: "agent",
  otherSeeker: "student",
  owningAgent: "agent",
  seeker: "student",
};

/**
 * Identifiable in the Clerk dashboard.
 *
 * A cancelled run leaves its cast behind — teardown never gets to run — so
 * orphans are expected. The prefix and the run id are what make them findable
 * and safe to bulk-delete, and `+clerk_test` keeps them out of verification
 * exactly as the local dev personas do.
 */
export function castEmail(role: CastRole, runId: string) {
  return `ruvo-ci-${role}-${runId}+clerk_test@example.com`;
}

declare module "vitest" {
  export interface ProvidedContext {
    cast: Cast;
  }
}

/**
 * The cast, for use inside a hook or a test.
 *
 * Never call this in a describe body: Vitest evaluates those during collection
 * even for a skipped suite, which is the same trap that turned a missing
 * credential into a collection failure.
 */
export function getCast(): Cast {
  const cast = inject("cast");

  if (!cast) {
    throw new Error(
      "The shared cast was not provided. test/global-setup.ts creates it, and " +
        "only when rlsIntegrationEnabled() is true — a suite reaching this " +
        "point without credentials should have skipped.",
    );
  }

  return cast;
}
