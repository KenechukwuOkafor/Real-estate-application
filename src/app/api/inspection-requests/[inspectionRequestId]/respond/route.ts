import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { requireUuid } from "@/lib/api/identifiers";
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
      decision?: unknown;
    };
    const { inspectionRequestId } = await context.params;
    requireUuid(inspectionRequestId, "Inspection request");
    // Passed through unmodified. The service validates; coercing here is what
    // turned a malformed decision into an accept.
    const inspectionRequest = await respondToInspectionRequest({
      decision: body.decision,
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
    return routeErrorResponse(error, requestId);
  }
}
