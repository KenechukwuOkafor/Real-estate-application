/**
 * Local persona switcher.
 *
 * This used to be a second identity path: it set an unsigned cookie naming a
 * fabricated clerk id like `seed_clerk_agent_001` and the server treated that
 * as an authenticated session. That worked only because nothing downstream
 * needed a real token. Once RLS landed it stopped working entirely, and worse,
 * it failed *silently* — every policy compares against auth.jwt() ->> 'sub',
 * a fabricated id can never be a Clerk subject, so queries returned empty
 * arrays that read as "no data" rather than "your harness is broken".
 *
 * It now mints a real Clerk sign-in token for the persona and the browser
 * exchanges it for a genuine Clerk session. There is one identity path, and it
 * is the one production uses. The harness's remaining job is narrow and
 * legitimate: switch between four known personas without typing passwords.
 *
 * The personas are real Clerk users. Create or refresh them with:
 *   node scripts/setup-clerk-personas.mjs
 */

export const DEV_AUTH_USERS = [
  {
    clerkUserId: "user_3I4mLDbEmYlwFCbJPiDH6QyXGFL",
    description: "Seeker: browse listings, save homes, request inspections.",
    email: "ruvo_student+clerk_test@example.com",
    fullName: "Ruvo Student",
    label: "Student",
    roles: ["student"] as const,
  },
  {
    clerkUserId: "user_3I4mLJs1bll6JU2Lmw5AVZRGjT6",
    description: "Verified agent with 3 submission slots and the seeded listings.",
    email: "ruvo_agent_verified+clerk_test@example.com",
    fullName: "Prime Homes Nsukka",
    label: "Agent (verified)",
    roles: ["agent"] as const,
  },
  {
    clerkUserId: "user_3I4mLIZjqgtiIjofLtGll31QHhz",
    description: "Brand-new agent: unverified, no submission slots.",
    email: "ruvo_agent_new+clerk_test@example.com",
    fullName: "Campus Keys Property",
    label: "Agent (unverified)",
    roles: ["agent"] as const,
  },
  {
    clerkUserId: "user_3I4mLPZkVF2L6bCWweB2njatjhn",
    description: "Admin: moderation and verification review queues.",
    email: "ruvo_admin+clerk_test@example.com",
    fullName: "Ruvo Admin",
    label: "Admin",
    roles: ["admin"] as const,
  },
] as const;

export type DevAuthUser = (typeof DEV_AUTH_USERS)[number];

/**
 * Production short-circuits before any flag is read. Unchanged, deliberately:
 * this ordering is what makes ENABLE_DEV_AUTH unable to open a door in
 * production even if it is somehow set there.
 */
export function isDevAuthEnabled() {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return process.env.ENABLE_DEV_AUTH === "true";
}

export function getDevAuthUserByClerkUserId(clerkUserId: string | null | undefined) {
  if (!clerkUserId) {
    return null;
  }

  return DEV_AUTH_USERS.find((user) => user.clerkUserId === clerkUserId) ?? null;
}
