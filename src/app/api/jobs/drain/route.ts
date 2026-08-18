import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { assertDrainRequestAuthorized } from "@/server/jobs/authorize-drain";
import { drainQueue, getJobQueueHealth } from "@/server/jobs/drain";
import type { JobQueue } from "@/server/jobs/types";

/**
 * Node runtime, deliberately.
 *
 * ADR-032: handlers need native image libraries (ADR-015) and outbound HTTP
 * with retry. Neither is available in the edge runtime, and choosing edge here
 * would quietly foreclose the two slices this queue exists to unblock.
 */
export const runtime = "nodejs";

/**
 * Never cached. A drain returning a cached response does no work while
 * appearing healthy — the exact failure this design is trying to make visible.
 */
export const dynamic = "force-dynamic";

const QUEUES: readonly JobQueue[] = ["default", "media"];

function parseQueue(value: string | null): JobQueue {
  if (value && (QUEUES as readonly string[]).includes(value)) {
    return value as JobQueue;
  }

  return "default";
}

/**
 * Drains one lane.
 *
 * Lanes are drained by separate invocations so a slow media job cannot consume
 * the window a notification send needs. Point a second schedule at
 * ?queue=media.
 */
export async function POST(request: Request) {
  const requestId = await getRequestId();

  try {
    assertDrainRequestAuthorized(request);

    const queue = parseQueue(new URL(request.url).searchParams.get("queue"));
    const outcome = await drainQueue(queue);

    return NextResponse.json({
      data: outcome,
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}

/**
 * Queue health, behind the same secret.
 *
 * Reports oldest-queued-job age per lane, which is the signal ADR-032 asks to
 * alert on. Depth is included for context but must not be the alert: depth
 * reads zero both when everything is healthy and when the drain has stopped.
 */
export async function GET(request: Request) {
  const requestId = await getRequestId();

  try {
    assertDrainRequestAuthorized(request);

    return NextResponse.json({
      data: { queues: await getJobQueueHealth() },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
