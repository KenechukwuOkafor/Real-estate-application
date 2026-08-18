import "server-only";

import { createClient } from "@supabase/supabase-js";

import { AppError } from "@/lib/api/errors";
import { getCurrentSessionToken } from "@/lib/auth/clerk";
import { appEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * RLS-respecting client bound to the caller's Clerk session.
 *
 * This is the client ADR-010 assumes: it authenticates as the anon key and
 * carries the caller's Clerk JWT, so every statement is evaluated against the
 * table's policies with `auth.jwt() ->> 'sub'` resolving to that user. Supabase
 * validates the token against Clerk's JWKS via the third-party auth provider
 * configured in supabase/config.toml.
 *
 * Contrast with getSupabaseAdminClient, which uses the service-role key and
 * bypasses RLS entirely. That one is a deliberate privilege escalation and
 * every remaining use of it carries a comment saying why.
 *
 * Deliberately NOT memoised. The admin client caches a module-level singleton
 * because its credential never changes; this one is per-request by
 * construction. A Clerk session token lives 60 seconds, so a cached client
 * would start returning empty result sets that are indistinguishable from an
 * RLS denial — the worst possible failure mode to debug. Build one per request,
 * let it be garbage collected.
 */
export async function createSupabaseAuthenticatedClient() {
  const token = await getCurrentSessionToken();

  if (!token) {
    // Fail closed and loudly. REB-DOM-003: "The platform should fail securely.
    // Access should be denied rather than granted."
    //
    // Throwing rather than returning an anon client is the important part. An
    // anon client would sail through every query and return empty arrays,
    // which read as "no data" — the failure mode that cost real time before
    // dev personas became real Clerk sessions. A thrown error names the cause.
    throw new AppError(
      "SESSION_TOKEN_UNAVAILABLE",
      "No Clerk session token is available for this request, so no row-level-security policy can match. If this is local development, sign in again from /dev-login — persona sessions are real Clerk sessions and may have expired.",
      401,
    );
  }

  return createClient<Database>(appEnv.supabaseUrl(), appEnv.supabaseAnonKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}
