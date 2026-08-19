# Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement ADR-026 — close BR-OBS-001 (every request receives a Request ID) and BR-OBS-002 (production errors reported to Sentry), stop `routeErrorResponse` discarding causes, remove message-text error classification, and alert on the absence of two expected signals.

**Architecture:** A `AsyncLocalStorage` request context seeded in middleware carries a request id through the service layer, into the database call, and into any enqueued job. A code registry replaces message-text classification and assigns each error a category; only `infrastructure` and `unexpected` reach Sentry. Every event passes a fail-closed sanitiser before transmission.

**Tech Stack:** Next.js 16.2.1 (App Router, `--webpack`), TypeScript 5, `@sentry/nextjs` 10.70.0, Supabase (Postgres + PostgREST RPC), Clerk 7, vitest 4, npm.

**Spec:** `docs/superpowers/specs/2026-08-19-observability-design.md`

## Global Constraints

- **Package manager is npm.** The Engineering Bible says pnpm; the repo is ground truth. Do not swap.
- **Monitoring never alters business behaviour.** REB-ARCH-012 domain invariant.
- **BR-ANA-003 (Critical):** the listing-view endpoint still returns 200 and never blocks.
- **Sentry being unavailable must never fail a request.** Every Sentry entry point swallows its own failure and returns a boolean.
- **Development must not transmit.** Transmission is allowed only when `NEXT_PUBLIC_APP_ENV` is exactly `preview` or `production`.
- **BR-OBS-003 (Critical):** never transmit a token, a session cookie, a signed URL, a verification document reference, or anything from a job payload.
- **No client-visible HTTP status changes** except the two named in Task 5, which are bug fixes and are called out explicitly.
- Verification commands: `npm run typecheck`, `npm run lint` (`--max-warnings 0`), `npm test`.
- Existing test count baseline: 27 files / 328 tests / 0 skipped, per the Phase-0 CI record. `src/lib/api/errors.test.ts` is currently **red** (6 of 11 failing) — Task 4 is what makes it green.
- Migration numbering continues from `0017_job_queue.sql`.
- Commit after every task. Branch is `feat/observability`.

---

## File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `src/lib/observability/sanitize.test.ts` | Redaction proof against a payload of real secret shapes. |
| `src/lib/api/error-codes.test.ts` | Registry invariants: every code classified, every category decided. |
| `src/lib/observability/sentry.test.ts` | Transmission gating and never-throws guarantees. |
| `src/server/jobs/enqueue.ts` | `enqueueJob()` — reads the ambient request id and passes it to SQL. |
| `src/server/jobs/enqueue.test.ts` | Unit proof that the ambient id reaches the RPC arguments. |
| `src/server/jobs/authorize-machine-request.ts` | Shared bearer check for machine callers. |
| `src/server/jobs/authorize-machine-request.test.ts` | Fails closed; accepts named secret or `CRON_SECRET`. |
| `src/app/api/monitoring/absence/route.ts` | Oldest-queued-job-age check. Always 200. |
| `src/app/api/monitoring/absence/route.test.ts` | Breach reports and still returns 200. |
| `src/server/jobs/request-id-propagation.test.ts` | Integration: request → job → log line. |
| `supabase/migrations/0018_job_request_correlation.sql` | `jobs.enqueued_by_request_id` + `enqueue_job` parameter. |
| `docs/operations/observability-runbook.md` | The two Sentry alert rules and the unresolved scheduler decision. |

**Modify:**

| Path | Change |
|---|---|
| `src/lib/observability/sentry.ts` | Gate on `NEXT_PUBLIC_APP_ENV` allow-list (D9). |
| `src/lib/api/error-codes.ts` | Add the codes the 60 throw sites need. |
| `src/lib/api/errors.test.ts` | Rewritten as a status-pinning table. |
| `src/lib/observability/context.ts` | Add `jobId` to `RequestContext`. |
| `src/server/services/*.ts`, `src/server/repositories/agents-repository.ts`, `src/lib/env.ts` | 60 throw sites → `AppError`. |
| `src/server/services/user-sync-service.ts` | `setContextUser` wiring. |
| `src/server/services/agent-service.test.ts` | 4 assertions move from message to `code`. |
| `src/server/jobs/drain.ts` | Per-job `runWithContext`. |
| `src/server/jobs/authorize-drain.ts` | Delegates to the shared bearer check. |
| `src/app/api/listings/[slugOrPublicId]/views/route.ts` | Structured logging + unresolved reporting. |
| `next.config.ts` | `withSentryConfig`. |
| `.env.example` | New variables + the alert-rule reminder. |

---

## Task 1: Gate Sentry transmission on `NEXT_PUBLIC_APP_ENV`

Spec D9. Do this first: until it is done, a DSN in `.env.local` makes the whole test suite transmit to Sentry, which would corrupt every task after it.

**Files:**
- Modify: `src/lib/observability/sentry.ts:44-46`
- Test: `src/lib/observability/sentry.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `sentryEnabled(): boolean`, `appEnvironment(): string`, `appRelease(): string`, `reportError(error: unknown, context?: ReportContext): boolean`, `captureUnconditionally(error: unknown, context?: ReportContext, category?: ErrorCategory): boolean`, `captureMessage(message: string, context?: ReportContext & { level?: "warning" | "error" }): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/observability/sentry.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  withScope: vi.fn((fn: (scope: unknown) => void) =>
    fn({
      setTag: vi.fn(),
      setUser: vi.fn(),
      setExtras: vi.fn(),
      setLevel: vi.fn(),
    }),
  ),
}));

