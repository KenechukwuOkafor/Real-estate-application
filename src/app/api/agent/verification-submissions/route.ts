import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { submitCurrentAgentVerification } from "@/server/services/agent-service";

export async function POST(request: Request) {
  const requestId = await getRequestId();

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      documents?: Array<{
        documentType?: string;
        originalFilename?: string;
        storagePath?: string;
      }>;
      fullLegalName?: string;
      notes?: string;
    };

    const result = await submitCurrentAgentVerification({
      documents: (body.documents ?? []).map((item) => ({
        documentType: item.documentType ?? "",
        originalFilename: item.originalFilename,
        storagePath: item.storagePath ?? "",
      })),
      fullLegalName: body.fullLegalName ?? "",
      notes: body.notes,
    });

    return NextResponse.json(
      {
        data: {
          status: result.agentProfile.verification_status,
        },
        meta: createApiMeta(requestId),
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
