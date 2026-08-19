import "server-only";

import { getSupabaseAdminClient } from "@/lib/db/supabase";
import { runWithContext } from "@/lib/observability/context";
import { log } from "@/lib/observability/logger";
import { captureUnconditionally } from "@/lib/observability/sentry";
import { getJobHandler } from "@/server/jobs/registry";
import type { JobQueue, JobRow } from "@/server/jobs/types";

/**
 * Per-lane drain configuration.
 *
 * Batch size is a ceiling, not a promise: the drain also enforces a wall-clock
 * budget and stops claiming when the budget is nearly spent, so a slow handler
 * shortens the batch rather than overrunning the function timeout.
 *
 * `default` — short work: notification sends, cleanup, cache invalidation.
 * Twenty per invocation at a second or two each fits comfortably inside a
 * sixty-second serverless limit.
 *
 * `media` — image processing (ADR-015). One at a time, because a single image
 * pipeline can take several seconds and there is no benefit to batching work
 * that is CPU-bound in a single-threaded runtime.
 */
export const DRAIN_CONFIG: Record<
  JobQueue,
  { batchSize: number; budgetMs: number }
> = {
  default: { batchSize: 20, budgetMs: 50_000 },
  media: { batchSize: 1, budgetMs: 50_000 },
};

export type DrainOutcome = {
  claimed: number;
  completed: number;
  failed: number;
  permanentlyFailed: number;
  queue: JobQueue;
  unregistered: number;
};

/**
 * Claim a batch and execute it.
 *
 * SERVICE ROLE, deliberately — the seventeenth escalation in the codebase and
 * justified on different grounds from the other sixteen. A job has no session:
 * it runs long after the request that enqueued it, on behalf of the system
 * rather than a user, so there is no Clerk token to carry and no identity for
 * RLS to evaluate. `claim_jobs`, `complete_job` and `fail_job` are granted to
 * service_role alone and to no authenticated role, which is what keeps a
 * signed-in user from claiming or completing work.
 *
 * A handler that throws is caught here. ADR-032: "Handler failure never fails
 * the request that enqueued the job" — and by the same token one failing job
 * must not abort the rest of the batch.
 */
