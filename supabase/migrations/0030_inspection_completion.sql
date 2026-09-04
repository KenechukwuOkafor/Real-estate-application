-- ---------------------------------------------------------------------------
-- The completion half of the inspection lifecycle.
--
-- An inspection went requested -> accepted or declined, and stopped. 'accepted'
-- was terminal in practice: nothing ever wrote 'completed', 'cancelled' or
-- 'expired', though all three have sat in the enum since 0005 with
-- completed_at and cancelled_at columns beside them.
--
-- Accepting now starts a second window. The agent has four days to mark the
-- inspection complete. An inspection they never mark has LAPSED.
--
-- NO SCHEDULED TIME, DELIBERATELY. There is no appointment column here and no
-- date picker above it. The parties agree when and where in the chat or
-- outside the app; the platform states the commitment and its deadline and
-- nothing more. REB-DOM-004 already says the platform "does not participate in
-- inspection scheduling beyond the tools provided" — ADR-019 says otherwise,
-- and adr-019-amendment-1 settles it in favour of the domain doc.
--
-- LAPSE IS NEVER WRITTEN. There is no 'lapsed' enum value and no lapsed_at
-- column, because no code path would ever set one. A lapsed inspection is an
-- accepted row whose completion_deadline has passed with completed_at still
-- null, evaluated at read time exactly as the 48-hour request expiry is —
-- see src/features/inspections/expiry.ts, which now holds both windows. That
-- keeps it countable for moderation later without a cron, a job, or a write
-- performed by a read.
--
-- THE GRANT DECISION, EXPLICITLY. 0012 granted the owning agent
-- update (status, responded_at, updated_at) on this table. That made
-- inspection_requests.status forgeable: an agent could PATCH status directly
-- through PostgREST, so any window enforced above the database would have been
-- decorative — 'completed' on day nine, or on a request nobody accepted, was a
-- single HTTP call. status is governance here for the same reason it is on
-- listings, so the grant comes out and BOTH transitions move behind SECURITY
-- DEFINER functions, the same shape as archive_own_listing in 0022,
-- remove_listing_image in 0020 and create_inspection_request_with_chat in 0015.
--
-- Moving accept/decline was not optional once status was revoked: it wrote
-- status through that same grant. The window is only worth what the weakest
-- path to status is worth.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------ the deadline, stored
--
-- Written at acceptance rather than derived from responded_at + 4 days. A
-- deadline is a fact fixed at the moment the commitment was made: if this
-- window is ever changed to five days, inspections already in flight must keep
-- the deadline their agent was actually given. Deriving it would silently move
-- every live deadline on deploy.
--
-- Nullable, and null for every status but 'accepted'. Rows accepted before this
-- migration carry no deadline and therefore never lapse, which is the
-- conservative reading the expiry module already applies to a missing
-- expires_at: guessing a deadline nobody wrote would close inspections nobody
-- meant to time out.
alter table public.inspection_requests
  add column completion_deadline timestamptz;

comment on column public.inspection_requests.completion_deadline is
  'When the agent''s four-day window to mark this inspection complete ends. Set at acceptance by respond_to_inspection_request. Null unless the row is accepted. A lapse is this deadline having passed with completed_at still null — it is never stored.';

-- ------------------------------------------------- status stops being writable
--
-- The row predicate stays correct and stops being load-bearing: with no column
-- granted, there is nothing for the policy to permit. Both come out together
-- rather than leaving a policy guarding a privilege nobody holds.
--
-- SELECT is untouched. Both parties must still read their own inspections, and
-- the seeker must be able to see that one lapsed.
revoke update on public.inspection_requests from authenticated;

drop policy if exists "owning_agent_responds_to_inspection_requests"
  on public.inspection_requests;

