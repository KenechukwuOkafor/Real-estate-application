import { NextResponse } from "next/server";

import { isDevAuthEnabled } from "@/lib/auth/dev-auth";
import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";

/**
 * Retained only so an older client calling it gets a clear answer.
 *
 * There is no dev-auth cookie to clear any more. Persona sessions are real
 * Clerk sessions, so signing out is Clerk's signOut() like any other user.
 */
export async function POST() {
  const requestId = await getRequestId();

  try {
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

    return NextResponse.json({
      data: {
        message: "Persona sessions are real Clerk sessions. Use Clerk signOut().",
        signedOut: false,
      },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
