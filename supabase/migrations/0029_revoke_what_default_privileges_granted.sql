-- ---------------------------------------------------------------------------
-- The grants nobody wrote, and the revoke that never reached them.
--
-- ADR-010-A1 requirement one already says this: "Default privileges are
-- revoked. Anonymous and authenticated roles hold no privileges on a table
-- until explicitly granted." It was believed satisfied. It was satisfied
-- POINT-IN-TIME, by 0010 revoking from the tables that existed that day, and
-- default privileges are exactly the mechanism that makes a point-in-time
-- revoke stop being true — which is the sentence 0023 already wrote about
-- TRUNCATE and did not follow to its conclusion.
--
-- FOUND BY CI DISAGREEING WITH A DEVELOPER MACHINE, which is the only reason
-- it was found at all. queue-integration.test.ts asserts that an authenticated
-- caller cannot insert into public.jobs, and asserts it ON PRIVILEGE — "the
-- authenticated role holds SELECT only, so these fail on privilege before RLS
-- is consulted". Locally that passed. In CI it failed:
--
--   expected /permission denied/i,
--   got     'new row violates row-level security policy'
--
-- Same migrations, two environments, different grants. The test was not flaky
-- and was not wrong; the claim it makes was false, and RLS was quietly
-- catching what the grant was supposed to stop first.
--
-- The divergence is the local database, not CI. A fresh replay of these
-- migrations onto a clean image leaves the postgres-owned default ACL for
-- public tables at `anon=arwdm, authenticated=arwdm` — the image ships
-- `arwdDxtm` and 0023 removes only `D`, `x` and `t`. Every table created after
-- 0010 therefore arrives with SELECT, INSERT, UPDATE, DELETE and MAINTAIN for
-- both client roles. Three did: jobs, listing_revisions and
-- verification_documents. The local database differed only because it was
-- built by an older CLI whose init narrowed that default; it had been passing
-- this suite against privileges the migrations never removed.
--
-- MAINTAIN IS WHY THIS IS BLANKET AND NOT A LIST. 0023 enumerated three
-- privileges. PostgreSQL 17 then added a fourth, `MAINTAIN`, which walked
-- straight through the enumeration and is still held on those same three
-- tables in BOTH environments today. `REVOKE ALL` is immune to the next one;
-- a list is a list of the privileges that existed when it was written. Note
-- also that information_schema.table_privileges does not report MAINTAIN at
-- all, so any check written against information_schema is blind to precisely
-- the privilege that leaked — the assertions added with this migration read
-- has_table_privilege and relacl instead.
-- ---------------------------------------------------------------------------

-- ============================================================================
-- 1. The default itself, so no future table repeats this.
-- ============================================================================
--
-- Blanket, and for every object type a client role can hold something on. This
-- is the statement 0010 needed and did not have; without it, this migration is
-- another point-in-time revoke and the table added after it inherits the lot
-- again.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;

alter default privileges in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges in schema public
  revoke all on functions from anon, authenticated;

-- NOT COVERED, AND SAID SO RATHER THAN LEFT TO BE DISCOVERED: the
-- supabase_admin-owned default ACL in this schema is also permissive, and
-- nothing here changes it. It does not matter today because every object in
-- public is created by `postgres` when these migrations run, and it becomes a
-- problem the moment something is created as supabase_admin. The assertions in
-- CI are written against the resulting privileges rather than against this
-- statement, so that route is caught by outcome even though it is not closed
-- by decree.

-- ============================================================================
-- 2. The three tables that already inherited it.
-- ============================================================================
--
-- Revoke everything, then re-grant precisely what each table's own migration
-- meant to give. Revoke-and-restate rather than revoke-the-difference: the
-- difference is what a list is, and a list is what MAINTAIN defeated.
--
-- anon gets nothing on any of the three and is not re-granted. It never had a
-- policy on any of them either — every policy on these tables names
-- {authenticated} — so anon's inherited SELECT/INSERT/UPDATE/DELETE was
-- already dead against RLS. That is the definition of defence in depth having
-- silently become defence in one.
revoke all on public.jobs from anon, authenticated;
revoke all on public.listing_revisions from anon, authenticated;
revoke all on public.verification_documents from anon, authenticated;

-- 0017: admins read the queue through admins_read_jobs.
grant select on public.jobs to authenticated;

