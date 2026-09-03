import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { requireUuid } from "@/lib/api/identifiers";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { completeInspectionRequest } from "@/server/services/inspection-service";

type RouteContext = {
  params: Promise<{ inspectionRequestId: string }>;
};

/**
 * A named sub-resource rather than a PATCH of `status`.
 *
 * The same reasoning as the archive route: this is not an edit of a field the
 * agent may write — since 0030 they cannot write it at all — it is a request
 * for the system to perform a transition it will validate first.
 *
 * No body. There is nothing to say beyond which inspection, and a body would
 * invite somebody to start passing a date.
 */
export async function POST(_request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { inspectionRequestId } = await context.params;
    requireUuid(inspectionRequestId, "Inspection request");

    const inspectionRequest = await completeInspectionRequest({
      inspectionRequestId,
    });

    return NextResponse.json({
      data: {
        completedAt: inspectionRequest.completed_at,
        id: inspectionRequest.id,
        status: inspectionRequest.status,
      },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
