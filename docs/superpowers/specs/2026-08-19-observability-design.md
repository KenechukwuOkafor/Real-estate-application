# Ruvo Observability — Design

**Date:** 2026-08-19
**Status:** Approved
**Revision:** 2 — incorporates two changes from design review: the listing-view alert measures
attempted-versus-recorded rather than silence, and `vercel.json` is removed from scope pending
a plan decision (see Decisions D7, D8).
**Scope:** Implement ADR-026. Close BR-OBS-001 and BR-OBS-002, both Critical and both currently
unmet. Stop `routeErrorResponse` discarding causes, remove message-text error classification,
and add one absence alert per ADR-032's alerting rule.

---

## Context

ADR-026 has been Accepted since before any code was written, and nothing implements it.
`@sentry/nextjs` is not initialised, no request carries a correlation id past the route
handler, and a 500 returns `INTERNAL_ERROR` with the cause discarded server-side.

This slice exists because every significant defect in this codebase so far was found by hand:

- The listing view tracker recorded nothing for months while answering `200`.
- A production 500 required hand-instrumenting the route and reproducing the failure to
  diagnose.
- Two RLS suites failed in CI and the guard reported zero failures.

In each case the system knew something was wrong and had no way to say so. The purpose here is
not dashboards. It is to make the system able to say so.

### Starting state

A substantial partial implementation already exists uncommitted on `feat/observability`. It
typechecks clean, has zero tests, and **is red**: `src/lib/api/errors.test.ts` fails 6 of 11.

Already present:

| File | State |
|---|---|
| `src/lib/api/error-codes.ts` | New. Code → category → HTTP status registry. |
| `src/lib/observability/sanitize.ts` | New. Key-pattern and value-pattern redaction, fails closed. |
| `src/lib/observability/logger.ts` | New. Structured JSON in production, readable in development. |
| `src/lib/observability/context.ts` | New. `AsyncLocalStorage` request context. |
| `src/lib/observability/sentry.ts` | New. `beforeSend` sanitiser, disabled in development, never throws. |
| `instrumentation.ts`, `instrumentation-client.ts` | New. Server, edge and browser init plus `onRequestError`. |
| `src/middleware.ts` | Mints and validates `x-request-id`, forwards inward, echoes outward. |
| `src/lib/api/request-id.ts` | Reads the header, seeds the context. |
| `src/lib/api/errors.ts` | `resolveRouteError` rewritten without message matching; `routeErrorResponse` logs and reports. |

Not present, and the substance of this plan: the migration of 60 throw sites, request-id
propagation into jobs, either absence alert, all tests, and `setContextUser` wiring.

### Canonical references

The Engineering Bible at `docs/engineering-bible/` is authoritative. Rules invoked by this
design: **BR-OBS-001**, **BR-OBS-002**, **BR-OBS-003** (all Critical), **BR-ANA-003**
(Critical), REB-ARCH-012 (Observability & Monitoring Architecture), REB-ENG-005 (Reliability &
Observability), ADR-026 (Sentry), ADR-032 (Postgres-backed job queue).

BR-OBS-004 (health endpoints) and BR-OBS-005 (business KPIs) are explicitly **out of scope**.

---

## Decisions

### D1 — Error classification is a registry lookup, never a message match

`resolveRouteError` resolves an `AppError` to its registered code and resolves everything else
to `INTERNAL_ERROR` / 500 / a fixed opaque message. There is no string matching, no sentinel
allow-list, and no fallthrough that returns a thrown message to a caller.

**Why this is a defect and not a preference.** The previous resolver decided HTTP status by
inspecting English text — `message.includes("invalid")` meant 422, `message.endsWith(" not
found.")` meant 404 — and then returned the matched message to the client verbatim. Three
consequences:

1. Rewording a message silently changed its HTTP status.
2. Any message containing "invalid" was misclassified.
3. **A database error whose text contains `invalid input syntax for type uuid` would have been
   echoed to an unauthenticated caller with a 422.**

