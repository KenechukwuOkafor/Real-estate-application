import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { listAdminModerationQueue } from "@/server/services/admin-service";

export async function GET() {
  const requestId = await getRequestId();

  try {
    const listings = await listAdminModerationQueue();

    return NextResponse.json({
      data: listings,
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
