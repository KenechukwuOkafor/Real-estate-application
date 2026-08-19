/**
 * Creates the shared identity cast once per run.
 *
 * See test/helpers/cast.ts for why this is shared rather than per-suite. The
 * short version: Clerk's Backend API rate-limits, nineteen users in fifteen
 * seconds earned an HTTP 429, and the refusal landed in `beforeAll` where it
 * took whole suites down and reported them as skipped.
 *
 * Runs before any suite and before setupFiles, so it loads the environment
 * itself rather than relying on the per-file setup to have done it.
 */
import "./setup-env";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import {
  CAST_APP_ROLE,
  CAST_ROLES,
  type Cast,
  type CastMember,
  type CastRole,
  castEmail,
} from "./helpers/cast";
import { clerkRequest } from "./helpers/clerk-tokens";
import { rlsIntegrationEnabled } from "./helpers/rls-clients";

function serviceRole() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * A run identifier that is stable within a run and distinct between runs.
 *
 * Distinct matters because the local database persists between runs while CI's
 * does not: reusing an email would collide with a previous run's `public.users`
 * row on a developer's machine.
 */
function runId() {
  return process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`;
}

export default async function setup({
  provide,
}: {
  provide: <K extends "cast">(key: K, value: Cast) => void;
}) {
  if (!rlsIntegrationEnabled()) {
    // No credentials: every integration suite skips, so there is nothing to
    // create. Unit suites do not touch this.
    return;
  }

  const id = runId();
  const svc = serviceRole();
  const created: CastMember[] = [];

  // Sequential, deliberately. Creating five identities in parallel is a burst
  // against the same rate limit this fixture exists to stay under, and five
  // round trips cost nothing next to a flaky suite.
  const cast = {} as Cast;

  try {
    for (const role of CAST_ROLES) {
      const member = await createMember(role, id);
      created.push(member);
      cast[role] = member;
    }

    for (const role of CAST_ROLES) {
      const member = cast[role];

      const { data, error } = await svc
        .from("users")
        .insert({ clerk_user_id: member.clerkUserId, email: member.email })
        .select("id")
        .single();

      if (error) throw error;
      member.userId = data.id;

      const { error: roleError } = await svc
        .from("user_roles")
        .insert({ role: CAST_APP_ROLE[role], user_id: data.id });

      if (roleError) throw roleError;
    }
  } catch (error) {
    // Do not leave half a cast behind in Clerk if seeding fails partway.
    await Promise.allSettled(
      created.map((m) => clerkRequest(`/users/${m.clerkUserId}`, { method: "DELETE" })),
    );
    throw error;
  }

  provide("cast", cast);

  return async () => {
    // Database rows first: deleting the Clerk user does not touch them, and a
    // developer's local database keeps whatever is left behind.
    for (const member of Object.values(cast)) {
      if (!member.userId) continue;
      await svc.from("user_roles").delete().eq("user_id", member.userId);
      await svc.from("users").delete().eq("id", member.userId);
    }

    await Promise.allSettled(
      Object.values(cast).map((m) =>
        clerkRequest(`/users/${m.clerkUserId}`, { method: "DELETE" }),
      ),
    );
  };
}

async function createMember(role: CastRole, id: string): Promise<CastMember> {
  const email = castEmail(role, id);

  const user = await clerkRequest<{ id: string }>("/users", {
    body: {
      email_address: [email],
      // Named so the dashboard shows what these are without decoding the
      // address. Orphans from a cancelled run are expected and should be
      // obviously disposable.
      first_name: "Ruvo CI",
      last_name: role,
      password: `Ruvo-CI-${role}-${Math.random().toString(36).slice(2, 10)}!Aa1`,
      skip_password_checks: true,
    },
    method: "POST",
  });

  const session = await clerkRequest<{ id: string }>("/sessions", {
    body: { user_id: user.id },
    method: "POST",
  });

  return { clerkUserId: user.id, email, sessionId: session.id, userId: "" };
}
