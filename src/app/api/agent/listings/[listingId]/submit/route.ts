import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { submitCurrentAgentListingForReview } from "@/server/services/agent-service";

type RouteContext = {
  params: Promise<{ listingId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { listingId } = await context.params;
    const result = await submitCurrentAgentListingForReview(listingId);

    return NextResponse.json({
      data: {
        id: result.listing.id,
        status: result.listing.status,
      },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit listing.";
    const status =
      message === "Unauthenticated request."
        ? 401
        : message === "Agent role is required."
          ? 403
          : message === "AGENT_NOT_VERIFIED"
            ? 403
            : message === "LISTING_IMAGE_COUNT_INVALID" || message === "LISTING_STATE_TRANSITION_INVALID" || message.includes("not found")
              ? 422
              : 500;

    return NextResponse.json(
      {
        error: {
          code:
            message === "AGENT_NOT_VERIFIED"
              ? "AGENT_NOT_VERIFIED"
              : message === "LISTING_IMAGE_COUNT_INVALID"
                ? "LISTING_IMAGE_COUNT_INVALID"
                : message === "LISTING_STATE_TRANSITION_INVALID"
                  ? "LISTING_STATE_TRANSITION_INVALID"
                  : status === 401
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
