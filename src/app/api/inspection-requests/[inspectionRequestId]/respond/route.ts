import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { respondToInspectionRequest } from "@/server/services/inspection-service";

type RouteContext = {
  params: Promise<{ inspectionRequestId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      decision?: "accepted" | "declined";
    };
    const { inspectionRequestId } = await context.params;
    const inspectionRequest = await respondToInspectionRequest({
      decision: body.decision === "declined" ? "declined" : "accepted",
      inspectionRequestId,
    });

    return NextResponse.json({
      data: {
        id: inspectionRequest.id,
        respondedAt: inspectionRequest.responded_at,
        status: inspectionRequest.status,
      },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to respond to inspection request.";
    const status =
      message === "Unauthenticated request."
        ? 401
        : message === "Agent role is required."
          ? 403
          : message === "Inspection request not found."
            ? 404
            : message.includes("does not belong") || message.includes("cannot be responded")
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
                    ? "VALIDATION_ERROR"
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
