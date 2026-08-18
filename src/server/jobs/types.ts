import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

export type JobQueue = Database["public"]["Enums"]["job_queue"];
export type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

export type JobContext = {
  /**
   * Service-role client.
   *
   * A job has no session — it runs long after the request that enqueued it,
   * on behalf of the system rather than a user. There is no Clerk token to
   * carry, so RLS has no identity to evaluate and the drain is necessarily a
   * privileged path. Handlers must therefore do their own authorization
   * reasoning: nothing below them will.
   */
  client: SupabaseClient<Database>;
  /** Attempt number, 1 on first execution. Handlers may log it; not for branching. */
  attempt: number;
  jobId: string;
};

/**
 * A job handler.
 *
 * `idempotency` is a required field, not a comment. ADR-032 guarantees
 * at-least-once delivery, so every handler will eventually run twice on the
 * same payload — after a drain dies mid-execution, after a retry of a job that
 * actually succeeded, after an overlapping invocation. A handler that is not
 * safe to repeat is a bug waiting for an unlucky deploy.
 *
 * Requiring the field forces the author to answer "why is this safe to repeat"
 * at the point of writing. It does not by itself make them answer honestly —
 * that is what the registry's paired idempotency test does, which fails to
 * compile if a handler is added without one.
 */
export type JobHandler<Payload = unknown> = {
  /** Why running this twice is indistinguishable from running it once. */
  idempotency: string;
  /** Lane. Long-running work belongs on `media` so it cannot starve `default`. */
  queue: JobQueue;
  /** Narrows the untyped jsonb payload, throwing if it is not the expected shape. */
  parse: (payload: unknown) => Payload;
  handle: (payload: Payload, context: JobContext) => Promise<unknown>;
};