Point 3 was unreachable only because a `PostgrestError` is a plain object rather than an
`Error` instance, so `error.message` was `undefined`. That is safety by accident. Any future
code path that wraps a Postgrest failure in an `Error` — an entirely ordinary thing to do —
would have made it reachable with no other change.

### D2 — All 60 bare throw sites migrate to `AppError`

`grep -rn "throw new Error(" src/server src/lib --include=*.ts | grep -v test` returns 60
results. Removing message matching without migrating them converts most of the API's 4xx
surface into 500s *and* into Sentry pages.

Three groups:

- **Sentinels** — `"LISTING_STATE_CONFLICT"`, `"AGENT_NOT_VERIFIED"`,
  `"LISTING_SUBSCRIPTION_REQUIRED"`, `"MEDIA_MIME_TYPE_UNSUPPORTED"` and similar, where the
  message *was* the code. These gain a real human message, which is a small client
  improvement: the API stops returning SCREAMING_CASE as prose.
- **Prose 4xx** — `"Chat not found."`, `"Admin role is required."`, `"Message body must be
  2000 characters or fewer."` Registered code, message unchanged, so the client contract holds.
- **Genuinely internal** — `"Authenticated Clerk user could not be loaded."` Already 500s by
  accident of matching nothing. They become explicit `infrastructure` codes and now alert on
  purpose rather than by luck.

**Every migrated status is pinned to exactly what message matching produces today, asserted
case by case in `errors.test.ts`.** This is what makes a 60-site refactor reviewable rather
than risky: the test file is the diff's proof that no client-visible status changed.

### D3 — Six categories, and only two of them alert

REB-ARCH-012 defines the categories. `CATEGORY_ALERTS` in `error-codes.ts` gives each an
alerting decision:

| Category | Alerts | Reasoning |
|---|---|---|
| `validation` | no | A caller sent something wrong and was told. |
| `authentication` | no | Expected constantly: expired sessions, signed-out tabs, crawlers. |
| `authorization` | no | A denial is the boundary working. Spikes matter; individual events do not. |
| `business_rule` | no | The domain refusing an operation. The user can act on it. |
| `infrastructure` | **yes** | A dependency we own the relationship with failed. Actionable. |
| `unexpected` | **yes** | We do not know what happened, which is the definition of worth looking at. |

An unregistered code resolves to `unexpected` rather than to a guess. Alerting on something we
failed to classify is the safe direction: the cost is noise, and the cost of the other
direction is silence.

An expected 403 does not page anyone. An unexpected 500 does.

### D4 — Request ID is minted in middleware and made ambient

Middleware is the only thing guaranteed to run before everything else — route handlers, Server
Components, and Next's own error paths all sit downstream. Minting lower down would leave a
request that fails early with no id, which is precisely the request worth correlating.

An inbound `x-request-id` is honoured so an upstream caller's trace id joins ours, but it is
length- and charset-restricted (`/^[A-Za-z0-9._-]{8,128}$/`) because the value reaches both a
log line and a response header.

Propagation is via `AsyncLocalStorage` rather than a threaded parameter. A `requestId`
parameter on every signature would satisfy the requirement on paper and be abandoned the first
time someone was in a hurry.

`getRequestId()` uses `enterWith` rather than `run`, so the thirty existing route handlers gain
correlation without being restructured — they already call it as their first statement. The
trade is stated explicitly: `enterWith` mutates the current context and is safe only where each
request has its own, which holds in a Next route handler and does **not** hold in the job
drain. The drain therefore uses `runWithContext` per job.

### D5 — A job's context carries the id of the request that enqueued it

Migration `0018_observability.sql`:

```sql
alter table public.jobs add column enqueued_by_request_id text
  check (enqueued_by_request_id is null
         or enqueued_by_request_id ~ '^[A-Za-z0-9._-]{8,128}$');
```

Same guard as the middleware, for the same reason. `claim_jobs` returns `setof public.jobs` and
picks the column up with no change. `enqueue_job` gains a trailing `request_id text default
null` parameter — safe to change in place because **it has zero callers today**, in `src/` or
in any migration.

