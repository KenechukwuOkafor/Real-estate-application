import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { getCurrentAppUser } from "@/server/services/user-sync-service";

export async function GET() {
  const requestId = await getRequestId();

  try {
    const result = await getCurrentAppUser();

    if (!result) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            details: null,
            message: "App user not found.",
          },
          meta: createApiMeta(requestId),
        },
        { status: 404 },
      );
    }

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
      error instanceof Error ? error.message : "Unable to load current user.";
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
