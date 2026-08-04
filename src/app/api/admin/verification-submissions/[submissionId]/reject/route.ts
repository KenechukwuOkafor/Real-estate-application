import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { rejectAgentVerificationAsAdmin } from "@/server/services/admin-service";

type RouteContext = {
  params: Promise<{ submissionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as { reason?: string };
    const { submissionId } = await context.params;
    const profile = await rejectAgentVerificationAsAdmin(
      submissionId,
      body.reason ?? "Verification evidence was insufficient.",
    );

    return NextResponse.json({
      data: {
        id: profile.id,
        status: profile.verification_status,
      },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to reject verification submission.";
    const status =
      message === "Unauthenticated request."
        ? 401
        : message === "Admin role is required."
          ? 403
          : message === "Verification submission not found."
            ? 404
            : message.includes("cannot be reviewed") || message.includes("already been reviewed")
              ? 422
              : 500;

    return NextResponse.json(
      {
        error: {
          code:
            status === 401
              ? "UNAUTHENTICATED"
              : status === 403
                ? "UNAUTHORIZED"
                : status === 404
                  ? "NOT_FOUND"
                  : status === 422
                    ? "VERIFICATION_STATE_TRANSITION_INVALID"
                    : "INTERNAL_ERROR",
          details: null,
          message,
        },
        meta: createApiMeta(requestId),
      },
      { status },
    );
  }
}
