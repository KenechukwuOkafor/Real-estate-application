/**
 * Supabase clients for RLS integration tests.
 *
 * Two clients, and the pairing is the point. A read denial under RLS returns
 * HTTP 200 with an empty array, so "no rows" alone proves nothing — it is
 * equally consistent with a policy that denies everything, a typo in the
 * filter, or the row simply not existing. Every denial assertion must be
 * paired with a service-role control read proving the row is there and is
 * being withheld.
 *
 * `asUser` takes a token rather than a ProbeUser so callers are forced to mint
 * a fresh one at the call site. See test/helpers/clerk-tokens.ts.
 */
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

function requireEnv(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} is required for RLS integration tests.`);
  }

  return value;
}

/** RLS-respecting. Mirrors createSupabaseAuthenticatedClient exactly. */
export function asUser(token: string) {
  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}

/** RLS-respecting, no session. Models an anonymous visitor. */
export function asAnon() {
  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Bypasses RLS. Used ONLY to arrange fixtures and to prove a withheld row
 * exists. Never use it to assert that access works.
 */
export function asServiceRole() {
  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * True when the environment can run RLS integration tests at all.
 *
 * These hit a real Clerk instance and a real local Postgres, so they cannot
 * run in CI, which has no secrets. Suites gate on this and skip rather than
 * fail, so `npm test` stays green in CI while still running fully locally.
 */
export function rlsIntegrationEnabled() {
  return Boolean(
    process.env.CLERK_SECRET_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