export async function drainQueue(queue: JobQueue): Promise<DrainOutcome> {
  const client = getSupabaseAdminClient();
  const config = DRAIN_CONFIG[queue];
  const startedAt = Date.now();

  // Correlates this invocation's own lines, and stands in for jobs enqueued
  // before the correlation column existed. Those rows lead nowhere further,
  // but their lines still group together instead of being loose.
  const drainRequestId = crypto.randomUUID();

  const outcome: DrainOutcome = {
    claimed: 0,
    completed: 0,
    failed: 0,
    permanentlyFailed: 0,
    queue,
    unregistered: 0,
  };

  const { data, error } = await client.rpc("claim_jobs", {
    batch_size: config.batchSize,
    target_queue: queue,
  });

  if (error) {
    throw error;
  }

  const jobs = (data ?? []) as JobRow[];
  outcome.claimed = jobs.length;

  for (const job of jobs) {
    // Stop starting new work once the budget is nearly gone. Jobs not started
    // were never claimed, so they remain due for the next invocation.
    if (Date.now() - startedAt > config.budgetMs) {
      break;
    }

    const handler = getJobHandler(job.type);

    if (!handler) {
      // An unregistered type is a deploy-order problem, not a transient
      // failure: the row was enqueued by code that knows the type and drained
      // by code that does not. Retrying lets a rollout in progress recover on
      // its own once both sides are deployed.
      outcome.unregistered += 1;
      await recordFailure(
        client,
        job,
        `No handler registered for job type "${job.type}".`,
        outcome,
      );
      continue;
    }

    try {
      const payload = handler.parse(job.payload);
      const jobStartedAt = Date.now();

      /**
       * runWithContext, not enterWith.
       *
       * The drain is a long-lived shared context executing many jobs in
       * sequence. enterWith mutates that shared context, so job two would
       * inherit job one's request id — correlation that is worse than none,
       * because it is confidently wrong. `run` scopes the store to this
       * callback and cannot leak, in either direction: the drain's own context
       * is also intact after the job returns.
       *
       * requestId is the ENQUEUING request's, not the drain's. That is the
       * point of the whole task: one grep on the id a user quoted from a
       * response header finds the request, the service lines beneath it, and
       * the job that ran four minutes later.
       */
      const result = await runWithContext(
        {
          enqueuedByRequestId: job.enqueued_by_request_id ?? undefined,
          jobId: job.id,
          requestId: job.enqueued_by_request_id ?? drainRequestId,
          service: `job:${job.type}`,
        },
        async () => {
          const value = await handler.handle(payload, {
            attempt: job.attempts,
            client,
            jobId: job.id,
          });

          log.info({
            attempt: job.attempts,
            duration: Date.now() - jobStartedAt,
            event: "JobCompleted",
            jobType: job.type,
          });

          return value;
        },
      );

      const { error: completeError } = await client.rpc("complete_job", {
        job_id: job.id,
        job_result: (result ?? null) as never,
      });

      if (completeError) {
        throw completeError;
      }

      outcome.completed += 1;
    } catch (handlerError) {
      const message =
        handlerError instanceof Error
          ? handlerError.message
          : String(handlerError);

      // Reported under the job's own context, not the drain's, so the event
      // carries the id of the request that queued the work. ADR-026 names
      // background job failures in its monitoring scope, and until now a
      // handler could throw on every attempt until the job died permanently
      // without anything outside the jobs table ever saying so.
      runWithContext(
        {
          enqueuedByRequestId: job.enqueued_by_request_id ?? undefined,
          jobId: job.id,
          requestId: job.enqueued_by_request_id ?? drainRequestId,
          service: `job:${job.type}`,
        },
        () => {
          log.error({
            attempt: job.attempts,
            error: handlerError,
            event: "JobFailed",
            jobType: job.type,
            maxAttempts: job.max_attempts,
            message,
          });

          captureUnconditionally(handlerError, {
            errorCode: "JOB_HANDLER_FAILED",
            extra: {
              attempt: job.attempts,
              jobId: job.id,
              jobType: job.type,
              maxAttempts: job.max_attempts,
            },
            requestId: job.enqueued_by_request_id ?? drainRequestId,
          });
        },
      );

      await recordFailure(client, job, message, outcome);
    }
  }

  return outcome;
}

async function recordFailure(
  client: ReturnType<typeof getSupabaseAdminClient>,
  job: JobRow,
  message: string,
  outcome: DrainOutcome,
) {
  const { data, error } = await client.rpc("fail_job", {
    error_message: message.slice(0, 2000),
    job_id: job.id,
  });

  if (error) {
    // The drain could not even record the failure. Surface it rather than
    // swallowing: the job is left in `running` and will need manual attention,
    // which is exactly the sort of thing that should not pass silently.
    log.error({
      cause: error.message,
      event: "JobFailureNotRecorded",
      jobId: job.id,
      jobType: job.type,
      message,
    });
    outcome.failed += 1;
    return;
  }

  if (data === "failed_permanently") {
    outcome.permanentlyFailed += 1;
  } else {
    outcome.failed += 1;
  }
}

/**
 * Oldest-queued-job age per lane.
 *
 * ADR-032 is explicit that alerting on queue depth is wrong: depth reads zero
 * when the drain has stopped, because nothing drains and nothing accumulates
 * visibly. Age rises the moment draining stops, which is the failure mode most
 * likely to go unnoticed — nothing errors, work simply does not happen.
 */
export async function getJobQueueHealth() {
  const { data, error } = await getSupabaseAdminClient().rpc("job_queue_health");

  if (error) {
    throw error;
  }

  return data ?? [];
}