In the drain, each job runs inside:

```ts
runWithContext({
  requestId: job.enqueued_by_request_id ?? drainRequestId,
  enqueuedByRequestId: job.enqueued_by_request_id,
  jobId: job.id,
  service: `job:${job.type}`,
}, () => handler.handle(payload, context))
```

Setting `requestId` to the *enqueuing* request's id is deliberate. One grep on the id a user
quoted from a response header finds the request line, the service lines, and the job that ran
four minutes later. `RequestContext` gains a `jobId` field.

`src/server/jobs/enqueue.ts` exposes `enqueueJob()`, which reads `currentRequestId()` and passes
it down. **The SQL function remains the transactional path**; the helper serves the
non-transactional case only, and its doc comment says so.

### D6 — One absence alert: oldest queued job age, per lane

ADR-032 is explicit that alerting on queue depth is wrong, because depth reads zero both when
everything is healthy and when the drain has stopped. Age rises the moment draining stops.

`job_queue_health()` already exposes `oldest_queued_age_seconds` per lane and is already
granted to `service_role`. This slice wires it to an alert; it does not change the function.

New route `GET /api/monitoring/absence`, secret-protected, `runtime = "nodejs"`,
`dynamic = "force-dynamic"`. It evaluates the threshold per lane and calls `captureMessage`
tagged `alert.kind = "absence"` for each breach.

**It always returns 200**, with the verdict in the body. A breach is a finding, not a route
failure. Returning non-200 on breach would make a stopped drain and a broken monitoring route
indistinguishable, which reproduces the class of bug this slice exists to end.

Threshold `JOB_QUEUE_MAX_AGE_SECONDS`, default 900 — roughly fifteen missed one-minute drains.

### D7 — The listing-view alert measures attempted versus recorded, not silence

**Superseded design:** an earlier revision measured time since the last recorded listing view
against a threshold. That is wrong here, and instructively so.

Ruvo has no users yet. Views will be zero for long stretches, so a silence threshold fires
continuously from now until launch and gets muted — which is exactly how the view tracker came
to be ignored the first time. A silence alert on a pre-launch product measures the absence of
users, not the absence of the system working.

More fundamentally, it measures the wrong thing. The bug was never "no views arriving". It was
**views arriving and not being recorded**: the endpoint answered 200 while writing nothing.

So the signal is attempted versus recorded. A view POST carrying a well-formed identifier that
resolves to no listing is a finding at any traffic level, **including on a single request**.
It requires no baseline and would have caught the real bug on the first request rather than
after months.

Implementation: every unresolved view reports to Sentry immediately, tagged
`alert.kind = "view-unresolved"`, alongside the existing structured log. **There is no
threshold in application code.** The rate lives in the Sentry alert rule, which means tuning it
is a UI change rather than a deploy, and a single unresolved view on a dead-quiet day still
creates the issue before anyone has tuned anything.

One honest caveat: a well-formed identifier for a deleted or unpublished listing is legitimately
unresolved, so there is a low natural floor. That is precisely why the rate belongs in the alert
rule rather than in a constant we would have to guess. The original bug was 100% of views
unresolved, which clears any plausible floor within a handful of requests.

Malformed identifiers are deliberately **not** reported. Crawlers generate them constantly and
they would drown the signal — the same argument the existing route comment already makes.

Consequences for the migration: `listing_view_health()` and the
`listing_views(created_at)` index are both dropped from scope. They existed only to serve the
superseded silence check.

Time-since-last-view returns later as a day-over-day baseline, when there is traffic to baseline
against. It is not a threshold problem; it is a "needs a baseline" problem, and a constant
cannot solve it.

### D8 — No `vercel.json` in this slice

Verified against current Vercel documentation (retrieved 2026-08-19):

| Plan | Minimum interval | Scheduling precision |
|---|---|---|
| Hobby | **Once per day** | Per-hour (±59 min) |
| Pro | Once per minute | Per-minute |
| Enterprise | Once per minute | Per-minute |

