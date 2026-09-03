import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { requireUuid } from "@/lib/api/identifiers";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { cancelInspectionRequest } from "@/server/services/inspection-service";

type RouteContext = {
  params: Promise<{ inspectionRequestId: string }>;
};

/**
 * A named sub-resource, like respond and complete, and for the same reason:
 * the caller is asking the system to perform a transition it will validate,
 * not editing a field they hold a privilege on. Nobody holds one.
 *
 * No body — which inspection is the whole of the request.
 */
export async function POST(_request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { inspectionRequestId } = await context.params;
    requireUuid(inspectionRequestId, "Inspection request");

    const inspectionRequest = await cancelInspectionRequest({
      inspectionRequestId,
    });

    return NextResponse.json({
      data: {
        cancelledAt: inspectionRequest.cancelled_at,
        id: inspectionRequest.id,
        status: inspectionRequest.status,
      },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
