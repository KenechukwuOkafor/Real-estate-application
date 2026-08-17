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