The failure mode matters more than the cap. Sub-daily expressions do not degrade on Hobby —
they **fail deployment**:

> *Hobby accounts are limited to daily cron jobs. This cron expression would run more than once
> per day.*

Committing the originally proposed `vercel.json` would therefore break the deploy outright.
Separately, a once-daily drain with ±59 minutes of jitter is not a job queue: **the job queue is
functionally inert on Hobby.**

This is the second hard Pro dependency after Supabase image transformation. Vercel Pro is
$20/month (platform fee, one deploying seat, $20 usage credit included). The two should be
decided together rather than the second one being discovered at deploy.

Therefore this slice ships the endpoint, its secret, its threshold and its documented contract —
what must call it and how often — and leaves ADR-032's deferred scheduler question open rather
than closing it with something that fails at deploy.

Documented interim, not built here: GitHub Actions scheduled workflows run at a **5-minute
minimum**, are best-effort ("can be delayed during periods of high loads... High load times
include the start of every hour"), and are auto-disabled after 60 days of repository inactivity
(documented for public repositories). A 5-minute best-effort drain is a real job queue in a way
a once-daily ±59-minute one is not, and it costs nothing.

### D9 — Transmission is gated on `NEXT_PUBLIC_APP_ENV`, not `NODE_ENV`

`sentryEnabled()` as written gates on `appEnvironment() !== "development"`, and
`appEnvironment()` falls back to `NODE_ENV`, which is `"test"` under vitest. A DSN present in
`.env.local` would therefore have made **the test suite transmit to Sentry**.

Gate on an explicit allow-list of `preview` and `production` instead. Anything else — including
`test`, `development`, and unset — does not transmit. Development is loud in the terminal
instead, via the logger's human-readable branch.

### D10 — Sanitisation is the last gate, not a convention

`beforeSend` runs the sanitiser over every event. Two independent passes, because either alone
leaks:

- **By key.** `{ authorization: "..." }` is a secret whatever it contains.
- **By value.** A JWT or a signed URL is a secret whatever it is called — and it is usually
  called something innocent, like `url` or `next`.

Value matching catches the realistic accident. Nobody logs `{ password }` on purpose; plenty of
code logs a whole request object that happens to contain a signed URL.

The sanitiser fails closed: an unknown class instance or a structure past the depth limit is
replaced rather than passed through. A sanitiser that throws returns `null` from `beforeSend`,
dropping the event — losing one report is strictly better than leaking one.

### D11 — Monitoring never alters business behaviour

REB-ARCH-012 domain invariant, and BR-ANA-003 (Critical) for the view endpoint specifically.

- The view tracker still returns 200 and still never blocks. Reporting an unresolved view is
  fire-and-forget.
- Every Sentry entry point swallows its own failure and returns a boolean. Sentry being
  unavailable, misconfigured, or throwing must never fail a request.
- The absence route returns 200 on breach.

---

## Components

### `src/lib/api/error-codes.ts`
Registry. Code → `{ category, httpStatus }`. `categoryForCode`, `httpStatusForCode`,
`shouldAlert`, `isKnownErrorCode`. Grows to cover all 60 migrated throw sites.
Depends on nothing.

### `src/lib/observability/context.ts`
`AsyncLocalStorage` holding `{ requestId, userId?, service, enqueuedByRequestId?, jobId? }`.
`runWithContext` (scoped, for jobs), `enterContext` (ambient, for route handlers),
`currentContext`, `currentRequestId`, `setContextUser`. Depends on nothing.

### `src/lib/observability/sanitize.ts`
`sanitize`, `sanitizeString`, `sanitizeEvent`. Pure. Never throws. Depends on nothing —
deliberately, so it is testable in isolation and cannot be broken by a change elsewhere.

### `src/lib/observability/logger.ts`
`log.{debug,info,warn,error,fatal}`. Reads context, sanitises, emits. Depends on context and
sanitize.

### `src/lib/observability/sentry.ts`
`baseSentryOptions`, `reportError` (category-gated), `captureUnconditionally`, `captureMessage`,
`sentryEnabled`, `appEnvironment`, `appRelease`. Depends on error-codes and sanitize.

### `src/server/jobs/enqueue.ts`
New. `enqueueJob()` reading the ambient request id. Depends on context and the Supabase admin
client.

### `src/app/api/monitoring/absence/route.ts`
New. Evaluates oldest-queued-job age per lane, reports breaches, always 200.

### `src/lib/api/errors.ts`
`AppError`, `resolveRouteError`, `routeErrorResponse`. The registry lookup and the
log-then-report-then-respond ordering live here. Depends on error-codes, context, logger,
sentry.

### `src/app/api/listings/[slugOrPublicId]/views/route.ts`
Modified. Its two `console.*` calls become structured log events
(`ListingViewUnresolved`, `ListingViewTrackingFailed`), and the unresolved case additionally
reports to Sentry per D7. Response behaviour is unchanged — 200, never blocking.

### `src/server/services/user-sync-service.ts`
Modified. `getCurrentAppUser` calls `setContextUser` once identity resolves, so log lines
downstream carry `userId`. A no-op outside a context, so it can never be a failure.

### `src/server/jobs/authorize-machine-request.ts`
Extracted from `authorize-drain.ts`. `assertMachineRequestAuthorized(request, secretEnvVar)`
accepts the named secret **or** `CRON_SECRET`, which is what Vercel injects into cron requests.
Still fails closed when neither is set. The drain's behaviour and its existing test are
unchanged.

---

## Data flow

```
Browser / scheduler
  ↓  x-request-id minted or validated
middleware.ts
  ↓  header forwarded inward, echoed outward
route handler → getRequestId() → enterContext({ requestId, service: "api" })
  ↓  ambient from here down
service layer → setContextUser(appUser.id)
  ↓
repository → database
  ↓  enqueueJob() reads currentRequestId()
jobs.enqueued_by_request_id
  ↓  minutes later
drain → runWithContext({ requestId: job.enqueued_by_request_id, jobId, service: "job:<type>" })
  ↓
handler log lines carry the id of the request that queued the work
```

On failure at any point:

```
throw AppError("CODE", "message")
  ↓
routeErrorResponse
  ├─ log.{warn|error}  — always, including expected errors
  ├─ reportError       — only if category alerts
  └─ NextResponse      — unchanged client contract
```

---

## Error handling

| Failure | Behaviour |
|---|---|
| Sentry unreachable, misconfigured, or throwing | Swallowed. Returns `false`. Request unaffected. |
| Sanitiser throws inside `beforeSend` | Event dropped (`return null`). Never transmitted unredacted. |
| `x-request-id` header absent (tests, scripts) | `getRequestId` mints one. A missing id is a degraded log line; throwing would be a failed request. |
| Inbound `x-request-id` malformed or over-long | Replaced with a fresh UUID. |
| `MONITORING_SECRET` and `CRON_SECRET` both unset | Route refuses every request. Fails closed. |
| `job_queue_health()` RPC fails | Absence route returns 200 with the check marked errored, and reports to Sentry. A monitoring route that 500s is a monitoring route that gets ignored. |
| View POST resolves to no listing | 200, `tracked: false`, structured log, Sentry report. BR-ANA-003 holds. |
| Unregistered error code | `unexpected` → alerts. Noise over silence. |

---

## Testing

The five tests named in the brief, plus what the refactor forces.

1. **Sanitiser** — one payload carrying a Clerk JWT, a `Cookie` header, a Supabase signed URL,
   and a `verification/<uuid>/…` document path. Each asserted absent from the serialised event,
   not merely masked at the top level. Nested, arrayed, and inside an `Error.message`.
2. **Request ID propagation** — request → service → `enqueue_job` row → drain context → job log
   line. Uses `diagnostics.echo`, which exists to exercise this path end to end.
3. **Unhandled route error** — Sentry called with full context; response body still the
   sanitised `INTERNAL_ERROR` with the opaque message.
4. **No message-text classification** — including the regression case directly: an `Error` whose
   message contains `invalid input syntax for type uuid` must resolve to 500 with an opaque
   body, never a 422 echoing it.
5. **Sentry failure is not request failure** — `captureException` throwing does not change the
   response.
6. **`errors.test.ts` rewritten** — code and status pinned per migrated throw site.
7. **Registry invariants** — every code has a category; every category has an alerting decision.
8. **Absence route** — breach reports and still returns 200; healthy lane reports nothing;
   RPC failure returns 200 and reports.

### Test-visible consequence of D9

With transmission gated on `NEXT_PUBLIC_APP_ENV`, the suite never transmits. Tests that assert
reporting behaviour therefore inject a spy rather than relying on the real SDK.

---

## Environment variables

Required from the operator:

| Var | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | all runtimes | Already stubbed in `.env.example`. Public by design — it ships in the browser bundle either way. |
| `SENTRY_AUTH_TOKEN` | build only | Already stubbed, empty. Source-map upload. |
| `SENTRY_ORG` | build only | New. |
| `SENTRY_PROJECT` | build only | New. |
| `NEXT_PUBLIC_APP_ENV` | all runtimes | New. `development` \| `preview` \| `production`. Gates transmission. |
| `MONITORING_SECRET` | server | New. Bearer secret for the absence route. |

Optional, with defaults:

| Var | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_RELEASE` | `VERCEL_GIT_COMMIT_SHA`, else `"unknown"` | A missing release is visible in Sentry rather than silently absent. |
| `LOG_LEVEL` | `INFO` in production, `DEBUG` otherwise | |
| `JOB_QUEUE_MAX_AGE_SECONDS` | `900` | |
| `CRON_SECRET` | unset | Injected by Vercel into cron requests, if crons are ever configured. |

`next.config.ts` is wrapped in `withSentryConfig` with `deleteSourcemapsAfterUpload: true` —
maps upload but do not ship to the browser. **The build succeeds without the token**, so CI and
local builds are unaffected.

---

## How an alert reaches a human

Code alone does not alert anyone. Two Sentry issue alert rules must be created once, by hand:

| Rule | Condition | Routes to |
|---|---|---|
| Absence — job queue | tag `alert.kind` equals `absence` | engineering email / Slack |
| View tracking — unresolved | tag `alert.kind` equals `view-unresolved`, more than 5 in 1 hour | engineering email / Slack |

Until those rules exist, the events land in Sentry and nobody is told. **A metric nobody sees is
the same as no metric**, and this is the step that closes that gap. It is recorded here and in
`.env.example` because it is the part most likely to be skipped.

The job-queue rule additionally requires something to invoke `GET /api/monitoring/absence` on a
schedule. Per D8 that scheduler does not exist yet and is a deploy decision, not a code one.

---

## Out of scope

Named explicitly so they are not smuggled in:

- Metrics dashboards, OpenTelemetry, distributed tracing (`tracesSampleRate` is 0).
- Business KPI collection — BR-OBS-005.
- `/health`, `/readiness`, `/liveness` — BR-OBS-004.
- Session Replay. It records the DOM, which on this product means listing photographs, chat
  between a seeker and an agent, and verification forms. Set to 0 deliberately, and not a
  default to be turned on casually.
- Retrofitting request-lifecycle logging to all ~30 route handlers. The failure path logs; a
  `withRequestLogging` wrapper serves the drain and monitoring routes. Full retrofit is a
  separate decision.
- `vercel.json` — see D8.

---

## Open questions

1. **Scheduler and the Pro decision.** ADR-032 deferred it; D8 keeps it deferred with evidence.
   Needs deciding alongside Supabase image transformation.
2. **The Sentry rate for `view-unresolved`.** Deliberately left to the alert rule so it can be
   tuned without a deploy. Starting point: more than 5 in an hour.
3. **Day-over-day view baseline.** The correct long-term form of the view alert once there is
   traffic to baseline against. Not a threshold problem.
