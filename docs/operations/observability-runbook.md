# Observability Runbook

Implements ADR-026. Companion to
`docs/superpowers/specs/2026-08-19-observability-design.md`.

---

## The two alert rules you must create by hand

**A metric nobody sees is the same as no metric.** The application emits these
events; **Sentry notifies nobody until the rules below exist.** Create them once,
in Sentry → Alerts → Create Alert → Issues.

**Create both. Only one of them can fire today.**

| # | Alert | Tag `alert.kind` | Status | Becomes live when |
|---|---|---|---|---|
| 1 | Listing views are not being recorded | `view-unresolved` | **Works** — fires per event | the first `preview` or `production` deploy exists |
| 2 | The job drain has stopped | `absence` | **Cannot fire at all** | something invokes `GET /api/monitoring/absence` on a schedule |

The asymmetry is the important part, and it runs the wrong way round.

Alert 1 is driven by ordinary user traffic: a view beacon arrives, fails to
resolve, and the event is reported on that single request. Nothing else has to
be built for it to work.

Alert 2 is driven by a route that **nothing calls**. `GET /api/monitoring/absence`
computes the oldest-queued-job age correctly and reports a breach correctly — it
has no caller. An alert rule matching `alert.kind: absence` will sit in Sentry
matching zero events forever, and a rule that has never fired is
indistinguishable from a system that has never broken.

That is the failure this runbook most needs to prevent. A stalled drain is the
single failure here **most likely to go unnoticed**: the queue does not grow
visibly, no request 500s, no user sees an error, and every dashboard reads
healthy while inspection requests and media jobs silently stop being processed.
Alert 2 is the only thing that would say so, and until a scheduler exists it says
nothing. See *Scheduling — UNRESOLVED* below; that decision, not this rule, is
what makes alert 2 real.

Neither alert fires from a local run. Transmission is gated to
`NEXT_PUBLIC_APP_ENV` of exactly `preview` or `production` — see *Environments*.

### 1. Listing views are not being recorded — WORKS

| Field | Value |
|---|---|
| When | An issue matches tag `alert.kind` equals `view-unresolved` |
| And | The issue is seen more than **5** times in **one hour** |
| Then | Notify the engineering email / Slack channel |

**What it means.** View beacons are arriving with well-formed identifiers that
resolve to no listing. The endpoint answers 200 either way, so this is invisible
without the alert — it ran undetected for months once already.

**Why a count and not a silence threshold.** The obvious alert is "no views have
arrived recently", and it is wrong here. With no users yet, silence measures the
absence of users rather than the absence of the system working, so it would fire
continuously and be muted — which is exactly how the tracker came to be ignored
the first time. The bug was never "no views arriving"; it was views arriving and
not being recorded. That is a finding on a single request and needs no baseline.

**Tuning.** The threshold lives in this rule, not in code, so changing it is a UI
change rather than a deploy. Expect a low natural floor: a well-formed identifier
for a deleted or unpublished listing is legitimately unresolved. The original bug
was 100% of views unresolved, which clears any plausible floor within a handful
of requests.

**What to do.** Check the `slugOrPublicId` on the event. The usual cause is a
caller sending `listings.id` where `listings.public_uuid` is required — both are
UUIDs, so the wrong column resolves to nothing rather than erroring.

### 2. The job drain has stopped — INERT UNTIL A SCHEDULER EXISTS

> **This rule cannot fire today.** It matches events emitted by
> `GET /api/monitoring/absence`, and nothing invokes that route — there is no
> `vercel.json`, no scheduled workflow, and no external caller. Creating the rule
> now is still worth doing, so the alerting side is ready the moment a scheduler
> is wired. Do not read its silence as a healthy queue.

| Field | Value |
|---|---|
| When | An issue matches tag `alert.kind` equals `absence` |
| Then | Notify the engineering email / Slack channel |
| Rate limit | At most once per hour per issue |

**What it means.** A lane has work older than `JOB_QUEUE_MAX_AGE_SECONDS`
(default 900).

Per ADR-032, depth is deliberately **not** the signal: depth reads zero both
when everything is healthy and when the drain has stopped, because nothing
drains and nothing accumulates visibly. Age rises the moment draining stops.

**What to do.** First confirm the check itself is running at all — if nothing is
invoking `GET /api/monitoring/absence` on a schedule, this alert proves nothing
either way. Then confirm something is invoking
`POST /api/jobs/drain?queue=<lane>`. See *Scheduling* below — as of this writing,
**nothing is invoking either route**.

---

