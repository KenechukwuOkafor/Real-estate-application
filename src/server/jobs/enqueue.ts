import "server-only";

import { getSupabaseAdminClient } from "@/lib/db/supabase";
import { currentRequestId } from "@/lib/observability/context";
import { log } from "@/lib/observability/logger";
import type { JobQueue } from "@/server/jobs/types";

/**
 * Enqueue a job from application code.
 *
 * NOT THE TRANSACTIONAL PATH, and that distinction is the whole reason this
 * doc comment is long.
 *
 * `public.enqueue_job` is callable from inside another SQL function's
 * transaction, which is what makes the outbox property hold: `perform
 * public.enqueue_job(...)` next to a domain UPDATE means both land or neither
 * does. This helper issues a standalone statement over PostgREST, so it is
 * correct only where the enqueue does not need to be atomic with a domain
 * write. If the work must not be lost when the surrounding write rolls back,
 * call the SQL function from inside that write instead.
 *
 * What this adds is correlation. It reads the ambient request id and passes it
 * down, so the job's log lines lead back to the request that queued the work —
 * BR-OBS-001, and REB-ENG-005's requirement that the id follows a request into
 * background jobs.
 *
 * A missing context is not an error. Scripts and tests have no middleware, and
 * losing correlation is a degraded log line where throwing would be a failed
 * enqueue.
 */
export async function enqueueJob(input: {
  type: string;
  payload?: Record<string, unknown>;
  queue?: JobQueue;
  runAt?: Date;
  maxAttempts?: number;
}): Promise<string> {
  const requestId = currentRequestId() ?? null;
  const queue = input.queue ?? "default";

  const { data, error } = await getSupabaseAdminClient().rpc("enqueue_job", {
    attempts_allowed: input.maxAttempts ?? 5,
    job_payload: (input.payload ?? {}) as never,
    job_type: input.type,
    request_id: requestId,
    run_at: (input.runAt ?? new Date()).toISOString(),
    target_queue: queue,
  });

  if (error) {
    // Deliberately not swallowed. An enqueue that silently does nothing is the
    // view-tracker failure in another costume: the caller believes deferred
    // work was scheduled, nothing runs, and no signal is produced anywhere.
    throw error;
  }

  log.info({
    event: "JobEnqueued",
    jobId: data as string,
    jobType: input.type,
    queue,
  });

  return data as string;
}
