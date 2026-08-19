import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
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
    return routeErrorResponse(error, requestId);
  }
}
