import "server-only";

import { AppError } from "@/lib/api/errors";
import type { JobHandler } from "@/server/jobs/types";

/**
 * The handler registry.
 *
 * Adding a handler means adding an entry here and nothing else. The drain
 * never learns about job types; it looks them up.
 */
export const JOB_HANDLERS = {
  /**
   * Trivial handler that exercises the whole path end to end.
   *
   * Deliberately has no effect outside the jobs table: it returns a value that
   * complete_job stores in the job's own `result` column. That makes it
   * observable enough to test while touching no domain data.
   */
  "diagnostics.echo": {
    handle: async (payload) => ({ echoed: payload.message }),
    idempotency:
      "Pure function of its payload, written with a set rather than an append. Running it a second time computes the same value and overwrites result with an identical object.",
    parse: (payload: unknown) => {
      if (
        !payload ||
        typeof payload !== "object" ||
        typeof (payload as { message?: unknown }).message !== "string"
      ) {
        throw new AppError(
          "JOB_PAYLOAD_INVALID",
          'diagnostics.echo expects { message: string }.',
          422,
        );
      }

      return payload as { message: string };
    },
    queue: "default",
  } satisfies JobHandler<{ message: string }>,
} as const;

/**
 * Every registered job type.
 *
 * Derived from the registry rather than declared separately, so the two cannot
 * drift. This is what makes the idempotency contract structural: the paired
 * test types its case map as Record<JobType, …>, so adding a handler here
 * without adding an idempotency case there stops the build.
 */
export type JobType = keyof typeof JOB_HANDLERS;

export function isRegisteredJobType(type: string): type is JobType {
  return Object.prototype.hasOwnProperty.call(JOB_HANDLERS, type);
}

export function getJobHandler(type: string) {
  if (!isRegisteredJobType(type)) {
    return null;
  }

  return JOB_HANDLERS[type] as JobHandler<unknown>;
}
