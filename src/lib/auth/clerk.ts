import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";

export async function getAuthContext() {
  const authState = await auth();

  return {
    userId: authState.userId,
    sessionId: authState.sessionId,
    orgId: authState.orgId,
  };
}

export async function requireAuthenticatedUser() {
  const authState = await auth();

  if (!authState.userId) {
    throw new Error("Unauthenticated request.");
  }

  return authState;
}

export async function getCurrentClerkUser() {
  return currentUser();
}
