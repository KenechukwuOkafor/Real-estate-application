-- ---------------------------------------------------------------------------
-- BR-OBS-001 (Critical) and REB-ENG-005: a Request ID follows the request into
-- any job it enqueues.
--
-- A job's log lines have to lead back to the request that caused the work,
-- which may have finished minutes earlier. Without this column the drain has no
-- way to know which request it is working on behalf of, and every job failure
-- is an orphan.
--
-- A column rather than a payload field, deliberately, for two independent
-- reasons. ADR-032 constrains the payload to identifiers only. And the event
-- sanitiser redacts any key named `payload` wholesale, so an id placed there
-- would be stripped before it ever reached a log line or a Sentry event —
-- present in the database, useless everywhere it was needed.
-- ---------------------------------------------------------------------------

alter table public.jobs
  add column enqueued_by_request_id text
    check (
      enqueued_by_request_id is null
      or enqueued_by_request_id ~ '^[A-Za-z0-9._-]{8,128}$'
    );

comment on column public.jobs.enqueued_by_request_id is
  'Correlation id of the request that enqueued this job. Same charset and length guard as the middleware, because the value reaches a log line and must not carry arbitrary caller-controlled text.';

-- claim_jobs returns `setof public.jobs`, so it picks the column up with no
-- change of its own.

-- ------------------------------------------------------------------ enqueue
--
-- The old five-argument signature is DROPPED, not left alongside the new one.
--
-- Adding a trailing defaulted parameter creates an overload rather than
-- replacing the function, and because every parameter after the first two is
-- defaulted in both, PostgreSQL cannot choose between them:
--
--   ERROR:  function public.enqueue_job(unknown, jsonb) is not unique
--   HINT:   Could not choose a best candidate function.
--
-- That breaks every existing two-argument call, which is how the queue
-- integration suite invokes it. With the old signature gone, calls of two
-- through six arguments all resolve to the new function unambiguously.
drop function if exists public.enqueue_job(
  text, jsonb, public.job_queue, timestamptz, integer
);

-- SECURITY INVOKER is preserved from 0017. Making this DEFINER would let any
-- role that can execute it insert jobs, which is exactly the privilege the
-- grants withhold.
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

-- Callers that pass fewer than six arguments — which is all of them today —
-- simply record a null correlation id, and the drain falls back to its own id
-- for those rows.