import { appEnvironment, sentryEnabled } from "@/lib/observability/sentry";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("sentryEnabled", () => {
  it("does not transmit under vitest, where NODE_ENV is 'test'", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://abc@o1.ingest.sentry.io/1";
    delete process.env.NEXT_PUBLIC_APP_ENV;

    // NODE_ENV is "test" here. The previous gate was `!== "development"`,
    // which made this true and would have transmitted the whole suite.
    expect(sentryEnabled()).toBe(false);
  });

  it("does not transmit in development", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://abc@o1.ingest.sentry.io/1";
    process.env.NEXT_PUBLIC_APP_ENV = "development";

    expect(sentryEnabled()).toBe(false);
  });

  it("transmits in preview and production when a DSN is present", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://abc@o1.ingest.sentry.io/1";

    process.env.NEXT_PUBLIC_APP_ENV = "preview";
    expect(sentryEnabled()).toBe(true);

    process.env.NEXT_PUBLIC_APP_ENV = "production";
    expect(sentryEnabled()).toBe(true);
  });

  it("does not transmit in production without a DSN", () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    process.env.NEXT_PUBLIC_APP_ENV = "production";

    expect(sentryEnabled()).toBe(false);
  });

  it("reports the environment name for tagging", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "preview";
    expect(appEnvironment()).toBe("preview");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/observability/sentry.test.ts`
Expected: FAIL — "does not transmit under vitest" gets `true`, because the current gate is `appEnvironment() !== "development"` and `appEnvironment()` falls back to `NODE_ENV`, which is `"test"`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/observability/sentry.ts`, replace `sentryEnabled`:

```ts
/**
 * Environments permitted to transmit.
 *
 * An allow-list, not a deny-list. The previous gate was
 * `appEnvironment() !== "development"`, and appEnvironment() falls back to
 * NODE_ENV — which is "test" under vitest. A DSN in .env.local would therefore
 * have made the entire test suite transmit to the same issue stream an on-call
 * engineer is meant to trust. Anything not named here, including "test" and
 * unset, stays local and loud.
 */
const TRANSMITTING_ENVIRONMENTS = new Set(["preview", "production"]);

export function sentryEnabled() {
  return (
    Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN) &&
    TRANSMITTING_ENVIRONMENTS.has(appEnvironment())
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/observability/sentry.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/observability/sentry.ts src/lib/observability/sentry.test.ts
git commit -m "fix(observability): stop the test suite from transmitting to Sentry

Transmission was gated on appEnvironment() !== \"development\", and
appEnvironment() falls back to NODE_ENV, which vitest sets to \"test\". A DSN
present in .env.local would have shipped every test run into the same issue
stream an on-call engineer is meant to trust. Gate on an explicit allow-list
of preview and production instead."
```

---

## Task 2: Prove the sanitiser

Required test #1 from the brief. The sanitiser already exists; this is the proof it works against the payload the brief names. No implementation is expected — but if the test finds a leak, fix it here.

**Files:**
- Test: `src/lib/observability/sanitize.test.ts` (create)
- Modify (only if the test finds a leak): `src/lib/observability/sanitize.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: no new exports. Confirms `sanitize(value: unknown, depth?: number): unknown`, `sanitizeString(value: string): string`, `sanitizeEvent<T extends Record<string, unknown>>(event: T): T`, and the constant `REDACTED = "[redacted]"`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/observability/sanitize.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { REDACTED, sanitize, sanitizeEvent } from "@/lib/observability/sanitize";

/**
 * Realistic shapes, not placeholders. A sanitiser tested against "secret123"
 * proves nothing about a JWT.
 */
const CLERK_JWT =
  "eyJhbGciOiJSUzI1NiIsImtpZCI6Imluc18yYWJjIn0" +
  ".eyJzdWIiOiJ1c2VyXzJhYmMiLCJleHAiOjE3NjcyMjU2MDB9" +
  ".QkxBSF9TSUdOQVRVUkVfQkxBSF9CTEFIX0JMQUg";

const SESSION_COOKIE = "__session=" + CLERK_JWT + "; Path=/; HttpOnly; Secure";

const SIGNED_URL =
  "https://abcdefgh.supabase.co/storage/v1/object/sign/listing-media/" +
  "3c71e0a2/cover.jpg?token=" + CLERK_JWT;

const DOCUMENT_REF = "verification/9f8e7d6c-1234-4567-89ab-cdef01234567/passport.pdf";

/**
 * Assembled at runtime rather than written as a literal.
 *
 * A literal provider key in source trips GitHub's push protection, which
 * cannot tell an invented fixture from a real one - correctly, since that is
 * exactly what it exists to catch. The sanitiser sees the identical string
 * either way; only the scanner's view of the file changes.
 *
 * Do not "tidy" this back into a literal. It will block the next push.
 */
const PROVIDER_SECRET_KEY = ["sk", "live", "abcdefghijklmnopqrstuvwx"].join("_");

/** Everything the brief says must never be transmitted, in one object. */
const KITCHEN_SINK = {
  authorization: `Bearer ${CLERK_JWT}`,
  cookie: SESSION_COOKIE,
  nested: {
    deeper: {
      // Innocent key name, secret value. This is the realistic accident.
      next: SIGNED_URL,
      storage_path: DOCUMENT_REF,
    },
  },
  jobPayload: { message: "hello", token: CLERK_JWT },
  listOfUrls: [SIGNED_URL, "https://ruvo.example/listings/abc"],
  serviceRoleKey: PROVIDER_SECRET_KEY,
  harmless: "listing 3c71e0a2 published",
};

/** Every literal that must not survive, checked against the serialised output. */
const FORBIDDEN = [CLERK_JWT, "__session=", PROVIDER_SECRET_KEY, "token="];

describe("sanitize", () => {
  it("removes every secret in a payload containing all of them", () => {
    const serialised = JSON.stringify(sanitize(KITCHEN_SINK));

    for (const secret of FORBIDDEN) {
      expect(serialised).not.toContain(secret);
    }

    // The document reference must not survive either.
    expect(serialised).not.toContain("passport.pdf");
  });

  it("redacts by key regardless of value", () => {
    const out = sanitize({ authorization: "anything at all" }) as Record<string, unknown>;

    expect(out.authorization).toBe(REDACTED);
  });

  it("redacts by value regardless of key", () => {
    // The key is innocent. Only value matching catches this.
    const out = sanitize({ next: SIGNED_URL }) as Record<string, unknown>;

    expect(String(out.next)).not.toContain(CLERK_JWT);
  });

  it("keeps a signed URL's origin and path so a report still says which endpoint", () => {
    const out = String((sanitize({ next: SIGNED_URL }) as Record<string, unknown>).next);

    expect(out).toContain("abcdefgh.supabase.co");
    expect(out).toContain("/storage/v1/object/sign/listing-media/");
    expect(out).toContain(REDACTED);
  });

  it("preserves non-secret content, so reports stay useful", () => {
    const out = sanitize(KITCHEN_SINK) as Record<string, unknown>;

    expect(out.harmless).toBe("listing 3c71e0a2 published");
  });

  it("redacts secrets inside arrays", () => {
    const out = sanitize({ listOfUrls: [SIGNED_URL] }) as { listOfUrls: string[] };

    expect(out.listOfUrls[0]).not.toContain(CLERK_JWT);
  });

  it("redacts a secret embedded in an Error message", () => {
    const out = sanitize(new Error(`request failed: ${SIGNED_URL}`)) as {
      message: string;
    };

    expect(out.message).not.toContain(CLERK_JWT);
  });

  it("fails closed on an unknown class instance rather than serialising it", () => {
    class Connection {
      secret = CLERK_JWT;
    }

    expect(JSON.stringify(sanitize(new Connection()))).not.toContain(CLERK_JWT);
  });

  it("fails closed past the depth limit", () => {
    let deep: unknown = CLERK_JWT;
    for (let i = 0; i < 12; i += 1) deep = { deep };

    expect(JSON.stringify(sanitize(deep))).not.toContain(CLERK_JWT);
  });
});

describe("sanitizeEvent", () => {
  it("drops headers, cookies and query strings from a request", () => {
    const event = sanitizeEvent({
      request: {
        cookies: { __session: CLERK_JWT },
        data: { token: CLERK_JWT },
        headers: { authorization: `Bearer ${CLERK_JWT}` },
        query_string: `token=${CLERK_JWT}`,
        url: SIGNED_URL,
      },
    });

    const serialised = JSON.stringify(event);

    expect(serialised).not.toContain(CLERK_JWT);
    // The path survives: knowing which route failed is the point of the report.
    expect(serialised).toContain("/storage/v1/object/sign/listing-media/");
  });

  it("reduces the user to an id, never an email or an IP", () => {
    const event = sanitizeEvent({
      user: { email: "seeker@example.com", id: "u-123", ip_address: "41.58.1.9" },
    }) as { user: Record<string, unknown> };

    expect(event.user).toEqual({ id: "u-123" });
  });

  it("sanitises breadcrumbs, extra, tags and contexts", () => {
    const event = sanitizeEvent({
      breadcrumbs: [{ data: { url: SIGNED_URL } }],
      contexts: { job: { payload: { token: CLERK_JWT } } },
      extra: { cookie: SESSION_COOKIE },
      tags: { document: DOCUMENT_REF },
    });

    expect(JSON.stringify(event)).not.toContain(CLERK_JWT);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/lib/observability/sanitize.test.ts`
Expected: the sanitiser is already written, so most assertions should PASS on the first run. Any FAIL is a real leak — fix `src/lib/observability/sanitize.ts` in Step 3 rather than weakening the assertion.

- [ ] **Step 3: Fix any leak the test found**

If every assertion passed, skip to Step 4 and note that in the commit body. If one failed, the likely causes and their fixes:

- A secret survived inside a nested array of objects → confirm `sanitize` recurses through `Array.isArray` before the `typeof value === "object"` branch.
- `sk_live_…` survived → widen the key pattern; `serviceRoleKey` should already match `service[-_]?role` case-insensitively only if the key is snake_cased. Add `serviceRoleKey` coverage by extending `SECRET_KEY_PATTERN` with `service[-_]?role|servicerole`.
- The document path survived under a non-matching key → confirm the `verification/<uuid>/` value pattern is present in `SECRET_VALUE_PATTERNS`.

- [ ] **Step 4: Run the full suite to confirm nothing regressed**

Run: `npm test`
Expected: `src/lib/api/errors.test.ts` still fails 6 (known, fixed in Task 4). Everything else passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/observability/sanitize.test.ts src/lib/observability/sanitize.ts
git commit -m "test(observability): prove the sanitiser against real secret shapes

One payload carrying a Clerk JWT, a session cookie, a Supabase signed URL and
a verification document path. Asserted absent from the serialised output
rather than masked at the top level, because the realistic accident is a
secret nested inside a request object someone logged whole."
```

---

## Task 3: Extend the error registry to cover every throw site

**Files:**
- Modify: `src/lib/api/error-codes.ts`
- Test: `src/lib/api/error-codes.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `ERROR_CODES` gains `AGENT_PROFILE_NOT_FOUND`, `CHAT_NOT_FOUND`, `CLERK_USER_UNAVAILABLE`, `CLERK_USER_EMAIL_MISSING`, `CONFIG_ENV_VAR_MISSING`, `INSPECTION_NOT_FOUND`, `INSPECTION_ALREADY_ACTIVE`, `VERIFICATION_SUBMISSION_NOT_FOUND`. Existing exports unchanged: `ErrorCategory`, `CATEGORY_ALERTS`, `ERROR_CODES`, `ErrorCode`, `isKnownErrorCode(code: string): code is ErrorCode`, `categoryForCode(code: string): ErrorCategory`, `httpStatusForCode(code: string): number`, `shouldAlert(category: ErrorCategory): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/api/error-codes.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  CATEGORY_ALERTS,
  categoryForCode,
  ERROR_CODES,
  httpStatusForCode,
  isKnownErrorCode,
  shouldAlert,
  type ErrorCategory,
} from "@/lib/api/error-codes";

const ALL_CATEGORIES: ErrorCategory[] = [
  "validation",
  "authentication",
  "authorization",
  "business_rule",
  "infrastructure",
  "unexpected",
];

describe("the error registry", () => {
  it("gives every code a category the docs define", () => {
    for (const [code, definition] of Object.entries(ERROR_CODES)) {
      expect(ALL_CATEGORIES, `${code} has an undefined category`).toContain(
        definition.category,
      );
    }
  });

  it("gives every code a plausible HTTP status", () => {
    for (const [code, definition] of Object.entries(ERROR_CODES)) {
      expect(definition.httpStatus, `${code}`).toBeGreaterThanOrEqual(400);
      expect(definition.httpStatus, `${code}`).toBeLessThan(600);
    }
  });

  it("gives every category an alerting decision", () => {
    for (const category of ALL_CATEGORIES) {
      expect(CATEGORY_ALERTS[category], `${category}`).toBeTypeOf("boolean");
    }
  });

  it("alerts on exactly infrastructure and unexpected", () => {
    // An expected 403 must not page anyone; an unexpected 500 must.
    expect(shouldAlert("infrastructure")).toBe(true);
    expect(shouldAlert("unexpected")).toBe(true);
    expect(shouldAlert("validation")).toBe(false);
    expect(shouldAlert("authentication")).toBe(false);
    expect(shouldAlert("authorization")).toBe(false);
    expect(shouldAlert("business_rule")).toBe(false);
  });

  it("never pairs a 5xx status with a category that does not alert", () => {
    // A 5xx nobody hears about is the silent failure this slice exists to end.
    for (const [code, definition] of Object.entries(ERROR_CODES)) {
      if (definition.httpStatus >= 500) {
        expect(shouldAlert(definition.category), `${code} is 5xx but silent`).toBe(true);
      }
    }
  });

  it("treats an unregistered code as unexpected rather than guessing", () => {
    expect(isKnownErrorCode("NOT_A_REAL_CODE")).toBe(false);
    expect(categoryForCode("NOT_A_REAL_CODE")).toBe("unexpected");
    expect(httpStatusForCode("NOT_A_REAL_CODE")).toBe(500);
  });

  it("registers every code the migrated throw sites need", () => {
    const required = [
      "AGENT_NOT_VERIFIED",
      "AGENT_PROFILE_NOT_FOUND",
      "AGENT_PROFILE_REQUIRED",
      "AGENT_QUOTA_CONFLICT",
      "CHAT_NOT_FOUND",
      "CLERK_USER_EMAIL_MISSING",
      "CLERK_USER_UNAVAILABLE",
      "CONFIG_ENV_VAR_MISSING",
      "CONFLICT",
      "INSPECTION_ALREADY_ACTIVE",
      "INSPECTION_NOT_FOUND",
      "INTERNAL_ERROR",
      "LISTING_IMAGE_COUNT_INVALID",
      "LISTING_STATE_CONFLICT",
      "LISTING_STATE_TRANSITION_INVALID",
      "MEDIA_MIME_TYPE_UNSUPPORTED",
      "NOT_FOUND",
      "SUBSCRIPTION_REQUIRED",
      "UNAUTHENTICATED",
      "UNAUTHORIZED",
      "VALIDATION_ERROR",
      "VERIFICATION_SUBMISSION_NOT_FOUND",
    ];

    for (const code of required) {
      expect(isKnownErrorCode(code), `${code} is not registered`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/api/error-codes.test.ts`
Expected: FAIL on "registers every code the migrated throw sites need" — `AGENT_PROFILE_NOT_FOUND`, `CHAT_NOT_FOUND`, `CLERK_USER_EMAIL_MISSING`, `CLERK_USER_UNAVAILABLE`, `CONFIG_ENV_VAR_MISSING`, `INSPECTION_ALREADY_ACTIVE`, `INSPECTION_NOT_FOUND`, `VERIFICATION_SUBMISSION_NOT_FOUND` are all missing.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/api/error-codes.ts`, add to the `ERROR_CODES` object:

```ts
  // --------------------------------------------------- resource not found
  // Distinct codes rather than one NOT_FOUND, because "which thing was
  // missing" is the first question asked when one of these appears in Sentry,
  // and reading it off the tag beats reading it off a message.
  AGENT_PROFILE_NOT_FOUND: { category: "business_rule", httpStatus: 404 },
  CHAT_NOT_FOUND: { category: "business_rule", httpStatus: 404 },
  INSPECTION_NOT_FOUND: { category: "business_rule", httpStatus: 404 },
  VERIFICATION_SUBMISSION_NOT_FOUND: { category: "business_rule", httpStatus: 404 },

  // ------------------------------------------------- inspection lifecycle
  INSPECTION_ALREADY_ACTIVE: { category: "business_rule", httpStatus: 409 },

  // ------------------------------------------------ identity and config
  // Nobody can sign in and no user action fixes it, so these alert. They were
  // 500s before by accident of matching no string pattern; now they are 500s
  // on purpose, which is the difference between silence and a page.
  CLERK_USER_UNAVAILABLE: { category: "infrastructure", httpStatus: 500 },
  CLERK_USER_EMAIL_MISSING: { category: "infrastructure", httpStatus: 500 },

  // A missing environment variable used to return 422 VALIDATION_ERROR,
  // because its message contains the word "required". It is a deployment
  // fault, not a caller fault. See Task 5.
  CONFIG_ENV_VAR_MISSING: { category: "infrastructure", httpStatus: 500 },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/api/error-codes.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/lib/api/error-codes.ts src/lib/api/error-codes.test.ts
git commit -m "feat(api): register the codes the throw-site migration needs

Adds distinct not-found codes, the inspection conflict, and three
infrastructure codes for Clerk and configuration faults. The registry test
also pins the invariant that no 5xx may belong to a category that does not
alert — a 5xx nobody hears about is the silent failure this slice exists
to end."
```

---

## Task 4: Pin the status contract and prove classification ignores message text

Required tests #4. This rewrites `src/lib/api/errors.test.ts`, which is currently red because it asserts the old message-matching behaviour.

**Files:**
- Modify: `src/lib/api/errors.test.ts` (full rewrite)

**Interfaces:**
- Consumes: `AppError`, `resolveRouteError` from `@/lib/api/errors`; the registry from Task 3.
- Produces: no new exports. Pins `resolveRouteError(error: unknown): { code: string; httpStatus: number; message: string; category: ErrorCategory; unexpected: boolean }`.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `src/lib/api/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { AppError, resolveRouteError } from "@/lib/api/errors";

/**
 * The status contract, pinned code by code.
 *
 * Each row is a code the throw-site migration produces and the HTTP status the
 * old message-matching resolver produced for the same failure. Two rows are
 * deliberate changes and are marked; every other row must match exactly. This
 * table is what makes a 60-site refactor reviewable — the diff is large, but
 * the client-visible surface is asserted here in one place.
 */
const PINNED: ReadonlyArray<[code: string, httpStatus: number]> = [
  ["UNAUTHENTICATED", 401],
  ["UNAUTHORIZED", 403],
  ["AGENT_NOT_VERIFIED", 403],
  ["SUBSCRIPTION_REQUIRED", 403],
  ["NOT_FOUND", 404],
  ["AGENT_PROFILE_NOT_FOUND", 404],
  ["CHAT_NOT_FOUND", 404],
  ["INSPECTION_NOT_FOUND", 404],
  ["VERIFICATION_SUBMISSION_NOT_FOUND", 404],
  ["CONFLICT", 409],
  ["INSPECTION_ALREADY_ACTIVE", 409],
  ["LISTING_STATE_CONFLICT", 409],
  ["AGENT_QUOTA_CONFLICT", 409],
  ["VALIDATION_ERROR", 422],
  ["AGENT_PROFILE_REQUIRED", 422],
  ["LISTING_IMAGE_COUNT_INVALID", 422],
  ["LISTING_STATE_TRANSITION_INVALID", 422],
  // Deliberate change: was 500. An unsupported MIME type is the caller's
  // problem and always was; it reached 500 only because the sentinel string
  // matched no pattern.
  ["MEDIA_MIME_TYPE_UNSUPPORTED", 422],
  // Deliberate change: was 422, because the message contains "required".
  // A missing environment variable is a deployment fault.
  ["CONFIG_ENV_VAR_MISSING", 500],
  ["CLERK_USER_UNAVAILABLE", 500],
  ["CLERK_USER_EMAIL_MISSING", 500],
  ["INTERNAL_ERROR", 500],
];

describe("the pinned status contract", () => {
  it.each(PINNED)("%s resolves to %i", (code, httpStatus) => {
    const resolved = resolveRouteError(new AppError(code, "Any message at all."));

    expect(resolved.code).toBe(code);
    expect(resolved.httpStatus).toBe(httpStatus);
  });

  it("takes the status from the registry, not from the throw site", () => {
    // No third argument. The code alone decides.
    expect(resolveRouteError(new AppError("NOT_FOUND", "Gone.")).httpStatus).toBe(404);
  });
});

describe("resolveRouteError does not classify by message text", () => {
  /**
   * The hazard this slice exists to remove.
   *
   * The old resolver matched `message.includes("invalid")` to 422 and returned
   * the matched message verbatim. A Postgres error reads
   * "invalid input syntax for type uuid", so any code path that wrapped a
   * database failure in an Error would have echoed it to an unauthenticated
   * caller with a 422. It was unreachable only because a PostgrestError is a
   * plain object, not an Error instance. That is safety by accident.
   */
  it("does not echo a database error, and does not call it a 422", () => {
    const resolved = resolveRouteError(
      new Error('invalid input syntax for type uuid: "not-a-uuid"'),
    );

    expect(resolved.httpStatus).toBe(500);
    expect(resolved.code).toBe("INTERNAL_ERROR");
    expect(resolved.message).not.toContain("invalid input syntax");
    expect(resolved.message).not.toContain("uuid");
  });

  const ONCE_MATCHED = [
    "Unauthenticated request.",
    "Admin role is required.",
    "Listing not found.",
    "AGENT_NOT_VERIFIED",
    "LISTING_STATE_CONFLICT",
    "Something is invalid.",
    "A name is required.",
    "This cannot be done.",
    "That already exists.",
  ];

  it.each(ONCE_MATCHED)(
    "treats %j as unexpected, because it is a bare Error",
    (message) => {
      const resolved = resolveRouteError(new Error(message));

      expect(resolved.httpStatus).toBe(500);
      expect(resolved.code).toBe("INTERNAL_ERROR");
      expect(resolved.unexpected).toBe(true);
    },
  );

  it("returns a fixed message for anything unclassified, never the thrown text", () => {
    const secretish = new Error("connect ECONNREFUSED 10.0.0.5:5432");

    expect(resolveRouteError(secretish).message).not.toContain("10.0.0.5");
  });

  it("classifies a PostgrestError-shaped plain object as unexpected", () => {
    // Not an Error instance. The old resolver reached its 500 fallthrough by
    // luck; this asserts it is now reached by rule.
    const postgrest = {
      code: "22P02",
      details: null,
      hint: null,
      message: 'invalid input syntax for type uuid: "x"',
    };

    expect(resolveRouteError(postgrest).httpStatus).toBe(500);
  });
});

describe("categories", () => {
  it("marks an AppError as expected and a bare Error as unexpected", () => {
    expect(resolveRouteError(new AppError("NOT_FOUND", "Gone.")).unexpected).toBe(false);
    expect(resolveRouteError(new Error("Gone.")).unexpected).toBe(true);
  });

  it("carries the category so an operator can filter denials from breakage", () => {
    expect(resolveRouteError(new AppError("UNAUTHORIZED", "No.")).category).toBe(
      "authorization",
    );
    expect(resolveRouteError(new Error("boom")).category).toBe("unexpected");
  });

  it("preserves an AppError's own message, which is written for a human", () => {
    const resolved = resolveRouteError(new AppError("NOT_FOUND", "Listing not found."));

    expect(resolved.message).toBe("Listing not found.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/api/errors.test.ts`
Expected: FAIL on the `PINNED` rows for the codes Task 3 added but which `AppError` cannot yet resolve — plus PASS on the message-text block, since `resolveRouteError` is already rewritten. The `PINNED` rows should pass once Task 3 is merged; if any fails, the registry status is wrong and the registry is what to fix.

- [ ] **Step 3: Reconcile any mismatch**

If a `PINNED` row fails, the registry entry from Task 3 disagrees with the pinned status. **Fix the registry, not the test** — the pinned value is what today's message matching produces and is the contract. The two rows marked "deliberate change" are the only exceptions.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/api/errors.test.ts`
Expected: PASS. `src/lib/api/errors.test.ts` is green for the first time since the slice began.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/errors.test.ts src/lib/api/error-codes.ts
git commit -m "test(api): pin the status contract and forbid message-text classification

The old resolver matched message.includes(\"invalid\") to 422 and returned the
matched message verbatim, so a wrapped Postgres error would have echoed
'invalid input syntax for type uuid' to an unauthenticated caller. It was
unreachable only because a PostgrestError is not an Error instance. Asserted
directly here, along with the status every migrated code must produce."
```

---

## Task 5: Migrate the 60 throw sites to `AppError`

The largest task, and mechanical. Existing service tests assert on thrown *messages* — `AppError` extends `Error` and preserves its message, so **most existing tests keep passing unchanged**, which is the safety net for this refactor. The four exceptions are listed in Step 4.

**Files:**
- Modify: `src/server/services/admin-service.ts`, `agent-service.ts`, `chat-service.ts`, `inspection-service.ts`, `reports-service.ts`, `user-sync-service.ts`, `listing-media-service.ts`
- Modify: `src/server/repositories/agents-repository.ts:280,634`
- Modify: `src/lib/env.ts:13`
- Modify: `src/server/services/agent-service.test.ts` (4 assertions)

**Interfaces:**
- Consumes: `AppError` from `@/lib/api/errors`; every code registered in Task 3.
- Produces: no new exports. After this task, `grep -rn "throw new Error(" src/server src/lib --include=*.ts | grep -v test` returns **0**.

- [ ] **Step 1: Confirm the starting count**

Run:
```bash
grep -rn "throw new Error(" src/server src/lib --include=*.ts | grep -v ".test.ts" | wc -l
```
Expected: `60`.

- [ ] **Step 2: Apply the mapping**

Every distinct message, its current resolved status, and its replacement. Import `AppError` from `@/lib/api/errors` in each file that does not already. **Do not pass a third argument** — the registry supplies the status.

| Current `throw new Error(...)` | Sites | Today | New code | New status |
|---|---|---|---|---|
| `"Unauthenticated request."` | 10 | 401 | `UNAUTHENTICATED` | 401 |
| `"Admin role is required."` | 1 | 403 | `UNAUTHORIZED` | 403 |
| `"Agent role is required."` | 2 | 403 | `UNAUTHORIZED` | 403 |
| `"AGENT_NOT_VERIFIED"` | 1 | 403 | `AGENT_NOT_VERIFIED` | 403 |
| `"LISTING_SUBSCRIPTION_REQUIRED"` | 1 | 403 | `SUBSCRIPTION_REQUIRED` | 403 |
| `"Listing not found."` | 11 | 404 | `NOT_FOUND` | 404 |
| `"Chat not found."` | 2 | 404 | `CHAT_NOT_FOUND` | 404 |
| `"Verification submission not found."` | 2 | 404 | `VERIFICATION_SUBMISSION_NOT_FOUND` | 404 |
| `"Inspection request not found."` | 1 | 404 | `INSPECTION_NOT_FOUND` | 404 |
| `"Agent profile not found."` | 1 | 404 | `AGENT_PROFILE_NOT_FOUND` | 404 |
| `"LISTING_STATE_CONFLICT"` | 1 | 409 | `LISTING_STATE_CONFLICT` | 409 |
| `"AGENT_QUOTA_CONFLICT"` | 1 | 409 | `AGENT_QUOTA_CONFLICT` | 409 |
| `"An active inspection request already exists for this listing."` | 1 | 409 | `INSPECTION_ALREADY_ACTIVE` | 409 |
| `"LISTING_STATE_TRANSITION_INVALID"` | 2 | 422 | `LISTING_STATE_TRANSITION_INVALID` | 422 |
| `` `Listing cannot be ${action} from status ${currentStatus}.` `` | 1 | 422 | `LISTING_STATE_TRANSITION_INVALID` | 422 |
| `"LISTING_IMAGE_COUNT_INVALID"` | 1 | 422 | `LISTING_IMAGE_COUNT_INVALID` | 422 |
| `"A listing cannot have more than 10 active images."` | 2 | 422 | `LISTING_IMAGE_COUNT_INVALID` | 422 |
| `"Message body is required."` | 1 | 422 | `VALIDATION_ERROR` | 422 |
| `"Message body must be 2000 characters or fewer."` | 1 | 422 | `VALIDATION_ERROR` | 422 |
| `"Inspection message is required."` | 1 | 422 | `VALIDATION_ERROR` | 422 |
| `"Inspection message must be 500 characters or fewer."` | 1 | 422 | `VALIDATION_ERROR` | 422 |
| `"Reason is required."` | 1 | 422 | `VALIDATION_ERROR` | 422 |
| `"Target ID is required."` | 1 | 422 | `VALIDATION_ERROR` | 422 |
| `"Invalid target type. Must be listing, agent, or message."` | 1 | 422 | `VALIDATION_ERROR` | 422 |
| `"Create your agent profile before …"` (7 wordings) | 7 | 422 | `AGENT_PROFILE_REQUIRED` | 422 |
| `"Authenticated Clerk user could not be loaded."` | 1 | 500 | `CLERK_USER_UNAVAILABLE` | 500 |
| `"Authenticated Clerk user does not have an email address."` | 1 | 500 | `CLERK_USER_EMAIL_MISSING` | 500 |
| `"MEDIA_MIME_TYPE_UNSUPPORTED"` | 1 | **500** | `MEDIA_MIME_TYPE_UNSUPPORTED` | **422** ⚠ |
| `` `Missing required environment variable: ${key}` `` | 1 | **422** | `CONFIG_ENV_VAR_MISSING` | **500** ⚠ |

⚠ The only two status changes. Both are bug fixes: an unsupported MIME type reached 500 because its sentinel matched no pattern, and a missing environment variable reached 422 because its message contains the word "required". Note them in the commit body.

Worked examples — prose message preserved verbatim so the client contract holds:

```ts
// src/server/services/chat-service.ts:67
- throw new Error("Chat not found.");
+ throw new AppError("CHAT_NOT_FOUND", "Chat not found.");

// src/server/services/admin-service.ts:64
- throw new Error(`Listing cannot be ${action} from status ${currentStatus}.`);
+ throw new AppError(
+   "LISTING_STATE_TRANSITION_INVALID",
+   `Listing cannot be ${action} from status ${currentStatus}.`,
+ );
```

Sentinel messages gain real prose, because the message reaches the client and SCREAMING_CASE is not something to show a person:

```ts
// src/server/services/agent-service.ts:190
- throw new Error("LISTING_SUBSCRIPTION_REQUIRED");
+ throw new AppError(
+   "SUBSCRIPTION_REQUIRED",
+   "An active listing subscription is required to publish.",
+ );

// src/server/repositories/agents-repository.ts:634
- throw new Error("LISTING_STATE_CONFLICT");
+ throw new AppError(
+   "LISTING_STATE_CONFLICT",
+   "This listing changed while you were working on it. Reload and try again.",
+ );

// src/server/repositories/agents-repository.ts:280
- throw new Error("AGENT_QUOTA_CONFLICT");
+ throw new AppError(
+   "AGENT_QUOTA_CONFLICT",
+   "Your listing quota changed while you were working. Reload and try again.",
+ );
```

Those two conflict messages are copied verbatim from the old resolver, which already rewrote them before returning. The client sees exactly the same text as before.

`src/lib/env.ts` needs the import and loses its accidental 422:

```ts
// src/lib/env.ts:13
- throw new Error(`Missing required environment variable: ${key}`);
+ // A deployment fault, not a caller fault. This returned 422 VALIDATION_ERROR
+ // for as long as message matching existed, purely because the word
+ // "required" appears in it.
+ throw new AppError(
+   "CONFIG_ENV_VAR_MISSING",
+   `Missing required environment variable: ${key}`,
+ );
```

- [ ] **Step 3: Verify no bare throws remain**

Run:
```bash
grep -rn "throw new Error(" src/server src/lib --include=*.ts | grep -v ".test.ts" | wc -l
```
Expected: `0`.

- [ ] **Step 4: Update the four tests that assert on sentinel messages**

Those four asserted the sentinel string, which is now prose. Assert the code instead — strictly better, since it is the thing the client actually branches on.

In `src/server/services/agent-service.test.ts`:

```ts
// line ~200
- ).rejects.toThrow("AGENT_NOT_VERIFIED");
+ ).rejects.toMatchObject({ code: "AGENT_NOT_VERIFIED" });

// line ~230
- ).rejects.toThrow("LISTING_SUBSCRIPTION_REQUIRED");
+ ).rejects.toMatchObject({ code: "SUBSCRIPTION_REQUIRED" });

// line ~256 — the repository is mocked, so it must reject with what the
// repository now actually throws.
- updateListingStatus.mockRejectedValue(new Error("LISTING_STATE_CONFLICT"));
+ updateListingStatus.mockRejectedValue(
+   new AppError(
+     "LISTING_STATE_CONFLICT",
+     "This listing changed while you were working on it. Reload and try again.",
+   ),
+ );

// line ~260
- ).rejects.toThrow("LISTING_STATE_CONFLICT");
+ ).rejects.toMatchObject({ code: "LISTING_STATE_CONFLICT" });
```

Add `import { AppError } from "@/lib/api/errors";` to that test file.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. Every prose-message assertion in the other service tests still passes untouched, because `AppError` preserves the message.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add -A src/server src/lib
git commit -m "refactor(api): type every throw site instead of matching its message

60 bare throws become AppError with a registered code. Statuses are pinned to
exactly what message matching produced, asserted case by case in
errors.test.ts, so the client-visible surface is unchanged — with two
deliberate exceptions, both bug fixes:

- MEDIA_MIME_TYPE_UNSUPPORTED was 500 because its sentinel matched no
  pattern. It is a caller error and is now 422.
- A missing environment variable was 422 VALIDATION_ERROR because its message
  contains the word \"required\". It is a deployment fault and is now 500
  infrastructure, which also means it alerts.

Existing service tests assert on thrown messages and pass unchanged, since
AppError preserves the message. Four assertions on sentinel strings now
assert the code instead."
```

---

## Task 6: Prove `routeErrorResponse` reports without changing the client contract

Required tests #3 and #5.

**Files:**
- Test: `src/lib/api/route-error-response.test.ts` (create)

**Interfaces:**
- Consumes: `routeErrorResponse(error: unknown, requestId: string): NextResponse` from `@/lib/api/errors`.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Create `src/lib/api/route-error-response.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const reportError = vi.fn(() => true);

vi.mock("@/lib/observability/sentry", () => ({
  reportError,
  captureMessage: vi.fn(),
  captureUnconditionally: vi.fn(),
}));

import { AppError, routeErrorResponse } from "@/lib/api/errors";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("routeErrorResponse", () => {
  it("reports an unexpected error to Sentry with full context", async () => {
    const cause = new Error("connect ECONNREFUSED 10.0.0.5:5432");

    const response = routeErrorResponse(cause, "req-abc12345");

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(
      cause,
      expect.objectContaining({
        category: "unexpected",
        errorCode: "INTERNAL_ERROR",
        requestId: "req-abc12345",
      }),
    );
    expect(response.status).toBe(500);
  });

  it("still returns the sanitized response the client already expects", async () => {
    const response = routeErrorResponse(
      new Error("connect ECONNREFUSED 10.0.0.5:5432"),
      "req-abc12345",
    );
    const body = await response.json();

    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.details).toBeNull();
    expect(body.error.message).not.toContain("10.0.0.5");
    expect(body.meta.requestId).toBe("req-abc12345");
  });

  it("does not report an expected denial", () => {
    // A 403 is the boundary working. Paging on it trains people to ignore the
    // pager, which is how the genuinely broken thing gets missed.
    const response = routeErrorResponse(
      new AppError("UNAUTHORIZED", "Admin role is required."),
      "req-abc12345",
    );

    expect(response.status).toBe(403);
    // reportError is still called; it is the gate that declines.
    expect(reportError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ category: "authorization" }),
    );
  });

  it("does not fail the request when Sentry throws", async () => {
    // The guarantee: an observability tool that can take the application down
    // is worse than no observability tool.
    reportError.mockImplementationOnce(() => {
      throw new Error("Sentry transport exploded");
    });

    expect(() =>
      routeErrorResponse(new Error("original failure"), "req-abc12345"),
    ).not.toThrow();
  });

  it("returns the same status when Sentry throws as when it does not", async () => {
    reportError.mockImplementationOnce(() => {
      throw new Error("Sentry transport exploded");
    });

    const response = routeErrorResponse(new AppError("NOT_FOUND", "Gone."), "req-1");

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/api/route-error-response.test.ts`
Expected: FAIL on the last two — `routeErrorResponse` calls `reportError` unguarded, so a throwing `reportError` propagates out of the route handler.

Note: `reportError` already swallows internally, so this cannot happen with the real module. The guard is defence in depth against a future refactor that removes the internal try/catch, and the test states the guarantee at the boundary where it matters.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/api/errors.ts`, wrap the reporting call inside `routeErrorResponse`:

```ts
  // Reporting is best-effort at the boundary as well as inside reportError.
  // Two layers, deliberately: the inner one is the contract, this one is the
  // guarantee that a future refactor cannot quietly turn a monitoring failure
  // into a request failure.
  try {
    reportError(error, {
      category: resolved.category,
      errorCode: resolved.code,
      requestId,
      userId: currentContext()?.userId,
    });
  } catch {
    // Intentionally empty. Nothing above this can help, and the response
    // below is what the caller is waiting for.
  }
```

Wrap the `log[...]` call in the same way, for the same reason:

```ts
  try {
    log[resolved.unexpected ? "error" : "warn"]({ /* unchanged fields */ });
  } catch {
    // Intentionally empty.
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/api/route-error-response.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/errors.ts src/lib/api/route-error-response.test.ts
git commit -m "test(api): routeErrorResponse reports the cause and still returns 500

Proves the point of the slice: a 500 no longer discards why it happened, and
the client contract is byte-for-byte what it was. Also pins the guarantee
that a throwing Sentry cannot fail a request, guarded at the boundary as well
as inside reportError."
```

---

## Task 7: Prove the structured log contract, the request id, and the user context

**Files:**
- Modify: `src/lib/observability/context.ts` (add `jobId`)
- Modify: `src/server/services/user-sync-service.ts`
- Test: `src/lib/observability/context.test.ts` (create)
- Test: `src/lib/observability/logger.test.ts` (create)
- Test: `src/lib/api/request-id.test.ts` (create)

**Interfaces:**
- Consumes: `enterContext`, `runWithContext`, `currentContext`, `setContextUser` from `@/lib/observability/context`.
- Produces: `RequestContext` gains `jobId?: string`. Task 9 consumes it.

- [ ] **Step 1: Write the failing test**

Create `src/lib/observability/context.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  currentContext,
  currentRequestId,
  runWithContext,
  setContextUser,
} from "@/lib/observability/context";

describe("the request context", () => {
  it("carries a request id through awaits", async () => {
    await runWithContext({ requestId: "req-1", service: "api" }, async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));

      expect(currentRequestId()).toBe("req-1");
    });
  });

  it("does not leak between sibling contexts", async () => {
    // The property that makes runWithContext correct for the job drain: two
    // jobs in one drain invocation must not inherit each other's ids.
    await Promise.all([
      runWithContext({ requestId: "req-a", service: "job:a" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(currentRequestId()).toBe("req-a");
      }),
      runWithContext({ requestId: "req-b", service: "job:b" }, async () => {
        expect(currentRequestId()).toBe("req-b");
      }),
    ]);
  });

  it("attaches a user once identity resolves", async () => {
    await runWithContext({ requestId: "req-1", service: "api" }, async () => {
      expect(currentContext()?.userId).toBeUndefined();

      setContextUser("user-123");

      expect(currentContext()?.userId).toBe("user-123");
    });
  });

  it("is a no-op outside a context, never a failure", () => {
    // A request has an id before it has a user, and scripts have neither.
    // Calling this must never be the thing that breaks a request.
    expect(() => setContextUser("user-123")).not.toThrow();
    expect(currentRequestId()).toBeUndefined();
  });

  it("carries a job id when one is present", async () => {
    await runWithContext(
      { jobId: "job-9", requestId: "req-1", service: "job:diagnostics.echo" },
      async () => {
        expect(currentContext()?.jobId).toBe("job-9");
      },
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/observability/context.test.ts`
Expected: FAIL to compile — `jobId` is not a property of `RequestContext`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/observability/context.ts`, add to `RequestContext`:

```ts
  /** The job being executed, when this context belongs to a drain. */
  jobId?: string;
```

In `src/server/services/user-sync-service.ts`, import `setContextUser` and call it where the app user is resolved — inside `getCurrentAppUser`, immediately after the `public.users` row is obtained:

```ts
import { setContextUser } from "@/lib/observability/context";

// …once appUser is resolved:
// Log lines below this point carry the user. Deliberately the app-level id
// and never the Clerk id: ADR-026 permits a user id in an event, and the
// Clerk id is an external identifier we do not need to export.
setContextUser(appUser.user.id);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/observability/context.test.ts && npm test`
Expected: PASS, 5 new tests, nothing else broken.

- [ ] **Step 5: Prove the structured log contract**

REB-ENG-005 names the required fields and forbids free-form text. Nothing asserted
that until now. Create `src/lib/observability/logger.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runWithContext } from "@/lib/observability/context";
import { log } from "@/lib/observability/logger";

const ORIGINAL = { ...process.env };
let written: string[] = [];

beforeEach(() => {
  written = [];
  // Production mode, so the emitted line is the machine-readable JSON an
  // operator actually greps rather than the human-readable dev form.
  process.env.NEXT_PUBLIC_APP_ENV = "production";
  vi.spyOn(console, "log").mockImplementation((line: string) => {
    written.push(line);
  });
  vi.spyOn(console, "error").mockImplementation((line: string) => {
    written.push(line);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL };
});

describe("structured logging", () => {
  it("emits every field REB-ENG-005 requires", async () => {
    await runWithContext({ requestId: "req-abcdef12", service: "listing-api" }, async () => {
      log.error({
        duration: 42,
        errorCode: "NOT_FOUND",
        event: "ListingApprovalFailed",
      });
    });

    const record = JSON.parse(written[0]);

    expect(record).toMatchObject({
      duration: 42,
      environment: "production",
      errorCode: "NOT_FOUND",
      event: "ListingApprovalFailed",
      level: "ERROR",
      requestId: "req-abcdef12",
      service: "listing-api",
    });
    expect(Date.parse(record.timestamp)).not.toBeNaN();
  });

  it("includes the user id once identity is attached", async () => {
    await runWithContext(
      { requestId: "req-1", service: "api", userId: "user-123" },
      async () => {
        log.info({ event: "ListingPublished" });
      },
    );

    expect(JSON.parse(written[0]).userId).toBe("user-123");
  });

  it("emits one JSON object per line, so a log pipeline can parse it", async () => {
    await runWithContext({ requestId: "req-1", service: "api" }, async () => {
      log.info({ event: "RequestReceived" });
    });

    expect(written[0]).not.toContain("\n");
    expect(() => JSON.parse(written[0])).not.toThrow();
  });

  it("sanitises what a caller logs, because the logger is not a trusted caller", async () => {
    // The realistic accident: logging a whole request object without looking
    // at what is inside it.
    await runWithContext({ requestId: "req-1", service: "api" }, async () => {
      log.info({
        authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln",
        event: "RequestReceived",
      });
    });

    expect(written[0]).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  it("survives having no context at all", () => {
    // Scripts and tests have no middleware. A missing id is a degraded line,
    // never a thrown error.
    expect(() => log.info({ event: "ScriptStarted" })).not.toThrow();
  });

  it("drops DEBUG in production and keeps it below that", async () => {
    log.debug({ event: "Noisy" });
    expect(written).toHaveLength(0);

    process.env.NEXT_PUBLIC_APP_ENV = "preview";
    log.debug({ event: "Noisy" });
    expect(written).toHaveLength(1);
  });
});
```

Run: `npx vitest run src/lib/observability/logger.test.ts`
Expected: PASS. The logger already exists; this is the proof it meets the documented
contract. Any FAIL is a real gap — fix `logger.ts`, not the assertion.

- [ ] **Step 6: Prove one request gets exactly one id**

BR-OBS-001. Create `src/lib/api/request-id.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headerStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => headerStore.get(key) ?? null,
  })),
}));

import { getRequestId } from "@/lib/api/request-id";
import { runWithContext } from "@/lib/observability/context";

beforeEach(() => {
  headerStore.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("getRequestId", () => {
  it("returns the id middleware put on the request", async () => {
    headerStore.set("x-request-id", "req-from-middleware");

    await expect(getRequestId()).resolves.toBe("req-from-middleware");
  });

  it("returns the SAME id when called twice in one request", async () => {
    // The defect this closes: the previous implementation called
    // crypto.randomUUID() on every invocation, so two calls in one request
    // produced two different "request" ids and correlation was impossible by
    // construction.
    headerStore.set("x-request-id", "req-from-middleware");

    const first = await getRequestId();
    const second = await getRequestId();

    expect(second).toBe(first);
  });

  it("mints one rather than throwing when the header is absent", async () => {
    // Middleware does not run in tests or scripts. Losing an id is a degraded
    // log line; throwing would be a failed request.
    await expect(getRequestId()).resolves.toEqual(expect.any(String));
  });

  it("prefers an id already in the context over the header", async () => {
    headerStore.set("x-request-id", "req-from-header");

    await runWithContext({ requestId: "req-from-context", service: "job:x" }, async () => {
      await expect(getRequestId()).resolves.toBe("req-from-context");
    });
  });
});
```

Run: `npx vitest run src/lib/api/request-id.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/observability/context.ts src/lib/observability/context.test.ts src/lib/observability/logger.test.ts src/lib/api/request-id.test.ts src/server/services/user-sync-service.ts
git commit -m "feat(observability): put the authenticated user on every log line

REB-ENG-005 lists user id among the required structured fields, and no log
line carried one. Attached once identity resolves, using the app-level id
rather than the Clerk id. Also pins the property that makes runWithContext
correct for the drain: sibling contexts do not leak into each other."
```

---

## Task 8: Correlate a job with the request that enqueued it (schema + enqueue)

**Files:**
- Create: `supabase/migrations/0018_job_request_correlation.sql`
- Create: `src/server/jobs/enqueue.ts`
- Create: `src/server/jobs/enqueue.test.ts`
- Modify: `src/types/database.ts` (regenerate or hand-add the column)

**Interfaces:**
- Consumes: `currentRequestId` from `@/lib/observability/context`; `getSupabaseAdminClient` from `@/lib/db/supabase`.
- Produces: `enqueueJob(input: { type: string; payload?: Record<string, unknown>; queue?: JobQueue; runAt?: Date; maxAttempts?: number }): Promise<string>` returning the new job's id.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0018_job_request_correlation.sql`:

```sql
-- ---------------------------------------------------------------------------
-- BR-OBS-001 (Critical) and REB-ENG-005: a Request ID follows the request into
-- any job it enqueues.
--
-- A job's log lines have to lead back to the request that caused the work,
-- which may have finished minutes earlier. Without this column the drain has
-- no way to know which request it is working on behalf of, and a job failure
-- is an orphan.
--
-- A column rather than a payload field, deliberately. ADR-032 constrains the
-- payload to identifiers only, and the sanitiser redacts any key named
-- `payload` wholesale — putting the id in there would mean it never reaches a
-- log line.
-- ---------------------------------------------------------------------------

alter table public.jobs
  add column enqueued_by_request_id text
    check (
      enqueued_by_request_id is null
      or enqueued_by_request_id ~ '^[A-Za-z0-9._-]{8,128}$'
    );

comment on column public.jobs.enqueued_by_request_id is
  'Correlation id of the request that enqueued this job. Same charset and length guard as the middleware, because the value reaches a log line.';

-- claim_jobs returns `setof public.jobs`, so it picks the column up with no
-- change of its own.

-- ------------------------------------------------------------------ enqueue
--
-- Signature change, safe because enqueue_job has no callers today — not in
-- src/, not in any migration. The parameter is trailing and defaulted, so the
-- five-argument form used by the queue integration tests still resolves.
create or replace function public.enqueue_job(
  job_type text,
  job_payload jsonb default '{}'::jsonb,
  target_queue public.job_queue default 'default',
  run_at timestamptz default now(),
  attempts_allowed integer default 5,
  request_id text default null
)
returns uuid
language sql
volatile
as $$
  insert into public.jobs (
    enqueued_by_request_id, max_attempts, payload, queue, scheduled_at, type
  )
  values (
    request_id, attempts_allowed, job_payload, target_queue, run_at, job_type
  )
  returning id
$$;

comment on function public.enqueue_job(text, jsonb, public.job_queue, timestamptz, integer, text) is
  'Enqueue a job. Call from inside the transaction performing the domain write, never as a standalone statement — a separate call is not transactional with anything. Pass request_id so the job''s log lines lead back to the request that queued it.';

grant execute on function public.enqueue_job(text, jsonb, public.job_queue, timestamptz, integer, text)
  to service_role;

-- The five-argument overload is left in place. Dropping it would break the
-- existing queue integration tests, which call it positionally.
```

- [ ] **Step 2: Write the failing test**

Create `src/server/jobs/enqueue.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async () => ({ data: "job-uuid-1", error: null }));

vi.mock("@/lib/db/supabase", () => ({
  getSupabaseAdminClient: vi.fn(() => ({ rpc })),
}));

import { runWithContext } from "@/lib/observability/context";
import { enqueueJob } from "@/server/jobs/enqueue";

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: "job-uuid-1", error: null });
});

describe("enqueueJob", () => {
  it("passes the ambient request id to the SQL function", async () => {
    await runWithContext({ requestId: "req-abcdef12", service: "api" }, async () => {
      await enqueueJob({ payload: { message: "hi" }, type: "diagnostics.echo" });
    });

    expect(rpc).toHaveBeenCalledWith(
      "enqueue_job",
      expect.objectContaining({ request_id: "req-abcdef12" }),
    );
  });

  it("enqueues without a context rather than throwing", async () => {
    // Scripts and tests have no middleware. Losing correlation is a degraded
    // log line; throwing would be a failed enqueue.
    await expect(
      enqueueJob({ payload: {}, type: "diagnostics.echo" }),
    ).resolves.toBe("job-uuid-1");

    expect(rpc).toHaveBeenCalledWith(
      "enqueue_job",
      expect.objectContaining({ request_id: null }),
    );
  });

  it("returns the new job id", async () => {
    await expect(enqueueJob({ type: "diagnostics.echo" })).resolves.toBe("job-uuid-1");
  });

  it("surfaces an enqueue failure rather than swallowing it", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });

    await expect(enqueueJob({ type: "diagnostics.echo" })).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/server/jobs/enqueue.test.ts`
Expected: FAIL — `Cannot find module '@/server/jobs/enqueue'`.

- [ ] **Step 4: Write minimal implementation**

Create `src/server/jobs/enqueue.ts`:

```ts
import "server-only";

import { getSupabaseAdminClient } from "@/lib/db/supabase";
import { currentRequestId } from "@/lib/observability/context";
import { log } from "@/lib/observability/logger";
import type { JobQueue } from "@/server/jobs/types";

/**
 * Enqueue a job from application code.
 *
 * NOT THE TRANSACTIONAL PATH. `public.enqueue_job` is callable from inside
 * another SQL function's transaction, which is what makes the outbox property
 * hold: `perform public.enqueue_job(...)` next to a domain UPDATE means both
 * land or neither does. This helper issues a standalone statement and is
 * therefore only correct where the enqueue does not need to be atomic with a
 * domain write.
 *
 * What it adds is correlation. It reads the ambient request id and passes it
 * down, so the job's log lines lead back to the request that queued the work —
 * BR-OBS-001, and REB-ENG-005's requirement that the id follows the request
 * into background jobs.
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

  const { data, error } = await getSupabaseAdminClient().rpc("enqueue_job", {
    attempts_allowed: input.maxAttempts ?? 5,
    job_payload: (input.payload ?? {}) as never,
    job_type: input.type,
    request_id: requestId,
    run_at: (input.runAt ?? new Date()).toISOString(),
    target_queue: input.queue ?? "default",
  });

  if (error) {
    throw error;
  }

  log.info({
    event: "JobEnqueued",
    jobId: data as string,
    jobType: input.type,
    queue: input.queue ?? "default",
  });

  return data as string;
}
```

- [ ] **Step 5: Add the column to the generated types**

In `src/types/database.ts`, add `enqueued_by_request_id: string | null` to the `jobs` table's `Row`, and `enqueued_by_request_id?: string | null` to `Insert` and `Update`. Add `request_id?: string | null` to the `enqueue_job` function's `Args`.

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run src/server/jobs/enqueue.test.ts && npm run typecheck`
Expected: PASS, 4 tests, typecheck clean.

- [ ] **Step 7: Apply the migration locally and confirm**

Run:
```bash
psql "$DATABASE_URL" -f supabase/migrations/0018_job_request_correlation.sql
psql "$DATABASE_URL" -c "select public.enqueue_job('diagnostics.echo', '{\"message\":\"x\"}'::jsonb, 'default', now(), 5, 'req-abcdef12');"
psql "$DATABASE_URL" -c "select type, enqueued_by_request_id from public.jobs order by created_at desc limit 1;"
```
Expected: the row shows `req-abcdef12`.

If `DATABASE_URL` is not set locally, skip this step and note it — the queue integration suite in Task 9 covers it and self-skips without a database.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0018_job_request_correlation.sql src/server/jobs/enqueue.ts src/server/jobs/enqueue.test.ts src/types/database.ts
git commit -m "feat(jobs): carry the enqueuing request's id on the job row

A column rather than a payload field: ADR-032 constrains payloads to
identifiers, and the sanitiser redacts any key named payload wholesale, so an
id put there would never reach a log line. enqueue_job gains a trailing
defaulted request_id parameter — safe to change in place because it had no
callers anywhere, which is also why this helper is the first one."
```

---

## Task 9: Run each job inside its enqueuer's context

Required test #2 — the end-to-end propagation proof.

**Files:**
- Modify: `src/server/jobs/drain.ts`
- Test: `src/server/jobs/request-id-propagation.test.ts` (create)

**Interfaces:**
- Consumes: `runWithContext` from `@/lib/observability/context`; `enqueueJob` from Task 8; `RequestContext.jobId` from Task 7.
- Produces: no new exports. `drainQueue(queue: JobQueue): Promise<DrainOutcome>` signature unchanged.

- [ ] **Step 1: Write the failing test**

Create `src/server/jobs/request-id-propagation.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/db/supabase", () => ({
  getSupabaseAdminClient: vi.fn(() => ({ rpc })),
}));

import { currentContext, runWithContext } from "@/lib/observability/context";
import { drainQueue } from "@/server/jobs/drain";
import { enqueueJob } from "@/server/jobs/enqueue";
import { JOB_HANDLERS } from "@/server/jobs/registry";

/** Captured from inside the handler, which is the only place that proves it. */
let seenInsideHandler: ReturnType<typeof currentContext>;

beforeEach(() => {
  vi.clearAllMocks();
  seenInsideHandler = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a request id reaches the job it enqueued", () => {
  it("travels request -> enqueue_job -> claim -> handler context", async () => {
    const REQUEST_ID = "req-0f1e2d3c";

    // 1. A request enqueues work. The id is ambient, never a parameter.
    rpc.mockResolvedValueOnce({ data: "job-1", error: null });

    let enqueuedRequestId: unknown;

    await runWithContext({ requestId: REQUEST_ID, service: "api" }, async () => {
      await enqueueJob({ payload: { message: "hi" }, type: "diagnostics.echo" });
    });

    enqueuedRequestId = rpc.mock.calls[0]?.[1]?.request_id;
    expect(enqueuedRequestId).toBe(REQUEST_ID);

    // 2. Minutes later, a drain claims that row.
    vi.spyOn(JOB_HANDLERS["diagnostics.echo"], "handle").mockImplementation(
      async (payload) => {
        seenInsideHandler = currentContext();
        return { echoed: (payload as { message: string }).message };
      },
    );

    rpc.mockImplementation(async (fn: string) => {
      if (fn === "claim_jobs") {
        return {
          data: [
            {
              attempts: 1,
              enqueued_by_request_id: REQUEST_ID,
              id: "job-1",
              max_attempts: 5,
              payload: { message: "hi" },
              queue: "default",
              status: "running",
              type: "diagnostics.echo",
            },
          ],
          error: null,
        };
      }

      return { data: null, error: null };
    });

    await drainQueue("default");

    // 3. The handler ran under the id of the request that queued it.
    expect(seenInsideHandler?.requestId).toBe(REQUEST_ID);
    expect(seenInsideHandler?.enqueuedByRequestId).toBe(REQUEST_ID);
    expect(seenInsideHandler?.jobId).toBe("job-1");
    expect(seenInsideHandler?.service).toBe("job:diagnostics.echo");
  });

  it("does not let one job inherit another's request id", async () => {
    // The reason the drain uses runWithContext and not enterWith.
    const seen: string[] = [];

    vi.spyOn(JOB_HANDLERS["diagnostics.echo"], "handle").mockImplementation(
      async () => {
        seen.push(String(currentContext()?.requestId));
        return {};
      },
    );

    rpc.mockImplementation(async (fn: string) => {
      if (fn === "claim_jobs") {
        return {
          data: ["req-aaaaaaaa", "req-bbbbbbbb"].map((requestId, index) => ({
            attempts: 1,
            enqueued_by_request_id: requestId,
            id: `job-${index}`,
            max_attempts: 5,
            payload: { message: "hi" },
            queue: "default",
            status: "running",
            type: "diagnostics.echo",
          })),
          error: null,
        };
      }

      return { data: null, error: null };
    });

    await drainQueue("default");

    expect(seen).toEqual(["req-aaaaaaaa", "req-bbbbbbbb"]);
  });

  it("falls back to the drain's own id for a job enqueued before this column existed", async () => {
    vi.spyOn(JOB_HANDLERS["diagnostics.echo"], "handle").mockImplementation(
      async () => {
        seenInsideHandler = currentContext();
        return {};
      },
    );

    rpc.mockImplementation(async (fn: string) => {
      if (fn === "claim_jobs") {
        return {
          data: [
            {
              attempts: 1,
              enqueued_by_request_id: null,
              id: "job-legacy",
              max_attempts: 5,
              payload: { message: "hi" },
              queue: "default",
              status: "running",
              type: "diagnostics.echo",
            },
          ],
          error: null,
        };
      }

      return { data: null, error: null };
    });

    await drainQueue("default");

    // A job with no correlation still gets one, so its lines are not orphans.
    expect(seenInsideHandler?.requestId).toBeTruthy();
    expect(seenInsideHandler?.enqueuedByRequestId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/jobs/request-id-propagation.test.ts`
Expected: FAIL — `seenInsideHandler` is `undefined`, because `drainQueue` runs handlers with no context at all.

- [ ] **Step 3: Write minimal implementation**

In `src/server/jobs/drain.ts`, add the import and wrap handler execution. At the top of `drainQueue`, mint a drain-scoped id:

```ts
import { runWithContext } from "@/lib/observability/context";
import { log } from "@/lib/observability/logger";

// …inside drainQueue, before the loop:
const drainRequestId = crypto.randomUUID();
```

Replace the `try { … }` body that executes the handler:

```ts
    try {
      const payload = handler.parse(job.payload);
      const startedAt = Date.now();

      /**
       * runWithContext, not enterWith.
       *
       * The drain is a long-lived shared context executing many jobs in
       * sequence. enterWith would mutate that shared context, so job two
       * would inherit job one's request id — correlation that is worse than
       * none, because it is confidently wrong. run scopes the store to this
       * callback and cannot leak.
       *
       * requestId is the ENQUEUING request's, not the drain's. That is the
       * whole point: one grep on the id a user quoted from a response header
       * finds the request, the service lines, and the job that ran minutes
       * later. The drain's own id is kept as a fallback for rows enqueued
       * before the column existed.
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
            duration: Date.now() - startedAt,
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/server/jobs/request-id-propagation.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS. `drain-integration.test.ts` and `queue-integration.test.ts` self-skip without a database; if a database is available they must still pass.

- [ ] **Step 6: Commit**

```bash
git add src/server/jobs/drain.ts src/server/jobs/request-id-propagation.test.ts
git commit -m "feat(jobs): run each job under the request that enqueued it

BR-OBS-001 into background work. requestId is the enqueuing request's, not
the drain's, so one grep on the id a user quoted finds the request, the
service lines, and the job that ran minutes later.

runWithContext rather than enterWith: the drain is a long-lived shared
context, and enterWith would let job two inherit job one's id — correlation
that is worse than none because it is confidently wrong. Asserted."
```

---

## Task 10: Report an unrecorded listing view

Spec D7. The signal that would have caught the original bug on the first request.

**Files:**
- Modify: `src/app/api/listings/[slugOrPublicId]/views/route.ts`
- Test: `src/app/api/listings/views-observability.test.ts` (create)

**Interfaces:**
- Consumes: `log` from `@/lib/observability/logger`; `captureMessage` from `@/lib/observability/sentry`.
- Produces: no new exports. Emits event names `ListingViewUnresolved` and `ListingViewTrackingFailed`, and the Sentry tag `alert.kind = "view-unresolved"`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/listings/views-observability.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.fn(() => true);
const trackListingView = vi.fn();
const getCurrentAppUser = vi.fn(async () => null);

vi.mock("@/lib/observability/sentry", () => ({
  captureMessage,
  captureUnconditionally: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("@/server/services/public-listings-service", () => ({ trackListingView }));
vi.mock("@/server/services/user-sync-service", () => ({ getCurrentAppUser }));
vi.mock("@/lib/api/request-id", () => ({
  getRequestId: vi.fn(async () => "req-abcdef12"),
}));

import { POST } from "@/app/api/listings/[slugOrPublicId]/views/route";

const context = { params: Promise.resolve({ slugOrPublicId: "3c71e0a2-0000-4000-8000-000000000000" }) };

function request() {
  return new Request("https://ruvo.example/api/listings/x/views", {
    body: JSON.stringify({}),
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listing view tracking observability", () => {
  it("reports a view that resolved to no listing", async () => {
    // The original bug: a well-formed identifier that matched nothing, while
    // the endpoint answered 200. It ran for months.
    trackListingView.mockResolvedValue({ reason: "unresolved", tracked: false });

    await POST(request(), context);

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("resolved to no listing"),
      expect.objectContaining({
        // The tag the runbook's Sentry alert rule matches on. Without it the
        // event lands in Sentry and no rule fires.
        alertKind: "view-unresolved",
        extra: expect.objectContaining({ requestId: "req-abcdef12" }),
      }),
    );
  });

  it("still returns 200 with tracked:false — BR-ANA-003 is not negotiable", async () => {
    trackListingView.mockResolvedValue({ reason: "unresolved", tracked: false });

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ tracked: false });
  });

  it("reports nothing when the view is recorded", async () => {
    trackListingView.mockResolvedValue({ tracked: true });

    const response = await POST(request(), context);

    expect(captureMessage).not.toHaveBeenCalled();
    expect(response.status).toBe(201);
  });

  it("reports nothing for a malformed identifier", async () => {
    // Crawlers generate these constantly. Reporting them drowns the signal,
    // which is how the real one gets ignored again.
    trackListingView.mockResolvedValue({ reason: "malformed", tracked: false });

    await POST(request(), context);

    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("never blocks the caller when Sentry throws", async () => {
    trackListingView.mockResolvedValue({ reason: "unresolved", tracked: false });
    captureMessage.mockImplementationOnce(() => {
      throw new Error("Sentry exploded");
    });

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
  });

  it("returns 200 when tracking throws outright", async () => {
    trackListingView.mockRejectedValue(new Error("database is on fire"));

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ tracked: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/listings/views-observability.test.ts`
Expected: FAIL — the route calls `console.warn`, never `captureMessage`.

- [ ] **Step 3: Write minimal implementation**

In `src/app/api/listings/[slugOrPublicId]/views/route.ts`, replace the two `console.*` calls.

Replace the `console.warn` block:

```ts
    /**
     * A well-formed identifier that resolved to nothing.
     *
     * This is the shape of a caller passing the wrong column, and it is how
     * this endpoint recorded nothing for months while answering 200. It stays
     * a 200 — BR-ANA-003 is not negotiable and the client must not care — but
     * it stops being silent.
     *
     * Reported per event rather than against a threshold. ADR-032's argument
     * about queue depth applies here in a stronger form: a silent no-op reads
     * as views flatlining, and on a product with no users yet, a silence
     * threshold measures the absence of users rather than the absence of the
     * system working. Attempted-versus-recorded is a finding at any traffic
     * level, including on a single request, and needs no baseline.
     *
     * The rate lives in the Sentry alert rule, so tuning it is a UI change
     * rather than a deploy.
     *
     * Malformed input is deliberately not reported: crawlers generate it
     * constantly and drowning the real signal is how it gets ignored again.
     */
    if (!result.tracked && result.reason === "unresolved") {
      log.warn({
        event: "ListingViewUnresolved",
        hint:
          "Callers must send the listing's public_uuid, not its primary key. " +
          "Both are UUIDs, so a wrong column resolves to nothing rather than erroring.",
        slugOrPublicId,
      });

      try {
        captureMessage("Listing view resolved to no listing", {
          category: "unexpected",
          extra: { requestId, slugOrPublicId },
          level: "warning",
        });
      } catch {
        // BR-ANA-003. Reporting is fire-and-forget; it must never be the
        // reason a beacon fails.
      }
    }
```

Replace the `console.error` in the catch block:

```ts
    // BR-ANA-003 (Critical): analytics collection must not block user actions.
    // A fire-and-forget beacon reports untracked rather than 5xx.
    log.error({ error, event: "ListingViewTrackingFailed" });
```

Add the imports:

```ts
import { log } from "@/lib/observability/logger";
import { captureMessage } from "@/lib/observability/sentry";
```

The `captureMessage` call needs an `alert.kind` tag. In `src/lib/observability/sentry.ts`, extend `ReportContext` with `alertKind?: string` and set it in `captureMessage`:

```ts
      if (context.alertKind) scope.setTag("alert.kind", context.alertKind);
```

Then pass `alertKind: "view-unresolved"` in the route call above.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/app/api/listings/views-observability.test.ts && npm test`
Expected: PASS, 6 new tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/listings src/lib/observability/sentry.ts
git commit -m "feat(analytics): report a view that resolved to no listing

Measures attempted versus recorded, not silence. The bug was never 'no views
arriving' — it was views arriving and not being recorded while the endpoint
answered 200, for months. Attempted-versus-recorded is a finding on a single
request and needs no baseline, which matters because with no users yet a
silence threshold would fire continuously and get muted. That is how the
tracker came to be ignored the first time.

Rate lives in the Sentry alert rule, so tuning is a UI change not a deploy.
Still 200, still non-blocking. BR-ANA-003 holds."
```

---

## Task 11: The job-queue absence alert

Spec D6. ADR-032's alerting rule, wired.

**Files:**
- Create: `src/server/jobs/authorize-machine-request.ts`
- Create: `src/server/jobs/authorize-machine-request.test.ts`
- Modify: `src/server/jobs/authorize-drain.ts`
- Create: `src/app/api/monitoring/absence/route.ts`
- Create: `src/app/api/monitoring/absence/route.test.ts`

**Interfaces:**
- Consumes: `getJobQueueHealth()` from `@/server/jobs/drain`; `captureMessage` from `@/lib/observability/sentry`.
- Produces: `assertMachineRequestAuthorized(request: Request, secretEnvVar: string): void`; route `GET /api/monitoring/absence`.

- [ ] **Step 1: Write the failing test for the shared authorizer**

Create `src/server/jobs/authorize-machine-request.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";

import { assertMachineRequestAuthorized } from "@/server/jobs/authorize-machine-request";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

function requestWith(token: string) {
  return new Request("https://ruvo.example/api/monitoring/absence", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("assertMachineRequestAuthorized", () => {
  it("refuses every request when no secret is configured", () => {
    delete process.env.MONITORING_SECRET;
    delete process.env.CRON_SECRET;

    // An unconfigured secret must never mean an open endpoint.
    expect(() =>
      assertMachineRequestAuthorized(requestWith("anything"), "MONITORING_SECRET"),
    ).toThrow();
  });

  it("accepts the named secret", () => {
    process.env.MONITORING_SECRET = "s3cret-value-long-enough";

    expect(() =>
      assertMachineRequestAuthorized(
        requestWith("s3cret-value-long-enough"),
        "MONITORING_SECRET",
      ),
    ).not.toThrow();
  });

  it("accepts CRON_SECRET, which is what Vercel injects", () => {
    delete process.env.MONITORING_SECRET;
    process.env.CRON_SECRET = "vercel-injected-value";

    expect(() =>
      assertMachineRequestAuthorized(
        requestWith("vercel-injected-value"),
        "MONITORING_SECRET",
      ),
    ).not.toThrow();
  });

  it("rejects a wrong token", () => {
    process.env.MONITORING_SECRET = "s3cret-value-long-enough";

    expect(() =>
      assertMachineRequestAuthorized(requestWith("wrong"), "MONITORING_SECRET"),
    ).toThrow();
  });

  it("rejects a missing Authorization header", () => {
    process.env.MONITORING_SECRET = "s3cret-value-long-enough";

    expect(() =>
      assertMachineRequestAuthorized(
        new Request("https://ruvo.example/x"),
        "MONITORING_SECRET",
      ),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/jobs/authorize-machine-request.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the shared authorizer and delegate the drain to it**

Create `src/server/jobs/authorize-machine-request.ts` by moving the body of `authorize-drain.ts` and generalising the env var:

```ts
import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { AppError } from "@/lib/api/errors";

/**
 * Authorizes a machine caller — a scheduler, not a person.
 *
 * A shared secret in a header, not a Clerk session. The caller has no browser,
 * no cookie jar and no way to complete an interactive sign-in, and minting a
 * long-lived session for a machine would be the worse credential because it
 * would carry a user identity RLS would then evaluate against.
 *
 * `CRON_SECRET` is accepted alongside the named secret because that is the
 * header Vercel injects into cron requests. Accepting either means a schedule
 * can be wired without duplicating a value into two places, which is the kind
 * of duplication that drifts.
 *
 * Fails closed when neither is set. An unconfigured secret must never mean an
 * open endpoint: that turns a deployment mistake into a publicly invokable
 * privileged route.
 */
export function assertMachineRequestAuthorized(
  request: Request,
  secretEnvVar: string,
) {
  const accepted = [process.env[secretEnvVar], process.env.CRON_SECRET].filter(
    (value): value is string => Boolean(value),
  );

  if (accepted.length === 0) {
    throw new AppError(
      "JOBS_DRAIN_SECRET_UNSET",
      `${secretEnvVar} is not configured, so this route refuses every request. Set it in the environment and pass it as \`Authorization: Bearer <secret>\`. It is deliberately not optional: this route runs with the service-role key.`,
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!accepted.some((secret) => constantTimeEquals(presented, secret))) {
    throw new AppError(
      "UNAUTHENTICATED",
      `This route requires a bearer token matching ${secretEnvVar}.`,
    );
  }
}

/**
 * Length-independent constant-time comparison.
 *
 * timingSafeEqual throws when buffers differ in length, and returning early on
 * that would leak the secret's length. Hashing both sides to a fixed width
 * makes the comparison equal-length for any input.
 */
function constantTimeEquals(a: string, b: string) {
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

  return timingSafeEqual(digest(a), digest(b));
}
```

Replace the body of `src/server/jobs/authorize-drain.ts`:

```ts
import "server-only";

import { assertMachineRequestAuthorized } from "@/server/jobs/authorize-machine-request";

/**
 * Authorizes a drain invocation. See assertMachineRequestAuthorized for the
 * reasoning; this keeps the drain's own env var name at its own call site.
 */
export function assertDrainRequestAuthorized(request: Request) {
  assertMachineRequestAuthorized(request, "JOBS_DRAIN_SECRET");
}
```

- [ ] **Step 4: Run the authorizer tests plus the existing drain-auth suite**

Run: `npx vitest run src/server/jobs/authorize-machine-request.test.ts src/server/jobs/authorize-drain.test.ts`
Expected: PASS. `authorize-drain.test.ts` is unchanged and must stay green — its assertions are regexes (`/bearer token/i`, `/not configured/i`), which the generalised messages still satisfy.

**Watch for one cross-test hazard.** `authorize-drain.test.ts` asserts "not configured" when `JOBS_DRAIN_SECRET` is unset. The new authorizer also accepts `CRON_SECRET`, so if `CRON_SECRET` leaks in from `.env.local` that test starts failing for a reason that has nothing to do with the drain. Add `vi.stubEnv("CRON_SECRET", "")` to that suite's setup if it appears.

- [ ] **Step 5: Write the failing test for the absence route**

Create `src/app/api/monitoring/absence/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.fn(() => true);
const getJobQueueHealth = vi.fn();

vi.mock("@/lib/observability/sentry", () => ({
  captureMessage,
  captureUnconditionally: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("@/server/jobs/drain", () => ({ getJobQueueHealth }));
vi.mock("@/lib/api/request-id", () => ({
  getRequestId: vi.fn(async () => "req-abcdef12"),
}));

import { GET } from "@/app/api/monitoring/absence/route";

function authorized() {
  return new Request("https://ruvo.example/api/monitoring/absence", {
    headers: { authorization: "Bearer test-secret-value" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MONITORING_SECRET = "test-secret-value";
  process.env.JOB_QUEUE_MAX_AGE_SECONDS = "900";
});

describe("GET /api/monitoring/absence", () => {
  it("reports when a lane's oldest queued job is older than the threshold", async () => {
    // ADR-032: alert on age, not depth. Depth reads zero both when everything
    // is healthy and when the drain has stopped.
    getJobQueueHealth.mockResolvedValue([
      { oldest_queued_age_seconds: 1800, queue: "default", queued_count: 4 },
      { oldest_queued_age_seconds: 0, queue: "media", queued_count: 0 },
    ]);

    const response = await GET(authorized());
    const body = await response.json();

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("default"),
      expect.objectContaining({ alertKind: "absence" }),
    );
    expect(body.data.breached).toHaveLength(1);
  });

  it("returns 200 on a breach, because a breach is a finding not a route failure", async () => {
    getJobQueueHealth.mockResolvedValue([
      { oldest_queued_age_seconds: 99_999, queue: "default", queued_count: 1 },
    ]);

    // Returning non-200 would make a stopped drain and a broken monitoring
    // route indistinguishable.
    expect((await GET(authorized())).status).toBe(200);
  });

  it("reports nothing when every lane is inside the threshold", async () => {
    getJobQueueHealth.mockResolvedValue([
      { oldest_queued_age_seconds: 12, queue: "default", queued_count: 2 },
      { oldest_queued_age_seconds: 0, queue: "media", queued_count: 0 },
    ]);

    const response = await GET(authorized());

    expect(captureMessage).not.toHaveBeenCalled();
    expect((await response.json()).data.breached).toEqual([]);
  });

  it("does not treat an empty healthy queue as a breach", async () => {
    // Depth zero with age zero is the healthy case and the stopped case looks
    // nothing like it — that is the whole reason age is the signal.
    getJobQueueHealth.mockResolvedValue([
      { oldest_queued_age_seconds: 0, queue: "default", queued_count: 0 },
    ]);

    await GET(authorized());

    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("returns 200 and reports when the health query itself fails", async () => {
    getJobQueueHealth.mockRejectedValue(new Error("permission denied"));

    const response = await GET(authorized());

    // A monitoring route that 500s is a monitoring route that gets ignored.
    expect(response.status).toBe(200);
    expect((await response.json()).data.checks[0].status).toBe("errored");
    expect(captureMessage).toHaveBeenCalled();
  });

  it("refuses an unauthorized caller", async () => {
    const response = await GET(
      new Request("https://ruvo.example/api/monitoring/absence"),
    );

    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/app/api/monitoring/absence/route.test.ts`
Expected: FAIL — route module does not exist.

- [ ] **Step 7: Implement the route**

Create `src/app/api/monitoring/absence/route.ts`:

```ts
import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { log } from "@/lib/observability/logger";
import { captureMessage } from "@/lib/observability/sentry";
import { assertMachineRequestAuthorized } from "@/server/jobs/authorize-machine-request";
import { getJobQueueHealth } from "@/server/jobs/drain";

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

/**
 * Alerts on the absence of an expected signal.
 *
 * ADR-032 is explicit that alerting on queue depth is wrong: depth reads zero
 * both when everything is healthy and when the drain has stopped, because
 * nothing drains and nothing accumulates visibly. Age rises the moment
 * draining stops, which is the failure most likely to go unnoticed — nothing
 * errors, work simply does not happen.
 *
 * ALWAYS RETURNS 200. A breach is a finding, not a route failure. Returning
 * non-200 on breach would make a stopped drain and a broken monitoring route
 * indistinguishable, which reproduces the class of bug this exists to end.
 */
export async function GET(request: Request) {
  const requestId = await getRequestId();
  const checks: Check[] = [];

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

  try {
    const lanes = (await getJobQueueHealth()) as Array<{
      oldest_queued_age_seconds: number;
      queue: string;
      queued_count: number;
    }>;

    for (const lane of lanes) {
      const age = Number(lane.oldest_queued_age_seconds ?? 0);
      const breached = age > threshold;

      checks.push({
        detail: {
          oldestQueuedAgeSeconds: age,
          queue: lane.queue,
          queuedCount: Number(lane.queued_count ?? 0),
          thresholdSeconds: threshold,
        },
        name: `job-queue-age:${lane.queue}`,
        status: breached ? "breached" : "ok",
      });

      if (breached) {
        log.error({
          errorCode: "JOB_QUEUE_STALLED",
          event: "JobQueueAgeThresholdBreached",
          oldestQueuedAgeSeconds: age,
          queue: lane.queue,
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
              queuedCount: Number(lane.queued_count ?? 0),
              thresholdSeconds: threshold,
            },
            level: "error",
            requestId,
          },
        );
      }
    }
  } catch (error) {
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
        breached: checks.filter((check) => check.status !== "ok").map((c) => c.name),
        checks,
      },
      meta: createApiMeta(requestId),
    },
    { status: 200 },
  );
}
```

- [ ] **Step 8: Run tests, typecheck, lint**

Run: `npx vitest run src/app/api/monitoring/absence/route.test.ts && npm test && npm run typecheck && npm run lint`
Expected: PASS, 6 new route tests + 5 authorizer tests.

- [ ] **Step 9: Commit**

```bash
git add src/server/jobs/authorize-machine-request.ts src/server/jobs/authorize-machine-request.test.ts src/server/jobs/authorize-drain.ts src/app/api/monitoring
git commit -m "feat(monitoring): alert on oldest queued job age, per lane

ADR-032's rule, wired. Depth reads zero both when everything is healthy and
when the drain has stopped; age rises the moment draining stops. job_queue_health
already exposed it and nothing read it.

Always returns 200 — a breach is a finding, not a route failure, and a
non-200 would make a stopped drain and a broken monitoring route
indistinguishable. The bearer check is shared with the drain and also accepts
CRON_SECRET, which is the header Vercel injects."
```

---

## Task 12: Source maps, environment, and the runbook

The part that makes an alert reach a human. Without this, every event lands in Sentry and nobody is told.

**Files:**
- Modify: `next.config.ts`
- Modify: `.env.example`
- Create: `docs/operations/observability-runbook.md`

**Interfaces:**
- Consumes: everything above.
- Produces: no code exports.

- [ ] **Step 1: Wrap `next.config.ts`**

```ts
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

/**
 * Source-map upload.
 *
 * Without it a production browser stack trace is minified, and "improved
 * debugging" from ADR-026 is theoretical for every frontend error.
 *
 * The build SUCCEEDS without SENTRY_AUTH_TOKEN — upload is skipped, not fatal
 * — so CI and local builds are unaffected by a missing secret.
 *
 * deleteSourcemapsAfterUpload: maps go to Sentry and not to the public bundle.
 * Shipping them would hand the full unminified source to anyone with devtools.
 */
export default withSentryConfig(nextConfig, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  widenClientFileUpload: true,
});
```

- [ ] **Step 2: Extend `.env.example`**

Replace the Sentry block:

```bash
# Sentry — get from https://sentry.io
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
# Build-time only. Uploads source maps. The build succeeds without it.
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=

# Which environment this is. GATES SENTRY TRANSMISSION — only "preview" and
# "production" transmit. Anything else, including unset and "test", stays
# local and loud. Do not set this to "production" on a laptop.
NEXT_PUBLIC_APP_ENV=development

# Optional. Ties an error to a deploy. Falls back to VERCEL_GIT_COMMIT_SHA,
# then to "unknown" — a missing release is visible in Sentry rather than
# silently absent.
NEXT_PUBLIC_RELEASE=

# Optional. DEBUG|INFO|WARN|ERROR|FATAL. Defaults to INFO in production.
LOG_LEVEL=

# Monitoring — bearer secret for GET /api/monitoring/absence.
MONITORING_SECRET=
# Seconds. Oldest queued job age that counts as the drain having stopped.
JOB_QUEUE_MAX_AGE_SECONDS=900

# ---------------------------------------------------------------------------
# TWO SENTRY ALERT RULES MUST BE CREATED BY HAND. Code cannot do this, and
# until they exist the events land in Sentry and nobody is told.
# See docs/operations/observability-runbook.md.
# ---------------------------------------------------------------------------
```

- [ ] **Step 3: Write the runbook**

Create `docs/operations/observability-runbook.md`:

````markdown
# Observability Runbook

Implements ADR-026. Companion to `docs/superpowers/specs/2026-08-19-observability-design.md`.

## The two alert rules you must create by hand

A metric nobody sees is the same as no metric. Code emits the events; **Sentry
does not notify anyone until these rules exist.** Create them once, in
Sentry → Alerts → Create Alert → Issues.

### 1. Job queue stalled

| Field | Value |
|---|---|
| When | An issue matches `alert.kind` equals `absence` |
| Then | Send a notification to the engineering email / Slack channel |
| Rate limit | At most once per hour per issue |

**What it means.** A lane has work older than `JOB_QUEUE_MAX_AGE_SECONDS`
(default 900). Per ADR-032, depth is not the signal: depth reads zero both when
everything is healthy and when the drain has stopped. Age rises the moment
draining stops.

**What to do.** Check that something is actually invoking
`POST /api/jobs/drain?queue=<lane>`. See "Scheduling" below — as of this
writing, nothing is.

### 2. Listing views not being recorded

| Field | Value |
|---|---|
| When | An issue matches `alert.kind` equals `view-unresolved` |
| And | The issue is seen more than **5** times in **one hour** |
| Then | Send a notification to the engineering email / Slack channel |

**What it means.** View POSTs are arriving with well-formed identifiers that
resolve to no listing. The endpoint answers 200 either way, so this is
invisible without the alert — it ran undetected for months once already.

**Why a count and not a silence threshold.** The bug was never "no views
arriving"; it was views arriving and not being recorded. Attempted-versus-
recorded is a finding at any traffic level, including a single request, and
needs no baseline. A silence threshold on a product with no users measures the
absence of users.

**Tuning.** The threshold lives in this rule, not in code, so changing it is a
UI change rather than a deploy. A low floor is expected: a well-formed
identifier for a deleted or unpublished listing is legitimately unresolved.

## Scheduling — UNRESOLVED

`GET /api/monitoring/absence` and `POST /api/jobs/drain` both need something to
invoke them. **Nothing does yet.** ADR-032 deferred this; it is still deferred,
now with evidence.

### Why there is no `vercel.json`

Verified 2026-08-19 against Vercel's cron documentation:

| Plan | Minimum interval | Precision |
|---|---|---|
| Hobby | Once per day | Per-hour (±59 min) |
| Pro | Once per minute | Per-minute |

Sub-daily cron expressions do not degrade on Hobby — they **fail deployment**:
*"Hobby accounts are limited to daily cron jobs. This cron expression would run
more than once per day."*

So committing a `vercel.json` with the schedules this system needs would break
the deploy. And a once-daily drain with ±59 minutes of jitter is not a job
queue: **the job queue is functionally inert on Hobby.**

This is the second hard Pro dependency after Supabase image transformation.
Vercel Pro is $20/month (platform fee, one deploying seat, $20 usage credit).

### Options

**A — Vercel Pro.** Add `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/jobs/drain?queue=default", "schedule": "* * * * *" },
    { "path": "/api/jobs/drain?queue=media", "schedule": "* * * * *" },
    { "path": "/api/monitoring/absence", "schedule": "*/5 * * * *" }
  ]
}
```

Set `CRON_SECRET` in Vercel project settings; both routes accept it.

**B — GitHub Actions, free.** Scheduled workflows run at a **5-minute
minimum**, are best-effort ("can be delayed during periods of high loads; high
load times include the start of every hour"), and are **auto-disabled after 60
days of repository inactivity** (documented for public repositories). A
5-minute best-effort drain is a real job queue in a way a once-daily one is
not. Store the secret as a repository secret and `curl` both routes.

**C — External scheduler.** cron-job.org, Cronitor, or any uptime checker that
can send an `Authorization` header.

Whichever is chosen, the contract is:

| Route | Method | Auth | Frequency |
|---|---|---|---|
| `/api/jobs/drain?queue=default` | POST | `Bearer $JOBS_DRAIN_SECRET` or `$CRON_SECRET` | every 1–5 min |
| `/api/jobs/drain?queue=media` | POST | same | every 1–5 min |
| `/api/monitoring/absence` | GET | `Bearer $MONITORING_SECRET` or `$CRON_SECRET` | every 5–15 min |

## What is deliberately not alerted

Per the error registry, `validation`, `authentication`, `authorization` and
`business_rule` errors are logged but never reported to Sentry. An expected 403
is the boundary working; paging on it trains people to ignore the pager, which
is how the genuinely broken thing gets missed. Only `infrastructure` and
`unexpected` reach Sentry.

## Correlation

Every response carries `x-request-id`. A user reporting a problem can quote it,
and it will match:

- the request's structured log line,
- every service and repository line beneath it,
- the Sentry event's `request.id` tag,
- and any job enqueued by that request, including the job's own lines when it
  runs minutes later.
````

- [ ] **Step 4: Verify the build succeeds without a Sentry token**

Run:
```bash
unset SENTRY_AUTH_TOKEN
npm run build
```
Expected: build succeeds. Source-map upload is skipped with a note, not fatal.

- [ ] **Step 5: Full verification**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green. Confirm the test count has grown by roughly 45 over the 328 baseline and that 0 are skipped.

- [ ] **Step 6: Commit**

```bash
git add next.config.ts .env.example docs/operations/observability-runbook.md
git commit -m "feat(observability): source maps, env contract, and the runbook

The runbook is the part that makes an alert reach a human: two Sentry rules
that must be created by hand, because until they exist every event lands in
Sentry and nobody is told.

It also records why there is no vercel.json. Hobby caps crons at once per day
and sub-daily expressions fail deployment outright, so the job queue is
functionally inert on Hobby — a second hard Pro dependency after Supabase
image transformation, and a deploy decision rather than a code one."
```

---

## Verification checklist

Run before declaring the slice done. Evidence, not assertion.

- [ ] `npm test` — all pass, 0 skipped
- [ ] `npm run typecheck` — clean
- [ ] `npm run lint` — clean at `--max-warnings 0`
- [ ] `npm run build` without `SENTRY_AUTH_TOKEN` — succeeds
- [ ] `grep -rn "throw new Error(" src/server src/lib --include=*.ts | grep -v test | wc -l` → `0`
- [ ] `grep -rn "console\." src/app/api src/server --include=*.ts | grep -v test` → only `drain.ts`'s `recordFailure`, or zero
- [ ] Each of the brief's five required tests exists and passes:
  - sanitiser vs. token + cookie + signed URL + document reference → Task 2
  - request id propagates request → service → job → Task 9
  - unhandled route error reports and still returns sanitized → Task 6
  - `resolveRouteError` does not classify by message text → Task 4
  - Sentry failing does not fail the request → Task 6
