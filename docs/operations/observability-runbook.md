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
| 2 | The job drain has stopped | `absence` | **Cannot fire yet** | that same deploy exists — the scheduler now does |

Both rows now wait on the same thing, which was not true before. A scheduler
exists (`.github/workflows/scheduled-jobs.yml`, every five minutes), so alert 2
is no longer blocked on *nothing invoking the route*. It is blocked on there
being a URL for that workflow to call. **Building the scheduler did not make
alert 2 live; it moved the blocker from "no scheduler" to "no deployment".**

The asymmetry is the important part, and it runs the wrong way round.

Alert 1 is driven by ordinary user traffic: a view beacon arrives, fails to
resolve, and the event is reported on that single request. Nothing else has to
be built for it to work.

Alert 2 is driven by a route that now has a caller and still nothing to call.
`GET /api/monitoring/absence` computes the oldest-queued-job age correctly and
reports a breach correctly, and the scheduled workflow invokes it every five
minutes — but only once `APP_BASE_URL` names a deployment. Until then the
workflow skips with a warning and the rule matches zero events, and a rule that
has never fired is indistinguishable from a system that has never broken.

That is the failure this runbook most needs to prevent. A stalled drain is the
single failure here **most likely to go unnoticed**: the queue does not grow
visibly, no request 500s, no user sees an error, and every dashboard reads
healthy while inspection requests and media jobs silently stop being processed.
Alert 2 is the only thing that would say so, and until a scheduler exists it says
nothing. See *Scheduling* below for what now exists and what is still missing.

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

### 2. The job drain has stopped — INERT UNTIL A DEPLOYMENT EXISTS

> **This rule cannot fire yet.** It matches events emitted by
> `GET /api/monitoring/absence`. A scheduled workflow now invokes that route
> every five minutes, but it has nowhere to send the request until
> `APP_BASE_URL` names a deployed environment — and nothing transmits to Sentry
> outside `preview`/`production` regardless. Creating the rule now is still
> worth doing, so the alerting side is ready the moment a URL exists. Do not
> read its silence as a healthy queue.

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

**What to do.** First confirm the check itself is running at all. Open the
**Scheduled jobs** workflow in the Actions tab: a run that skipped with a
warning did not call anything, and a green run there does **not** mean the queue
was drained. Then confirm the drain calls are succeeding rather than returning
401. See *Scheduling* below.

---

## Scheduling — DECIDED, and not yet running

**Decision (2026-08-20): GitHub Actions, every five minutes.** Not Vercel cron.
Implemented in `.github/workflows/scheduled-jobs.yml`, which invokes both drain
lanes and the absence check through `.github/scripts/call-machine-route.sh`.

The reasoning is that the queue, the drain, retry with backoff, terminal failure
and the queue-age check were all built and tested and had **never once run on a
schedule**. This project had accumulated more correct-but-unexercised
infrastructure than it could justify, and a free workflow file makes all of it
real. Vercel cron needs Pro and would fail the deploy on Hobby anyway — see
below.

### It is not running yet, and this is a different blocker

The workflow needs a URL. **There is no deployed environment**, so as of this
writing the schedule fires every five minutes, finds no `APP_BASE_URL`, emits a
warning and stops without calling anything.

Be precise about what that means, because it is easy to read the workflow's
existence as the problem being solved:

- The scheduler question is **closed**. Nothing further needs deciding or building.
- The drain still is not running, so the queue still is not being processed.
- Alert 2 still cannot fire.
- The blocker is now **the absence of a deployment**, which is a different and
  larger problem than the one the scheduler was blocking.

A run of this workflow that is green may mean "drained successfully" or it may
mean "skipped, because there was nowhere to call". The workflow annotates the
skip as a warning and writes it to the run summary, but a green tick alone does
not distinguish them. Read the summary, not the tick.

### What is needed to make it run

| # | Requirement | Cost | Notes |
|---|---|---|---|
| 1 | A deployed environment with a public URL | Vercel Hobby is **free** | Pro is only needed for *Vercel's* cron. Using GitHub Actions removes that dependency entirely — see below |
| 2 | A hosted Supabase project | Free tier works | The deployment cannot talk to `127.0.0.1`. Image transformation still wants Pro (ADR-015-A1), but the queue does not |
| 3 | Repository variable `APP_BASE_URL` | — | e.g. `https://ruvo.vercel.app`, no trailing slash needed |
| 4 | Repository secret `CRON_SECRET` | — | The **same value** must be set in the deployment's environment |
| 5 | `NEXT_PUBLIC_APP_ENV` = `preview` or `production` on the deployment | — | Nothing transmits to Sentry otherwise, so neither alert fires however healthy the schedule is |

One secret covers both routes: `assertMachineRequestAuthorized` accepts
`CRON_SECRET` alongside each route's named secret precisely so a schedule does
not have to duplicate one value into two places.

### Five minutes is a floor, not a guarantee

GitHub documents scheduled workflows as best-effort and states they can be
delayed under load, naming the start of every hour as a peak. **A late run is
normal operation here, not a fault.** Nothing in the workflow or the alerting
treats lateness as an error, and `JOB_QUEUE_MAX_AGE_SECONDS` (default 900) is
deliberately three times the interval so ordinary jitter cannot breach it.

### Sixty days of repository inactivity disables this

GitHub disables scheduled workflows on public repositories after **60 days
without repository activity**, and it does so **silently**. The drain simply
stops.

This matters more here than it would elsewhere, and it belongs next to the alert
asymmetry above for the same reason: it is another way this system stops working
while every visible signal still reads healthy. The queue-age alert is what
would catch it — and that alert is itself the one that cannot fire yet. Until it
can, a disabled schedule is invisible.

Re-enabling is manual: Actions → the workflow → **Enable workflow**. Any push
resets the 60-day clock, so an actively developed repository never reaches it.

### Why not Vercel cron

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
the deploy outright rather than running less often. And a once-daily drain with
±59 minutes of jitter is not a job queue: the queue would be functionally inert
on Hobby.

That made Vercel cron a **hard Pro dependency**. Choosing GitHub Actions
**removes it** — the deployment itself is fine on Hobby, because without a
`vercel.json` there is no cron expression for Hobby to reject. Supabase image
transformation (ADR-015-A1) remains a separate Pro question and is unaffected by
this decision.

There is deliberately **no `vercel.json`** in this repository.

### The contract, whichever scheduler is used

| Route | Method | Auth | Frequency |
|---|---|---|---|
| `/api/jobs/drain?queue=default` | POST | `Bearer $JOBS_DRAIN_SECRET` or `$CRON_SECRET` | every 1–5 min |
| `/api/jobs/drain?queue=media` | POST | same | every 1–5 min |
| `/api/monitoring/absence` | GET | `Bearer $MONITORING_SECRET` or `$CRON_SECRET` | every 5–15 min |

Lanes are drained by separate invocations so a slow media job cannot consume the
window a notification send needs.

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
the two reproduces the failure this route exists to detect. The workflow
deliberately does not parse the body either: the breach reaches a human through
the Sentry rule, not through a build log nobody reads.

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
