-- ADR-032: a Postgres-backed job queue drained by scheduled invocation.
--
-- The decisive property is the outbox property: the queue lives in the same
-- database as the domain data, so a job is enqueued in the same transaction as
-- the write that causes it. Either the listing is approved and its notification
-- is queued, or neither happened. No external queue can offer that, because
-- enqueuing to one is a network call that can fail after commit or succeed
-- before rollback.
--
-- This is the same hazard closed by create_inspection_request_with_chat. The
-- enqueue entry point below is SQL precisely so it can be called from inside
-- another function's transaction. There is deliberately no application-level
-- enqueue: one would look transactional at the call site and not be.

create type public.job_status as enum (
  'queued',
  'running',
  'completed',
  'retrying',
  'failed_permanently'
);

comment on type public.job_status is
  'REB-ARCH-008 job states. failed_permanently is terminal and retained — a permanently failed job is evidence, not garbage.';

-- Lanes, not separate tables.
--
-- One table preserves the outbox property and keeps the queue inspectable with
-- a single query. Separate *drains* prevent a 90-second media job from
-- starving a message send. ADR-032 anticipates this: "Batch claiming is per job
-- type where starvation is plausible."
create type public.job_queue as enum (
  'default',
  'media'
);

create table public.jobs (
  id uuid primary key default public.uuidv7(),
  queue public.job_queue not null default 'default',
  type text not null check (char_length(trim(type)) > 0),

  -- Identifiers only. ADR-032: "No job payload contains a secret, a token, or
  -- a signed URL." A handler fetches what it needs when it runs; a payload
  -- captured at enqueue time would embed a credential in a row that is
  -- retained indefinitely, and a signed URL would expire before the retry.
  payload jsonb not null default '{}'::jsonb,

  status public.job_status not null default 'queued',
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),

  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,

  -- Handler output, kept beside the job rather than in a separate table.
  -- REB-ARCH-008 expects a job to record its own outcome. Written by
  -- complete_job, so a handler's observable effect can stay inside the jobs
  -- table when it has no domain effect of its own.
  result jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The claim query's access path: due jobs in one lane, oldest first.
create index jobs_claim_idx
  on public.jobs (queue, status, scheduled_at, id)
  where status in ('queued', 'retrying');

create index jobs_status_idx on public.jobs (status);
create index jobs_type_idx on public.jobs (type);

create trigger set_jobs_updated_at
before update on public.jobs
for each row
execute function public.set_updated_at();

alter table public.jobs enable row level security;

-- Grants, per ADR-010-A1: a grant decision, not only a policy.
--
-- The authenticated role gets SELECT and nothing else. No INSERT, because
-- enqueuing happens inside SQL functions running as the definer, never from a
-- client. No UPDATE, because claiming and completing are the drain's business
-- and a caller who could rewrite `status` could replay or suppress work. No
-- DELETE, because failed jobs are retained.
--
-- SELECT is granted with an admin-only policy rather than left ungranted so
-- the queue is inspectable by an operator through the ordinary authenticated
-- path, and so the table satisfies the CI invariant that every RLS-enabled
-- table carries at least one policy. A table with RLS and no policy denies
-- everything, which is safe but indistinguishable from a policy someone forgot
-- to write.
grant select on public.jobs to authenticated;

-- The service role needs full DML: the drain claims, completes and fails jobs.
--
-- Stated explicitly because migration 0010's `grant all on all tables` was a
-- point-in-time statement, not a default privilege — it granted what existed
-- then and nothing since. `jobs` is the first table created after it, and it
-- landed with no service-role grant at all, so the drain could not read its own
-- queue. The ALTER DEFAULT PRIVILEGES below stops the next table repeating it.
grant select, insert, update, delete on public.jobs to service_role;

create policy "admins_read_jobs"
on public.jobs
for select
to authenticated
using (public.current_user_has_role('admin'));

-- anon gets nothing at all: no grant, no policy.

-- ---------------------------------------------------------------- enqueue
--
-- Callable from inside another function's transaction. That is the whole
-- point: `perform public.enqueue_job(...)` next to a domain UPDATE means both
-- land or neither does.
--
-- SECURITY INVOKER deliberately, not DEFINER. The caller is already a trusted
-- SQL function or the service role; making this DEFINER would let any role
-- that can execute it insert jobs, which is exactly the privilege the grants
-- above withhold.
create or replace function public.enqueue_job(
  job_type text,
  job_payload jsonb default '{}'::jsonb,
  target_queue public.job_queue default 'default',
  run_at timestamptz default now(),
  attempts_allowed integer default 5
)
returns uuid
language sql
volatile
as $$
  insert into public.jobs (max_attempts, payload, queue, scheduled_at, type)
  values (attempts_allowed, job_payload, target_queue, run_at, job_type)
  returning id
$$;

