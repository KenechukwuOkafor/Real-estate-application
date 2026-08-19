import "server-only";

import type { User } from "@clerk/nextjs/server";

import { AppError } from "@/lib/api/errors";
import { getCurrentClerkUser, requireAuthenticatedUser } from "@/lib/auth/clerk";
import { getSupabaseAdminClient } from "@/lib/db/supabase";
import { setContextUser } from "@/lib/observability/context";
import { log } from "@/lib/observability/logger";
import { captureUnconditionally } from "@/lib/observability/sentry";
import {
  ensureUserRoles,
  getUserByClerkUserId,
  listUserRoles,
  upsertUserByClerkIdentity,
} from "@/server/repositories/users-repository";
import { writeAuditLog } from "@/server/services/audit-service";
import type { Database } from "@/types/database";

type AppRole = Database["public"]["Enums"]["app_role"];

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

export type SelfServiceRole = "student" | "agent";

/**
 * Roles a user may grant themselves during onboarding.
 *
 * `agent` is self-service: REB-DOM-002 Verification gates what an agent can
 * *do* (drafts yes, submission no) rather than gating who may become one, so
 * the role itself carries no privilege beyond reaching the agent workspace.
 *
 * `admin` must never appear here. The declared element type is deliberately
 * `Exclude<AppRole, "admin">` rather than `SelfServiceRole`: that makes this
 * a two-sided compile-time guard. Adding "admin" to the literal fails against
 * the `new Set<SelfServiceRole>` type argument, and widening SelfServiceRole
 * itself to include "admin" fails against the annotation. The escalation this
 * set exists to prevent cannot be reintroduced by editing one line.
 */
const SELF_SERVICE_ROLES: ReadonlySet<Exclude<AppRole, "admin">> =
  new Set<SelfServiceRole>(["student", "agent"]);

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
    // A denied role request is a security-relevant event, so losing the audit
    // entry is worth an alert even though the request itself succeeded.
    log.error({
      error,
      errorCode: "AUDIT_WRITE_FAILED",
      event: "DeniedRoleRequestNotAudited",
      userId: input.userId,
    });

    captureUnconditionally(error, {
      category: "infrastructure",
      errorCode: "AUDIT_WRITE_FAILED",
      extra: { userId: input.userId },
    });
  }
}

/**
 * SERVICE ROLE, deliberately.
 *
 * This is the path that creates the public.users row in the first place, so it
 * runs before the caller has any row for a policy to match on — every
 * ownership predicate resolves through public.users, and there is nothing to
 * resolve yet. Role grants also happen here, and user_roles is deliberately
 * not writable by anyone authenticated: an INSERT grant there is a direct
 * self-promotion to admin. The SELF_SERVICE_ROLES allowlist is what constrains
 * this path, and it is enforced in code above.
 */
export async function syncCurrentUserToDatabase(options?: {
  requestedRoles?: string[];
}) {
  const authState = await requireAuthenticatedUser();
  const clerkUser = await getCurrentClerkUser();

  if (!clerkUser || !authState.userId) {
    throw new AppError(
      "CLERK_USER_UNAVAILABLE",
      "Authenticated Clerk user could not be loaded.",
    );
  }

  const email = getPrimaryEmailAddress(clerkUser);

  if (!email) {
    throw new AppError(
      "CLERK_USER_EMAIL_MISSING",
      "Authenticated Clerk user does not have an email address.",
    );
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

    // Reject the whole request rather than granting the self-service subset.
    // A 200 that silently grants less than was asked for is what stranded
    // users in the /onboarding → /dashboard → /onboarding loop: the caller
    // could not tell "you are now an agent" from "we ignored that". Denials
    // are all-or-nothing so the response is unambiguous.
    throw new AppError(
      "ROLE_NOT_SELF_SERVICE",
      `These roles cannot be self-assigned: ${deniedRoles.join(", ")}.`,
      403,
    );
  }

  if (requestedRoles.length > 0) {
    await ensureUserRoles(adminClient, appUser.id, requestedRoles);
  }

  const roles = await listUserRoles(adminClient, appUser.id);

  // The other half of the onboarding loop: a request that grants nothing and
  // leaves the user role-less sends them straight back to /onboarding. Say so
  // instead of returning 200 with an empty role list.
  if (roles.length === 0) {
    throw new AppError(
      "ROLE_REQUIRED",
      "Select at least one role to finish setting up your account.",
      422,
    );
  }

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

  // Every log line below this point carries the user. REB-ENG-005 lists user id
  // among the required structured fields, and until now none of them had one.
  //
  // Deliberately the app-level id and never the Clerk id: ADR-026 permits a
  // user id in an event, and the Clerk id is an external identifier there is no
  // reason to export. A no-op outside a request context, so calling it can
  // never itself be a failure.
  setContextUser(user.id);

  const roles = await listUserRoles(adminClient, user.id);

  return {
    roles: roles.map((role) => role.role),
    user,
  };
}
