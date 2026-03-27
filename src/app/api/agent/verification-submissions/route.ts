import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { submitCurrentAgentVerification } from "@/server/services/agent-service";

export async function POST(request: Request) {
  const requestId = await getRequestId();

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      documents?: Array<{ type?: string; url?: string }>;
      fullLegalName?: string;
      notes?: string;
    };

    const result = await submitCurrentAgentVerification({
      documents: (body.documents ?? []).map((item) => ({
        type: item.type ?? "",
        url: item.url ?? "",
      })),
      fullLegalName: body.fullLegalName ?? "",
      notes: body.notes,
    });

    return NextResponse.json(
      {
        data: {
          status: result.agentProfile.verification_status,
        },
        meta: createApiMeta(requestId),
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to submit verification.";
    const status =
      message === "Unauthenticated request."
        ? 401
        : message === "Agent role is required."
          ? 403
          : message.includes("required") || message.includes("before")
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
