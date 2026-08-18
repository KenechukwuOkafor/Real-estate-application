import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { createCurrentAgentVerificationUploadTargets } from "@/server/services/agent-service";

/**
 * Signed upload targets for verification documents.
 *
 * The bucket is private and its allowed_mime_types rejects anything outside
 * images and PDF, so an unsupported type fails at storage even if this route
 * were bypassed entirely.
 */
export async function POST(request: Request) {
  const requestId = await getRequestId();

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      files?: Array<{ contentType?: string; fileName?: string }>;
    };

    const result = await createCurrentAgentVerificationUploadTargets({
      files: (body.files ?? []).map((file) => ({
        contentType: file.contentType ?? "",
        fileName: file.fileName ?? "document",
      })),
    });

    return NextResponse.json({
      data: result,
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
