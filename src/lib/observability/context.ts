import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The correlation context for whatever work is currently running.
 *
 * BR-OBS-001 (Critical) requires every request to carry a Request ID, and
 * REB-ENG-005 requires it to follow the request through the service layer, the
 * database call, and into background jobs. Threading a `requestId` parameter
 * through every function signature would satisfy that on paper and be abandoned
 * the first time someone was in a hurry. AsyncLocalStorage makes it ambient:
 * code that logs does not need to know how the id arrived.
 *
 * Two entry points seed it, and they are the only two:
 *
 *  - A request, at the route boundary, from the `x-request-id` header that
 *    middleware guarantees.
 *  - A job, in the drain, from the request id captured when the job was
 *    ENQUEUED — not the drain's own. That is the whole point: a job's log lines
 *    have to lead back to the request that caused the work, which may have
 *    finished minutes earlier.
 */
export type RequestContext = {
  /** Correlation id. Present for every request and every job execution. */
  requestId: string;
  /** `public.users.id`, when the caller is authenticated. Never the Clerk id. */
  userId?: string;
  /** Which surface produced this, e.g. "api", "job:diagnostics.echo". */
  service: string;
  /** For a job, the request that enqueued it. Absent for ordinary requests. */
  enqueuedByRequestId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * Seed the context for the current async execution, without wrapping a callback.
 *
 * `enterWith` rather than `run` so that thirty existing route handlers did not
 * have to be restructured to gain correlation. They all already call
 * getRequestId() as their first statement; that call now establishes the
 * context, and every await beneath it inherits it.
 *
 * The trade is real and worth stating: `run` scopes the store to a callback and
 * is impossible to leak, whereas `enterWith` mutates the current context and
 * relies on each request having its own. That holds in a Next route handler.
 * It would not hold if this were called from a long-lived shared context — so
 * the job drain uses `runWithContext` per job instead, where the boundary is
 * explicit and jobs must not inherit each other's ids.
 */
export function enterContext(context: RequestContext): void {
  storage.enterWith(context);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * Attach the authenticated user to the running context.
 *
 * Called once identity is resolved, which is necessarily after the context is
 * created — a request has an id before it has a user. A no-op outside a
 * context so that calling it can never be a failure.
 */
export function setContextUser(userId: string) {
  const context = storage.getStore();

  if (context) {
    context.userId = userId;
  }
}
