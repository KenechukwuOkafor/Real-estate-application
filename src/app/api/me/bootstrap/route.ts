import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { syncCurrentUserToDatabase } from "@/server/services/user-sync-service";

export async function POST(request: Request) {
  const requestId = await getRequestId();

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      roles?: string[];
    };

    const result = await syncCurrentUserToDatabase({
      requestedRoles: body.roles,
    });

    return NextResponse.json({
      data: {
        roles: result.roles,
        user: {
          email: result.user.email,
          fullName: result.user.full_name,
          id: result.user.id,
        },
      },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to bootstrap user.";
    const status = message === "Unauthenticated request." ? 401 : 500;

    return NextResponse.json(
      {
        error: {
          code: status === 401 ? "UNAUTHENTICATED" : "INTERNAL_ERROR",
          details: null,
          message,
        },
        meta: createApiMeta(requestId),
      },
      { status },
    );
  }
}
