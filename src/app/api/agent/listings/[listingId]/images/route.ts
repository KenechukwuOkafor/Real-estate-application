import { NextResponse } from "next/server";

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
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      images?: Array<{
        mimeType?: string;
        position?: number;
        publicUrl?: string;
        sizeBytes?: number;
        storagePath?: string;
      }>;
    };

    const result = await registerCurrentAgentListingImages({
      images: (body.images ?? []).map((image, index) => ({
        mimeType: image.mimeType ?? "",
        position: image.position ?? index,
        publicUrl: image.publicUrl ?? "",
        sizeBytes: image.sizeBytes ?? 0,
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
    const message = error instanceof Error ? error.message : "Unable to register listing images.";
    const status =
      message === "Unauthenticated request."
        ? 401
        : message === "Agent role is required."
          ? 403
          : message.includes("required") ||
              message.includes("cannot") ||
              message.includes("not found")
            ? 422
            : 500;

    return NextResponse.json(
      {
        error: {
          code:
            status === 401
              ? "UNAUTHENTICATED"
              : status === 403
                ? "UNAUTHORIZED"
                : status === 422
                  ? "VALIDATION_ERROR"
                  : "INTERNAL_ERROR",
          details: null,
          message,
        },
        meta: createApiMeta(requestId),
      },
      { status },
    );
  }
}
