import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import {
  DEV_AUTH_COOKIE_NAME,
  getDevAuthUserByClerkUserId,
  isDevAuthEnabled,
} from "@/lib/auth/dev-auth";

async function getDevAuthContext() {
  if (!isDevAuthEnabled()) {
    return null;
  }

  const cookieStore = await cookies();
  const clerkUserId = cookieStore.get(DEV_AUTH_COOKIE_NAME)?.value ?? null;
  const devUser = getDevAuthUserByClerkUserId(clerkUserId);

  if (!devUser) {
    return null;
  }

  return {
    orgId: null,
    sessionId: `dev-session:${devUser.clerkUserId}`,
    userId: devUser.clerkUserId,
  };
}

export async function getAuthContext() {
  const authState = await auth();

  if (!authState.userId) {
    const devAuthState = await getDevAuthContext();

    if (devAuthState) {
      return devAuthState;
    }
  }

  return {
    userId: authState.userId,
    sessionId: authState.sessionId,
    orgId: authState.orgId,
  };
}

export async function requireAuthenticatedUser() {
  const authState = await auth();

  if (!authState.userId) {
    const devAuthState = await getDevAuthContext();

    if (devAuthState) {
      return devAuthState;
    }

    throw new Error("Unauthenticated request.");
  }

  return authState;
}

export async function getCurrentClerkUser() {
  const devAuthState = await getDevAuthContext();

  if (devAuthState) {
    const devUser = getDevAuthUserByClerkUserId(devAuthState.userId);

    if (devUser) {
      return {
        emailAddresses: [
          {
            emailAddress: devUser.email,
            id: `${devUser.clerkUserId}:email`,
          },
        ],
        firstName: devUser.fullName.split(" ")[0] ?? null,
        id: devUser.clerkUserId,
        imageUrl: null,
        lastName: devUser.fullName.split(" ").slice(1).join(" ") || null,
        phoneNumbers: [],
        primaryEmailAddressId: `${devUser.clerkUserId}:email`,
        primaryPhoneNumberId: null,
        username: devUser.email.split("@")[0] ?? null,
      } as unknown as Awaited<ReturnType<typeof currentUser>>;
    }
  }

  return currentUser();
}
