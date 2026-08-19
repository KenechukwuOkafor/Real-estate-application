import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";

/**
 * Clerk is the only identity path.
 *
 * This file used to carry a parallel dev-auth branch that synthesised an auth
 * state and a fake Clerk user from an unsigned cookie. That is gone: the dev
 * persona switcher now mints a real Clerk sign-in token and the browser
 * exchanges it for a genuine session, so there is nothing here to special-case.
 *
 * Removing it is a security improvement as well as a simplification — the
 * synthesised branch was a code path that produced an "authenticated" caller
 * without Clerk ever having verified anything.
 */

export async function getAuthContext() {
  const authState = await auth();

  return {
    orgId: authState.orgId,
    sessionId: authState.sessionId,
    userId: authState.userId,
  };
}

export async function requireAuthenticatedUser() {
  const authState = await auth();

  if (!authState.userId) {
    throw new Error("Unauthenticated request.");
  }

  return authState;
}

/**
 * The caller's raw Clerk session JWT, or null when there isn't one.
 *
 * This is what createSupabaseAuthenticatedClient sends to PostgREST so that
 * `auth.jwt() ->> 'sub'` resolves inside RLS policies. Every session reaching
 * here is a real Clerk session, including the dev personas.
 */
export async function getCurrentSessionToken() {
  const authState = await auth();

  if (!authState.userId) {
    return null;
  }

  return authState.getToken();
}

export async function getCurrentClerkUser() {
  return currentUser();
}
