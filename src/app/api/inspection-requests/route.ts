import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import {
  listCurrentSeekerInspectionRequests,
  requestInspection,
} from "@/server/services/inspection-service";

/**
 * The signed-in seeker's own requests.
 *
 * The collection has only ever accepted POST, which is why a seeker could
 * create a request and then never see it again. The agent side reads its
 * equivalent through a server component rather than an endpoint; this exists
 * as well so the surface is not the only way to ask.
 */
export async function GET() {
  const requestId = await getRequestId();

  try {
    const data = await listCurrentSeekerInspectionRequests();

    return NextResponse.json({ data, meta: createApiMeta(requestId) });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}

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