-- 0023: agents read their own revisions through agents_read_own_listing_revisions.
grant select on public.listing_revisions to authenticated;

-- 0016 plus the column narrowing from 0028, restated exactly. The column list
-- is the one 0028 chose; nothing is added to it here.
grant select on public.verification_documents to authenticated;
grant insert (
  agent_verification_submission_id,
  agent_profile_id,
  document_type,
  storage_path,
  mime_type,
  size_bytes,
  original_filename
) on public.verification_documents to authenticated;

-- ============================================================================
-- 3. Functions: PUBLIC holds EXECUTE unless something takes it away.
-- ============================================================================
--
-- This is the half that was actually reachable, and it is a mechanism worth
-- stating plainly because nothing about the code shows it.
--
--   revoke all on function f() from public;
--   grant execute on function f() to service_role;
--
-- reads as "only the service role may call this". It is not what it does. Two
-- separate things grant EXECUTE to a client role, and that pair addresses
-- neither of them completely:
--
--   * PostgreSQL's own built-in default grants EXECUTE on every new function
--     to PUBLIC. `revoke ... from public` does remove that — where it was
--     written. 0017 and 0018 never wrote it, so enqueue_job, claim_jobs,
--     complete_job, fail_job and job_queue_health carry `=X/` to this day, in
--     EVERY environment including the developer machine. Four of the five are
--     SECURITY DEFINER, so RLS is not in the path at all. Verified through
--     PostgREST with nothing but the anon key: /rpc/job_queue_health answers
--     200, and claim_jobs returns job rows with their payloads.
--
--   * The default ACL grants EXECUTE DIRECTLY to anon and authenticated, as
--     named roles. `revoke ... from public` does NOT remove a direct grant to
--     a named role — PUBLIC is not a group containing them. So
--     apply_listing_revision and reject_listing_revision, which DO carry the
--     revoke, were still executable by anon in any freshly built environment.
--     Proven in a scratch container: create a function, revoke all from
--     public, grant execute to service_role, and anon still has EXECUTE.
--
-- The second one is the serious one. Both revision functions are SECURITY
-- DEFINER, neither contains any authorization check, and reviewer_user_id is
-- an argument — so an anonymous caller could approve any pending revision onto
-- a live listing, with arbitrary title, description and price, attributed to
-- any user id they chose. That is moderation bypassed entirely, on the one
-- guarantee the product sells.
--
-- Unexercised by the application, which only ever reaches these through
-- getSupabaseAdminClient() behind requireAdminContext(). Reachable regardless:
-- PostgREST exposes every function in the exposed schema at /rpc/<name>, and
-- the application is not the only caller of its own database.
--
-- REVOKING FROM ALL THREE, NOT ONE. `public`, `anon` and `authenticated` are
-- three separate sources and removing one leaves the others standing. That is
-- the entire lesson of this section.

-- The service-role functions. Nothing that is not the drain or an admin path
-- has any business calling these.
-- One signature only: 0018 dropped the five-argument form when it added
-- request_id, so the overload 0017 granted no longer exists.
revoke all on function public.enqueue_job(text, jsonb, public.job_queue, timestamptz, integer, text)
  from public, anon, authenticated;
revoke all on function public.claim_jobs(public.job_queue, integer)
  from public, anon, authenticated;
