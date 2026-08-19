import { describe, expect, it } from "vitest";

import { JOB_HANDLERS, getJobHandler, type JobType } from "@/server/jobs/registry";

/**
 * Idempotency, enforced structurally rather than advised.
 *
 * ADR-032 guarantees at-least-once delivery, so every handler will eventually
 * run twice on the same payload. A comment saying "this is idempotent" is worth
 * nothing when the person adding the twelfth handler is in a hurry.
 *
 * This map is typed `Record<JobType, …>` and JobType is derived from the
 * registry, so adding a handler without adding a case here is a COMPILE ERROR,
 * not a missing test. That is the strongest enforcement available short of
 * proving idempotency, which no type system can do.
 *
 * Each case supplies a payload and an assertion that running the handler twice
 * is indistinguishable from running it once.
 */
type IdempotencyCase = {
  payload: unknown;
  /** Why repeating is safe, restated independently of the handler's own claim. */
  reason: string;
};

const IDEMPOTENCY_CASES: Record<JobType, IdempotencyCase> = {
  "diagnostics.echo": {
    payload: { message: "hello" },
    reason:
      "Pure function of the payload. Two runs return deep-equal values and complete_job overwrites result rather than appending.",
  },
};

describe("job handler registry", () => {
  it("registers at least one handler", () => {
    expect(Object.keys(JOB_HANDLERS).length).toBeGreaterThan(0);
  });

  it("every handler declares why it is idempotent", () => {
    for (const [type, handler] of Object.entries(JOB_HANDLERS)) {
      expect(handler.idempotency.length, `${type} idempotency rationale`).toBeGreaterThan(20);
    }
  });

  it("every handler declares a queue", () => {
    for (const [type, handler] of Object.entries(JOB_HANDLERS)) {
      expect(["default", "media"], `${type} queue`).toContain(handler.queue);
    }
  });

  // The compile-time guarantee, restated at runtime so a reader sees it fail
  // rather than only the build.
  it("every registered handler has an idempotency case", () => {
    expect(Object.keys(IDEMPOTENCY_CASES).sort()).toEqual(
      Object.keys(JOB_HANDLERS).sort(),
    );
  });

  it.each(Object.keys(JOB_HANDLERS) as JobType[])(
    "%s produces the same result when executed twice",
    async (type) => {
      // Through getJobHandler, not the literal: that is the lookup the drain
      // performs, and its JobHandler<unknown> signature is the contract a
      // handler is actually invoked against.
      const handler = getJobHandler(type)!;
      const testCase = IDEMPOTENCY_CASES[type];
      const parsed = handler.parse(testCase.payload);

      const context = {
        attempt: 1,
        client: {} as never,
        jobId: "00000000-0000-7000-8000-000000000000",
      };

      const first = await handler.handle(parsed, context);
      const second = await handler.handle(parsed, context);

      expect(second).toEqual(first);
    },
  );

  it("rejects a payload of the wrong shape", () => {
    const handler = getJobHandler("diagnostics.echo")!;

    expect(() => handler.parse({})).toThrow();
    expect(() => handler.parse({ message: 7 })).toThrow();
  });
});