## Scheduling — UNRESOLVED

`GET /api/monitoring/absence` and `POST /api/jobs/drain` both need something to
invoke them on a schedule. **Nothing does yet.** ADR-032 deferred this decision;
it is still deferred, now with evidence.

This is not only a queue problem. It is also what holds alert 2 above at zero
events: with no caller, the absence check never runs, never reports, and never
notifies. Resolving this section is what converts alert 2 from a rule that exists
into a rule that works.

### Why there is no `vercel.json`

Verified 2026-08-19 against Vercel's cron documentation:

| Plan | Minimum interval | Scheduling precision |
|---|---|---|
| Hobby | **Once per day** | Per-hour (±59 min) |
| Pro | Once per minute | Per-minute |
| Enterprise | Once per minute | Per-minute |

The failure mode matters more than the cap. Sub-daily cron expressions do not
degrade on Hobby — they **fail deployment**:

> *Hobby accounts are limited to daily cron jobs. This cron expression would run
> more than once per day.*

So committing a `vercel.json` with the schedules this system needs would break
the deploy outright. And a once-daily drain with ±59 minutes of jitter is not a
job queue: **the job queue is functionally inert on Hobby.**

This is the **second hard Pro dependency** after Supabase image transformation.
Vercel Pro is $20/month (platform fee, one deploying seat, $20 usage credit
included). Both should be decided together rather than the second being
discovered at deploy time.

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

Set `CRON_SECRET` in Vercel project settings. Both routes accept it alongside
their own named secret, so nothing needs duplicating.

**B — GitHub Actions, free.** Scheduled workflows run at a **5-minute minimum**,
are best-effort ("can be delayed during periods of high loads of GitHub Actions
workflow runs; high load times include the start of every hour"), and are
**auto-disabled after 60 days of repository inactivity** (documented for public
repositories). A 5-minute best-effort drain is a real job queue in a way a
once-daily ±59-minute one is not. Store the secret as a repository secret and
`curl` both routes.

**C — External scheduler.** cron-job.org, Cronitor, or any uptime checker that
can send an `Authorization` header.

### The contract, whichever is chosen

| Route | Method | Auth | Frequency |
|---|---|---|---|
| `/api/jobs/drain?queue=default` | POST | `Bearer $JOBS_DRAIN_SECRET` or `$CRON_SECRET` | every 1–5 min |
| `/api/jobs/drain?queue=media` | POST | same | every 1–5 min |
| `/api/monitoring/absence` | GET | `Bearer $MONITORING_SECRET` or `$CRON_SECRET` | every 5–15 min |

`/api/monitoring/absence` **always returns 200**, including when a threshold is
breached. The verdict is in the body:

```json
{
  "data": {
    "breached": ["job-queue-age:default"],
    "checks": [{ "name": "...", "status": "breached", "detail": { } }],
    "thresholdSeconds": 900
  }
}
```

Do not configure an uptime checker to alert on its status code — a non-200 there
would mean the route is broken, not that the queue is stalled, and conflating
the two reproduces the failure this route exists to detect.

---

## What is deliberately not alerted

Per the error registry in `src/lib/api/error-codes.ts`, errors in the
`validation`, `authentication`, `authorization` and `business_rule` categories
are logged but **never** reported to Sentry.

An expected 403 is the boundary doing its job. Paging on it trains people to
ignore the pager, which is how the genuinely broken thing gets missed. Only
`infrastructure` and `unexpected` reach Sentry. A code that is not registered
resolves to `unexpected` and therefore alerts — noise is the safe direction;
silence is not.

---

## Correlation

Every response carries an `x-request-id` header. A user reporting a problem can
quote it, and it matches:

- the request's own structured log line,
- every service and repository line beneath it,
- the Sentry event's `request.id` tag,
- and any job that request enqueued — including the job's own lines when it runs
  minutes later, because the drain runs each job under the id of the request
  that queued it rather than its own.

```
grep req-0f1e2d3c
```

is the whole diagnostic procedure for "what happened to this user's request".

---

## Environments

Sentry transmits **only** when `NEXT_PUBLIC_APP_ENV` is exactly `preview` or
`production`. Anything else — `development`, `test`, unset — stays local, where
the logger prints human-readable lines instead of JSON.

This is gated on `NEXT_PUBLIC_APP_ENV` rather than `NODE_ENV` deliberately.
`NODE_ENV` is `test` under vitest, and an earlier gate of
`NODE_ENV !== "development"` meant a DSN in `.env.local` would have shipped every
local test run into the production issue stream.
