import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { requestInspection } from "@/server/services/inspection-service";

export async function POST(request: Request) {
  const requestId = await getRequestId();

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      listingId?: string;
      message?: string;
    };

    const result = await requestInspection({
      listingId: body.listingId ?? "",
      message: body.message ?? "",
    });

    return NextResponse.json(
      {
        data: {
          chat: {
            id: result.chat.id,
          },
          inspectionRequest: {
            expiresAt: result.inspectionRequest.expires_at,
            id: result.inspectionRequest.id,
            status: result.inspectionRequest.status,
          },
        },
        meta: createApiMeta(requestId),
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create inspection request.";
    const status =
      message === "Unauthenticated request."
        ? 401
        : message === "Listing not found."
          ? 404
          : message.includes("already exists")
            ? 409
            : message.includes("required") ||
                message.includes("cannot request") ||
                message.includes("500 characters")
              ? 422
              : 500;

    return NextResponse.json(
      {
        error: {
          code:
            status === 401
              ? "UNAUTHENTICATED"
              : status === 404
                ? "LISTING_NOT_FOUND"
                : status === 409
                  ? "CONFLICT"
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
