import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { reportTarget } from "@/server/services/reports-service";

export async function POST(request: Request) {
  const requestId = await getRequestId();

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      reason?: string;
      targetId?: string;
      targetType?: string;
    };

    const report = await reportTarget({
      reason: body.reason ?? "",
      targetId: body.targetId ?? "",
      targetType: body.targetType ?? "",
    });

    return NextResponse.json(
      {
        data: { id: report.id, status: report.status },
        meta: createApiMeta(requestId),
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