comment on function public.enqueue_job(text, jsonb, public.job_queue, timestamptz, integer) is
  'Enqueue a job. Call from inside the transaction performing the domain write, never as a standalone statement — a separate call is not transactional with anything.';

-- Only the service role may enqueue directly. Domain SQL functions calling
-- this inherit their caller's right to execute it.
grant execute on function public.enqueue_job(text, jsonb, public.job_queue, timestamptz, integer)
  to service_role;

-- ------------------------------------------------------------------ claim
--
-- FOR UPDATE SKIP LOCKED is what makes overlapping drains safe: a row locked
-- by one invocation is skipped by the other rather than waited on, so two
-- simultaneous drains claim disjoint sets and never execute the same job twice.
--
-- attempts is incremented at claim time, not at failure time. If the drain
-- process dies mid-handler the attempt is still counted, so a job that reliably
-- crashes its worker exhausts its retries and lands in failed_permanently
-- instead of being reclaimed forever.
create or replace function public.claim_jobs(
  target_queue public.job_queue,
  batch_size integer
)
returns setof public.jobs
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with due as (
    select j.id
    from public.jobs j
    where j.queue = target_queue
      and j.status in ('queued', 'retrying')
      and j.scheduled_at <= now()
    order by j.scheduled_at, j.id
    limit batch_size
    for update skip locked
  )
  update public.jobs j
  set status = 'running',
      started_at = now(),
      attempts = j.attempts + 1
  from due
  where j.id = due.id
  returning j.*;
end;
$$;

grant execute on function public.claim_jobs(public.job_queue, integer) to service_role;

-- --------------------------------------------------------------- complete
create or replace function public.complete_job(
  job_id uuid,
  job_result jsonb default null
)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update public.jobs
  set status = 'completed',
      completed_at = now(),
      last_error = null,
      result = job_result
  where id = job_id
$$;

grant execute on function public.complete_job(uuid, jsonb) to service_role;

-- ------------------------------------------------------------------- fail
--
-- Exponential backoff, and a terminal state that retains the row. ADR-032:
-- failed jobs after maximum attempts are "retained and surfaced, never
-- silently dropped".
create or replace function public.fail_job(
  job_id uuid,
  error_message text,
  base_delay_seconds integer default 30
)
returns public.job_status
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  current_attempts integer;
  allowed integer;
  next_status public.job_status;
begin
  select attempts, max_attempts into current_attempts, allowed
  from public.jobs where id = job_id;

  if current_attempts is null then
    return null;
  end if;

  if current_attempts >= allowed then
    next_status := 'failed_permanently';

    update public.jobs
    set status = next_status,
        completed_at = now(),
        last_error = error_message
    where id = job_id;
  else
    next_status := 'retrying';

    update public.jobs
    set status = next_status,
        last_error = error_message,
        -- 30s, 60s, 120s, 240s ... capped so a long-lived queue does not
        -- schedule a retry days out.
        scheduled_at = now() + make_interval(
          secs => least(base_delay_seconds * power(2, current_attempts - 1), 3600)
        )
    where id = job_id;
  end if;

  return next_status;
end;
$$;

grant execute on function public.fail_job(uuid, text, integer) to service_role;

-- ------------------------------------------------------------- monitoring
--
-- Age of the oldest job still waiting, per lane.
--
-- ADR-032 is explicit that alerting on queue depth is wrong: depth reads zero
-- when the drain has stopped, because nothing is being enqueued faster than
-- nothing is being drained. Age rises monotonically the moment draining stops,
-- which is the failure this is meant to catch — a drain that quietly stops and
-- errors nowhere, while work simply does not happen.
create or replace function public.job_queue_health()
returns table (
  queue public.job_queue,
  oldest_queued_age_seconds numeric,
  queued_count bigint,
  running_count bigint,
  failed_permanently_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    q.queue,
    coalesce(
      extract(
        epoch from (
          now() - min(j.scheduled_at) filter (
            where j.status in ('queued', 'retrying') and j.scheduled_at <= now()
          )
        )
      ),
      0
    )::numeric as oldest_queued_age_seconds,
    count(*) filter (where j.status in ('queued', 'retrying')) as queued_count,
    count(*) filter (where j.status = 'running') as running_count,
    count(*) filter (where j.status = 'failed_permanently') as failed_permanently_count
  from (select unnest(enum_range(null::public.job_queue)) as queue) q
  left join public.jobs j on j.queue = q.queue
  group by q.queue
  order by q.queue
$$;

grant execute on function public.job_queue_health() to service_role;

-- ------------------------------------------------- future tables inherit it
--
-- 0010 granted service_role everything that existed at that moment. Nothing
-- carried the grant forward, so every table added afterwards arrived
-- unreachable by the drain, the audit writer, and every other privileged path
-- — failing only in a freshly built environment, which is precisely the
-- failure mode ADR-010-A1 records as requirement five.
--
-- Default privileges apply to tables created later by this role, which closes
-- it once rather than per-table.
alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;
