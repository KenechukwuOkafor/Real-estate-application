import { NextResponse } from "next/server";

import {
  getDevAuthUserByClerkUserId,
  isDevAuthEnabled,
} from "@/lib/auth/dev-auth";
import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { appEnv } from "@/lib/env";

/**
 * Mints a real Clerk sign-in token for a persona.
 *
 * The browser exchanges the returned ticket for a genuine Clerk session, so
 * the resulting cookies, JWT and `sub` claim are indistinguishable from a
 * normal sign-in. That is the whole point: RLS policies compare against
 * auth.jwt() ->> 'sub', and anything fabricated here would match no rows.
 *
 * There is no fallback. If Clerk cannot mint a token this returns an error and
 * says so, because the alternative — a fabricated session — is exactly the
 * second identity path that made the harness silently useless under RLS.
 */
export async function POST(request: Request) {
  const requestId = await getRequestId();

  try {
    return await handleDevAuthLogin(request, requestId);
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}

async function handleDevAuthLogin(request: Request, requestId: string) {
  if (!isDevAuthEnabled()) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          details: null,
          message: "Development auth is disabled.",
        },
        meta: createApiMeta(requestId),
      },
      { status: 404 },
    );
  }

  const body = ((await request.json().catch(() => null)) ?? {}) as {
    clerkUserId?: string;
  };
  const user = getDevAuthUserByClerkUserId(body.clerkUserId ?? null);

  if (!user) {
    return NextResponse.json(
      {
        error: {
          code: "UNKNOWN_DEV_PERSONA",
          details: null,
          message:
            "Unknown development persona. Run `node scripts/setup-clerk-personas.mjs` and update DEV_AUTH_USERS if the Clerk instance changed.",
        },
        meta: createApiMeta(requestId),
      },
      { status: 422 },
    );
  }

  const response = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    body: JSON.stringify({
      expires_in_seconds: 300,
      user_id: user.clerkUserId,
    }),
    headers: {
      Authorization: `Bearer ${appEnv.clerkSecretKey()}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const payload = (await response.json().catch(() => null)) as
    | { errors?: Array<{ long_message?: string; message?: string }>; token?: string }
    | null;

  if (!response.ok || !payload?.token) {
    // Loud, specific, and never a fallback to a fabricated session. The most
    // common cause is that the persona ids in DEV_AUTH_USERS belong to a
    // different Clerk instance than CLERK_SECRET_KEY points at.
    const detail =
      payload?.errors?.[0]?.long_message ??
      payload?.errors?.[0]?.message ??
      `Clerk returned ${response.status}`;

    return NextResponse.json(
      {
        error: {
          code: "DEV_PERSONA_SESSION_UNAVAILABLE",
          details: null,
          message: `Could not mint a Clerk session for ${user.label} (${user.clerkUserId}): ${detail}. Run \`node scripts/setup-clerk-personas.mjs\` to (re)create the personas in the Clerk instance this key belongs to.`,
        },
        meta: createApiMeta(requestId),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    data: {
      clerkUserId: user.clerkUserId,
      email: user.email,
      label: user.label,
      roles: user.roles,
      // Exchanged client-side via signIn.create({ strategy: "ticket" }).
      ticket: payload.token,
    },
    meta: createApiMeta(requestId),
  });
}
