import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { registerCurrentAgentListingImages } from "@/server/services/agent-service";

type RouteContext = {
  params: Promise<{ listingId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { listingId } = await context.params;
    // Only path and ordering are accepted. URL, content type and size are read
    // from the uploaded object server-side; taking them from the body meant
    // persisting unverified values.
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      images?: Array<{
        position?: number;
        storagePath?: string;
      }>;
    };

    const result = await registerCurrentAgentListingImages({
      images: (body.images ?? []).map((image, index) => ({
        position: image.position ?? index,
        storagePath: image.storagePath ?? "",
      })),
      listingId,
    });

    return NextResponse.json(
      {
        data: {
          count: result.count,
        },
        meta: createApiMeta(requestId),
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
