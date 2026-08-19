import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { saveListingForCurrentUser } from "@/server/services/saved-listings-service";

export async function POST(request: Request) {
  const requestId = await getRequestId();

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      listingId?: string;
    };

    if (!body.listingId?.trim()) {
      return routeErrorResponse(new Error("listingId is required."), requestId);
    }

    const result = await saveListingForCurrentUser(body.listingId);

    return NextResponse.json(
      { data: result, meta: createApiMeta(requestId) },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
