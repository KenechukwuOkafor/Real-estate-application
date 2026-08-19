import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { requireUuid } from "@/lib/api/identifiers";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { createCurrentAgentListingImageUploadTargets } from "@/server/services/agent-service";

type RouteContext = {
  params: Promise<{ listingId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { listingId } = await context.params;
    requireUuid(listingId, "Listing");
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      files?: Array<{
        contentType?: string;
        fileName?: string;
      }>;
    };

    const result = await createCurrentAgentListingImageUploadTargets({
      files: (body.files ?? []).map((file) => ({
        contentType: file.contentType ?? "",
        fileName: file.fileName ?? "image.webp",
      })),
      listingId,
    });

    return NextResponse.json({
      data: result,
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
