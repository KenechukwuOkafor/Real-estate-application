import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { approveAgentVerificationAsAdmin } from "@/server/services/admin-service";

type RouteContext = {
  params: Promise<{ submissionId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { submissionId } = await context.params;
    const profile = await approveAgentVerificationAsAdmin(submissionId);

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
        : "Unable to approve verification submission.";
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