-- --------------------------------------------------------- accept or decline
--
-- Was a plain UPDATE from the service. The validation it performed in
-- TypeScript is performed here as well, because the TypeScript was never the
-- boundary — it was the only thing that had bothered to check.
create or replace function public.respond_to_inspection_request(
  target_request_id uuid,
  decision text
)
returns table (
  inspection_request_id uuid,
  completion_deadline timestamptz,
  responded_at timestamptz,
  status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_profile uuid;
  request_owner uuid;
  request_status text;
  request_expires timestamptz;
  request_deleted timestamptz;
  stamped timestamptz;
  deadline timestamptz;
begin
  if decision not in ('accepted', 'declined') then
    raise exception 'INSPECTION_DECISION_INVALID'
      using errcode = '22023',
            detail = 'An inspection request can only be accepted or declined.';
  end if;

  caller_profile := public.current_agent_profile_id();

  if caller_profile is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  select ir.agent_profile_id, ir.status::text, ir.expires_at, ir.deleted_at
    into request_owner, request_status, request_expires, request_deleted
  from public.inspection_requests ir
  where ir.id = target_request_id
  -- Read then write, so the row is locked: two tabs answering at once would
  -- otherwise both pass the status check before either of them writes.
  for update;

  -- Not yours and not there are the same answer on purpose: a distinguishable
  -- refusal turns the id into an oracle for which inspections exist.
  if request_owner is null
     or request_owner is distinct from caller_profile
     or request_deleted is not null then
    raise exception 'INSPECTION_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  if request_status <> 'requested' then
    raise exception 'INSPECTION_STATE_TRANSITION_INVALID'
      using errcode = '22023',
            detail = 'Only a request still awaiting an answer can be accepted or declined.';
  end if;

  -- The stored status says 'requested' forever; the deadline is what decides
  -- whether an answer is still allowed. Accepting five days late would commit
  -- a seeker who has long since moved on.
  if request_expires is not null and request_expires <= now() then
    raise exception 'INSPECTION_EXPIRED'
      using errcode = '22023',
            detail = 'This inspection request passed its 48 hour window before it was answered.';
  end if;

  stamped := now();

  -- Four days, written once, at the moment the commitment is made. Declining
  -- starts no window: there is nothing left to complete.
  if decision = 'accepted' then
    deadline := stamped + interval '4 days';
  else
    deadline := null;
  end if;

  update public.inspection_requests ir
     set status = decision::public.inspection_status,
         responded_at = stamped,
         completion_deadline = deadline,
         updated_at = stamped
   where ir.id = target_request_id;

  return query select target_request_id, deadline, stamped, decision;
end;
$$;

comment on function public.respond_to_inspection_request(uuid, text) is
  'The owning agent accepts or declines an inspection request. SECURITY DEFINER because inspection_requests.status is deliberately not granted — the privilege that writes ''accepted'' is the privilege that writes ''completed''. Sets the four-day completion deadline on acceptance. See 0029.';

revoke all on function public.respond_to_inspection_request(uuid, text) from public;
grant execute on function public.respond_to_inspection_request(uuid, text) to authenticated;

-- ------------------------------------------------------------ mark completed
--
-- The agent's action alone. The seeker does not confirm — requiring both
-- parties would leave every inspection an unresponsive seeker attended stuck
-- open, and would make the agent's record depend on somebody else's diligence.
--
-- A dispute path belongs on top of this later: a seeker who sees 'completed'
-- on a visit that did not happen is exactly the claim worth letting them
-- contest once there is volume. It is not this migration.
create or replace function public.complete_inspection_request(
  target_request_id uuid
)
returns table (
  inspection_request_id uuid,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_profile uuid;
  request_owner uuid;
  request_status text;
  request_deadline timestamptz;
  request_completed timestamptz;
  request_deleted timestamptz;
  stamped timestamptz;
begin
  caller_profile := public.current_agent_profile_id();

  if caller_profile is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  select ir.agent_profile_id,
         ir.status::text,
         ir.completion_deadline,
         ir.completed_at,
         ir.deleted_at
    into request_owner,
         request_status,
         request_deadline,
         request_completed,
         request_deleted
  from public.inspection_requests ir
  where ir.id = target_request_id
  for update;

  if request_owner is null
     or request_owner is distinct from caller_profile
     or request_deleted is not null then
    raise exception 'INSPECTION_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  if request_status <> 'accepted' or request_completed is not null then
    raise exception 'INSPECTION_STATE_TRANSITION_INVALID'
      using errcode = '22023',
            detail = 'Only an accepted inspection that has not already been completed can be marked complete.';
  end if;

  -- The lapse, enforced. A deadline that can be honoured late is not a
  -- deadline, and an agent marking a visit complete on day nine is making a
  -- claim about something nobody can check any more.
  --
  -- A row with no deadline recorded is accepted rather than refused: those are
  -- the rows accepted before this migration existed, and they never lapse.
  if request_deadline is not null and request_deadline < now() then
    raise exception 'INSPECTION_COMPLETION_WINDOW_CLOSED'
      using errcode = '22023',
            detail = 'The four-day window to mark this inspection complete has passed.';
  end if;

  stamped := now();

  update public.inspection_requests ir
     set status = 'completed',
         completed_at = stamped,
         updated_at = stamped
   where ir.id = target_request_id;

  return query select target_request_id, stamped;
end;
$$;

comment on function public.complete_inspection_request(uuid) is
  'The owning agent marks their accepted inspection complete, inside the four-day window. SECURITY DEFINER because inspection_requests.status is deliberately not granted. Completed is terminal — see inspection_requests_completed_is_terminal. See 0029.';

revoke all on function public.complete_inspection_request(uuid) from public;
grant execute on function public.complete_inspection_request(uuid) to authenticated;

-- ------------------------------------------------ completed is the last word
--
-- REB-DOM-004 BR-INSP-006 says inspection requests are immutable once
-- completed, and ADR-019 says completed inspections cannot be edited. Both
-- were true only as an absence: nothing wrote 'completed' at all, so nothing
-- had occasion to move a row back out of it.
--
-- Now that something does, the invariant needs a keeper that does not depend
-- on every future caller remembering it. The service-role client bypasses RLS
-- and the functions above entirely, so a later admin action or migration could
-- quietly reopen a completed inspection; a trigger is the only thing that
-- holds for every caller.
--
-- Only status changes are blocked. A completed row can still be soft-deleted
-- and its updated_at still moves, because neither undoes the completion.
create or replace function public.assert_inspection_completed_is_terminal()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'completed' and new.status is distinct from old.status then
    raise exception 'INSPECTION_COMPLETED_IS_TERMINAL'
      using errcode = '23514',
            detail = 'A completed inspection cannot return to any other status.';
  end if;

  if old.completed_at is not null
     and new.completed_at is distinct from old.completed_at then
    raise exception 'INSPECTION_COMPLETED_AT_IS_IMMUTABLE'
      using errcode = '23514',
            detail = 'When an inspection was marked complete is a fact, not a field.';
  end if;

  -- Write-once, not merely ungranted. The deadline goes null -> value at
  -- acceptance and never moves again: an extendable deadline is not a
  -- deadline, and the reason it is stored rather than derived is precisely
  -- that nothing should be able to move it afterwards.
  if old.completion_deadline is not null
     and new.completion_deadline is distinct from old.completion_deadline then
    raise exception 'INSPECTION_DEADLINE_IS_FIXED'
      using errcode = '23514',
            detail = 'A completion deadline is fixed at acceptance and cannot be moved.';
  end if;

  return new;
end;
$$;

create trigger inspection_requests_completed_is_terminal
before update on public.inspection_requests
for each row
execute function public.assert_inspection_completed_is_terminal();
