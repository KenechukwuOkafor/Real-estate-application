import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { log } from "@/lib/observability/logger";
import { captureMessage } from "@/lib/observability/sentry";
import { assertMachineRequestAuthorized } from "@/server/jobs/authorize-machine-request";
import { getJobQueueHealth } from "@/server/jobs/drain";

/**
 * Node runtime: this route reads the queue through the service-role client.
 */
export const runtime = "nodejs";

/**
 * Never cached. A monitoring route returning a cached verdict reports health
 * while doing no work — the exact failure it exists to detect.
 */
export const dynamic = "force-dynamic";

const DEFAULT_MAX_AGE_SECONDS = 900;

function maxAgeSeconds() {
  const configured = Number(process.env.JOB_QUEUE_MAX_AGE_SECONDS);

  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_AGE_SECONDS;
}

type Check = {
  name: string;
  status: "ok" | "breached" | "errored";
  detail: Record<string, unknown>;
};

type QueueHealthRow = {
  oldest_queued_age_seconds: number | string | null;
  queue: string;
  queued_count: number | string | null;
};

/**
 * Alerts on the absence of an expected signal.
 *
 * ADR-032 is explicit that alerting on queue depth is wrong: depth reads zero
 * both when everything is healthy and when the drain has stopped, because
 * nothing drains and nothing accumulates visibly. Age rises the moment
 * draining stops, which is the failure most likely to go unnoticed — nothing
 * errors, work simply does not happen.
 *
 * `job_queue_health()` has exposed `oldest_queued_age_seconds` since 0017 and
 * nothing has ever read it. This route is what turns it into an alert.
 *
 * ALWAYS RETURNS 200. A breach is a finding, not a route failure. Returning
 * non-200 on breach would make a stopped drain and a broken monitoring route
 * indistinguishable, which reproduces the class of bug this exists to end. The
 * verdict is in the body; the notification is Sentry's job.
 */
export async function GET(request: Request) {
  const requestId = await getRequestId();

  try {
    assertMachineRequestAuthorized(request, "MONITORING_SECRET");
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHENTICATED",
          details: null,
          message: "This route requires a bearer token matching MONITORING_SECRET.",
        },
        meta: createApiMeta(requestId),
      },
      { status: 401 },
    );
  }

  const threshold = maxAgeSeconds();
  const checks: Check[] = [];

  try {
    const lanes = (await getJobQueueHealth()) as QueueHealthRow[];

    for (const lane of lanes) {
      const age = Number(lane.oldest_queued_age_seconds ?? 0);
      const queuedCount = Number(lane.queued_count ?? 0);
      const breached = age > threshold;

      checks.push({
        detail: {
          oldestQueuedAgeSeconds: age,
          queue: lane.queue,
          queuedCount,
          thresholdSeconds: threshold,
        },
        name: `job-queue-age:${lane.queue}`,
        status: breached ? "breached" : "ok",
      });

      if (!breached) {
        continue;
      }

      log.error({
        errorCode: "JOB_QUEUE_STALLED",
        event: "JobQueueAgeThresholdBreached",
        oldestQueuedAgeSeconds: age,
        queue: lane.queue,
        queuedCount,
        thresholdSeconds: threshold,
      });

      captureMessage(
        `Job queue "${lane.queue}" has work older than ${threshold}s — the drain may have stopped`,
        {
          alertKind: "absence",
          category: "infrastructure",
          extra: {
            oldestQueuedAgeSeconds: age,
            queue: lane.queue,
            queuedCount,
            thresholdSeconds: threshold,
          },
          level: "error",
          requestId,
        },
      );
    }
  } catch (error) {
    // The check itself could not run. That is its own kind of absence: nobody
    // is watching the queue and nothing else would say so.
    checks.push({
      detail: { reason: "job_queue_health query failed" },
      name: "job-queue-age",
      status: "errored",
    });

    log.error({ error, event: "AbsenceCheckFailed" });

    captureMessage("Absence check could not read job queue health", {
      alertKind: "absence",
      category: "infrastructure",
      level: "error",
      requestId,
    });
  }

  return NextResponse.json(
    {
      data: {
        breached: checks
          .filter((check) => check.status !== "ok")
          .map((check) => check.name),
        checks,
        thresholdSeconds: threshold,
      },
      meta: createApiMeta(requestId),
    },
    { status: 200 },
  );
}
