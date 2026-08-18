import "server-only";

import { getSupabaseAdminClient } from "@/lib/db/supabase";
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
      const result = await handler.handle(payload, {
        attempt: job.attempts,
        client,
        jobId: job.id,
      });

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
    console.error("Failed to record job failure", {
      cause: error.message,
      jobId: job.id,
      originalError: message,
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
