import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { requireUuid } from "@/lib/api/identifiers";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { rejectListingRevisionAsAdmin } from "@/server/services/admin-service";

type RouteContext = {
  params: Promise<{ revisionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { revisionId } = await context.params;
    requireUuid(revisionId, "Revision");

    const body = ((await request.json().catch(() => null)) ?? {}) as {
      reason?: string;
    };

    const result = await rejectListingRevisionAsAdmin(revisionId, body.reason ?? "");

    return NextResponse.json({
      data: { listingId: result.listing_id, revisionId: result.revision_id },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
