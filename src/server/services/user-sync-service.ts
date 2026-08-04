import "server-only";

import type { User } from "@clerk/nextjs/server";

import { getCurrentClerkUser, requireAuthenticatedUser } from "@/lib/auth/clerk";
import { getSupabaseAdminClient } from "@/lib/db/supabase";
import {
  ensureUserRoles,
  getUserByClerkUserId,
  listUserRoles,
  upsertUserByClerkIdentity,
} from "@/server/repositories/users-repository";
import { writeAuditLog } from "@/server/services/audit-service";

function getPrimaryEmailAddress(user: User) {
  const primaryEmailId = user.primaryEmailAddressId;

  if (primaryEmailId) {
    const primaryEmail = user.emailAddresses.find(
      (email) => email.id === primaryEmailId,
    );

    if (primaryEmail?.emailAddress) {
      return primaryEmail.emailAddress;
    }
  }

  return user.emailAddresses[0]?.emailAddress ?? null;
}

function getPrimaryPhoneNumber(user: User) {
  const primaryPhoneId = user.primaryPhoneNumberId;

  if (primaryPhoneId) {
    const primaryPhone = user.phoneNumbers.find((phone) => phone.id === primaryPhoneId);

    if (primaryPhone?.phoneNumber) {
      return primaryPhone.phoneNumber;
    }
  }

  return user.phoneNumbers[0]?.phoneNumber ?? null;
}

export type SelfServiceRole = "student";

const SELF_SERVICE_ROLES: ReadonlySet<SelfServiceRole> = new Set(["student"]);

export function deriveRequestedRoles(
  input: string[] | undefined,
): SelfServiceRole[] {
  if (!input || input.length === 0) {
    return [];
  }

  return input.filter((role): role is SelfServiceRole =>
    SELF_SERVICE_ROLES.has(role as SelfServiceRole),
  );
}

async function recordDeniedRoleRequest(input: {
  grantedRoles: string[];
  requestedRoles: string[];
  userId: string;
}) {
  try {
    await writeAuditLog({
      action: "user.role_request_denied",
      actorUserId: input.userId,
      entityId: input.userId,
      entityType: "user",
      metadata: {
        grantedRoles: input.grantedRoles,
        requestedRoles: input.requestedRoles,
      },
    });
  } catch (error) {
    // Never allow an audit failure to break account creation. The codebase
    // writes audit entries after the mutation they describe, so a throw here
    // would turn a succeeded signup into a 500. Phase 1 addresses audit
    // failure handling globally.
    console.error("Failed to record denied role request", {
      error,
      userId: input.userId,
    });
  }
}

export async function syncCurrentUserToDatabase(options?: {
  requestedRoles?: string[];
}) {
  const authState = await requireAuthenticatedUser();
  const clerkUser = await getCurrentClerkUser();

  if (!clerkUser || !authState.userId) {
    throw new Error("Authenticated Clerk user could not be loaded.");
  }

  const email = getPrimaryEmailAddress(clerkUser);

  if (!email) {
    throw new Error("Authenticated Clerk user does not have an email address.");
  }

  const adminClient = getSupabaseAdminClient();
  const appUser = await upsertUserByClerkIdentity(adminClient, {
    avatar_url: clerkUser.imageUrl ?? null,
    clerk_user_id: authState.userId,
    email,
    full_name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || clerkUser.username || null,
    phone_number: getPrimaryPhoneNumber(clerkUser),
  });

  const requestedRoles = deriveRequestedRoles(options?.requestedRoles);
  const submittedRoles = options?.requestedRoles ?? [];
  const deniedRoles = submittedRoles.filter(
    (role) => !requestedRoles.includes(role as SelfServiceRole),
  );

  if (deniedRoles.length > 0) {
    await recordDeniedRoleRequest({
      grantedRoles: requestedRoles,
      requestedRoles: submittedRoles,
      userId: appUser.id,
    });
  }

  if (requestedRoles.length > 0) {
    await ensureUserRoles(adminClient, appUser.id, requestedRoles);
  }

  const roles = await listUserRoles(adminClient, appUser.id);

  return {
    roles: roles.map((role) => role.role),
    user: appUser,
  };
}

export async function getCurrentAppUser() {
  const authState = await requireAuthenticatedUser();
  const adminClient = getSupabaseAdminClient();
  const user = await getUserByClerkUserId(adminClient, authState.userId);

  if (!user) {
    return null;
  }

  const roles = await listUserRoles(adminClient, user.id);

  return {
    roles: roles.map((role) => role.role),
    user,
  };
}