revoke all on function public.complete_job(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.fail_job(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.job_queue_health()
  from public, anon, authenticated;
revoke all on function public.apply_listing_revision(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.reject_listing_revision(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.enqueue_job(text, jsonb, public.job_queue, timestamptz, integer, text)
  to service_role;
grant execute on function public.claim_jobs(public.job_queue, integer) to service_role;
grant execute on function public.complete_job(uuid, jsonb) to service_role;
grant execute on function public.fail_job(uuid, text, integer) to service_role;
grant execute on function public.job_queue_health() to service_role;
grant execute on function public.apply_listing_revision(uuid, uuid) to service_role;
grant execute on function public.reject_listing_revision(uuid, uuid, text) to service_role;

-- The authenticated-caller functions. Every one of them resolves the caller
-- and refuses an anonymous one, so anon holding EXECUTE was contained rather
-- than exploitable — but "contained by something else" is the reasoning this
-- whole amendment exists to stop accepting. anon loses EXECUTE; authenticated
-- keeps exactly what its own migration granted.
revoke all on function public.archive_own_listing(uuid) from public, anon;
revoke all on function public.remove_listing_image(uuid) from public, anon;
revoke all on function public.own_agent_rejection_reason() from public, anon;
revoke all on function public.is_chat_participant(uuid) from public, anon;
revoke all on function public.counterparty_display_names(uuid[]) from public, anon;
revoke all on function public.create_inspection_request_with_chat(uuid, text, timestamptz)
  from public, anon;
revoke all on function public.submit_listing_revision(
  uuid, text, text, bigint, jsonb, public.rental_duration, integer
) from public, anon;

grant execute on function public.archive_own_listing(uuid) to authenticated;
grant execute on function public.remove_listing_image(uuid) to authenticated;
grant execute on function public.own_agent_rejection_reason() to authenticated;
grant execute on function public.is_chat_participant(uuid) to authenticated;
grant execute on function public.counterparty_display_names(uuid[]) to authenticated;
grant execute on function public.create_inspection_request_with_chat(uuid, text, timestamptz)
  to authenticated;
grant execute on function public.submit_listing_revision(
  uuid, text, text, bigint, jsonb, public.rental_duration, integer
) to authenticated;

-- The four identity helpers from 0008 are deliberately NOT touched. anon must
-- keep EXECUTE on them: every policy on every table calls them, and an
-- anonymous caller whose policy cannot evaluate current_app_user_id() gets an
-- error where the intended answer is a quiet false. They return null for an
-- anonymous caller by construction, which is the whole design.

-- ============================================================================
-- 4. The two functions that trusted their grant, and now check for themselves.
-- ============================================================================
--
-- Section 3 restores the grant. This section makes the grant stop being the
-- only thing standing there, because that is the condition that turned a
-- default-ACL quirk into a moderation bypass rather than a lint finding.
--
-- Every other SECURITY DEFINER function in this schema already resolves its
-- caller before it writes: archive_own_listing, remove_listing_image,
-- respond_to_inspection_request, cancel_inspection_request. These two were the
-- exception, and the exception is not visible when reading them — a reviewer
-- sees `revoke all from public; grant execute to service_role` above the
-- function and reasonably concludes the caller has already been established.
-- It had not been, and as section 3 records, that revoke does not even do what
-- it appears to.
--
-- WHAT THE CHECK HAS TO ACCOMMODATE. The only legitimate caller is the admin
-- service, which reaches these through getSupabaseAdminClient() — the
-- service-role key, which carries no user identity. So
-- current_user_has_role('admin') alone would refuse the one caller that is
-- supposed to work: clerk_user_id() is null on a service-role connection and
-- the check would fail closed on the happy path.
--
-- current_user is no use either. Inside a SECURITY DEFINER function it is the
-- owner, `postgres`, for every caller alike. What does survive is the `role`
-- GUC: PostgREST issues SET LOCAL ROLE from the verified JWT before the
-- statement runs, and SECURITY DEFINER does not disturb it. Confirmed against
-- this database — a caller entering as `authenticated` reads 'authenticated'
-- inside the function, and one entering as `service_role` reads 'service_role'.
--
-- SO THE CHECK IS TWO-SIDED, AND BOTH SIDES ARE REQUIRED:
--
--   * the caller is the service role, or an authenticated user who actually
--     holds 'admin' in public.user_roles; AND
--   * reviewer_user_id names a user who actually holds 'admin'.
--
-- The second is not redundant. reviewer_user_id is written into
-- listing_revisions.reviewed_by as the record of who made a moderation
-- decision, and it is a caller-supplied argument — so without it, the service
-- role could attribute a decision to any user id at all, including an agent's
-- own. A moderation log that can name someone who did not decide is not a
-- moderation log. Checking it costs one index lookup on the path a human
-- clicks once.
--
-- HONEST LIMIT, STATED BECAUSE THE NEXT PERSON WILL ASK. The role GUC is worth
-- exactly what the JWT is worth: anyone holding the service-role key can
-- satisfy the first condition, and anyone holding it could bypass all of this
-- with a direct table write anyway. This check does not defend against a
-- leaked service-role key. It defends against the case that actually occurred
-- — EXECUTE reaching anon or authenticated through a grant nobody wrote — and
-- it fails closed there, which the grant alone did not.

create or replace function public.assert_caller_moderates(reviewer_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The caller.
  if coalesce(current_setting('role', true), '') <> 'service_role'
     and not public.current_user_has_role('admin') then
    raise exception 'ADMIN_ROLE_REQUIRED'
      using errcode = '42501',
            detail = 'Only an administrator may review a listing revision.';
  end if;

  -- The name that will be written into the record as having decided.
  if not exists (
    select 1
    from public.user_roles ur
    join public.users u on u.id = ur.user_id
    where ur.user_id = reviewer_user_id
      and ur.role = 'admin'
      and u.deleted_at is null
  ) then
    raise exception 'REVIEWER_IS_NOT_AN_ADMIN'
      using errcode = '42501',
            detail = 'A revision review can only be attributed to an administrator.';
  end if;
end;
$$;

comment on function public.assert_caller_moderates(uuid) is
  'Refuses unless the caller is the service role or an admin, AND reviewer_user_id names an admin. Extracted so both revision paths check identically — see 0029.';

revoke all on function public.assert_caller_moderates(uuid) from public, anon, authenticated;
grant execute on function public.assert_caller_moderates(uuid) to service_role;

-- Both functions recreated unchanged except for the assertion. The bodies are
-- otherwise 0023's, line for line: this migration is not the place to revisit
-- what applying a revision does.
create or replace function public.apply_listing_revision(
  target_revision_id uuid,
  reviewer_user_id uuid
)
returns table (listing_id uuid, revision_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  revision public.listing_revisions%rowtype;
begin
  -- FIRST, before the row is even read. A refusal must not depend on whether
  -- the revision exists, or the error itself answers "is this a real revision
  -- id" for a caller who should not have got this far.
  perform public.assert_caller_moderates(reviewer_user_id);

  select * into revision
  from public.listing_revisions
  where id = target_revision_id;

  if revision.id is null then
    raise exception 'LISTING_REVISION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if revision.status <> 'pending_review' then
    raise exception 'LISTING_REVISION_ALREADY_REVIEWED' using errcode = '22023';
  end if;

  update public.listings
     set amenities = revision.amenities,
         description = revision.description,
         price_naira = revision.price_naira,
         rental_duration = revision.rental_duration,
         sublet_months = revision.sublet_months,
         title = revision.title
   where id = revision.listing_id;

  update public.listing_revisions
     set reviewed_at = now(),
         reviewed_by = reviewer_user_id,
         status = 'approved'
   where id = target_revision_id;

  return query select revision.listing_id, target_revision_id;
end;
$$;

comment on function public.apply_listing_revision(uuid, uuid) is
  'Apply a pending revision to its listing and mark it approved, in one statement. Refuses any caller that is not the service role or an admin, and any reviewer_user_id that does not name an admin — the grant is not the authorization check. See 0029.';

create or replace function public.reject_listing_revision(
  target_revision_id uuid,
  reviewer_user_id uuid,
  reason text
)
returns table (listing_id uuid, revision_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  revision public.listing_revisions%rowtype;
begin
  perform public.assert_caller_moderates(reviewer_user_id);

  select * into revision
  from public.listing_revisions
  where id = target_revision_id;

  if revision.id is null then
    raise exception 'LISTING_REVISION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if revision.status <> 'pending_review' then
    raise exception 'LISTING_REVISION_ALREADY_REVIEWED' using errcode = '22023';
  end if;

  update public.listing_revisions
     set reviewed_at = now(),
         reviewed_by = reviewer_user_id,
         rejection_reason = reason,
         status = 'rejected'
   where id = target_revision_id;

  return query select revision.listing_id, target_revision_id;
end;
$$;

comment on function public.reject_listing_revision(uuid, uuid, text) is
  'Refuse a revision; the listing keeps the values a moderator already approved. Same authorization check as apply_listing_revision — see 0029.';

-- CREATE OR REPLACE preserves the ACL of an existing function, so the revokes
-- in section 3 still stand over these two. Restated anyway: a future edit that
-- drops and recreates instead would silently hand them back to PUBLIC, and
-- these two are the pair where that mattered most.
revoke all on function public.apply_listing_revision(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.reject_listing_revision(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.apply_listing_revision(uuid, uuid) to service_role;
grant execute on function public.reject_listing_revision(uuid, uuid, text) to service_role;
