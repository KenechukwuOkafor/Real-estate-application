-- ---------------------------------------------------------------------------
-- The seeker can say they cannot make it.
--
-- 'cancelled' and cancelled_at have existed since 0005 with no writer, and
-- SEEKER_STATUS_LABEL.cancelled has read "You cancelled this" for an action
-- nobody could take. 0030 turned that gap from cosmetic into harmful: a seeker
-- who accepts a visit and then cannot attend has no way to say so, so the row
-- LAPSES — recorded, and countable against an agent who did nothing wrong.
--
-- That corrupts the only signal 0030 set out to keep. A lapse is supposed to
-- mean "the agent went silent". Without this it also means "the seeker pulled
-- out and the platform had no word for it", and the two are indistinguishable
-- in exactly the count moderation was going to read.
--
-- CANCELLATION IS NOT A LAPSE, and needs no code to make that true: a lapse is
-- derived from status 'accepted', and a cancelled row is not accepted. It
-- leaves the accepted state, so it leaves the window. Stated here because it
-- is the property most worth not breaking later.
--
-- THE SEEKER ONLY, DELIBERATELY. An agent who accepted and cannot attend says
-- so in the chat; a one-tap withdrawal would weaken the commitment accepting
-- is meant to make, and would double as a way to clear a lapse on day four.
-- The cost is real and is recorded in adr-019-amendment-1: an honest agent who
-- withdraws still takes the same lapse an absent one does. That is a defect in
-- what the lapse COUNT can distinguish, not a missing button, and it becomes
-- worth fixing when something actually reads that count. Nothing does yet.
--
-- Same shape as 0030: status is governance, so this is a SECURITY DEFINER
-- function and no grant is widened. The caller is resolved as an app user
-- rather than an agent profile — this is the one inspection transition whose
-- actor is the seeker.
-- ---------------------------------------------------------------------------

create or replace function public.cancel_inspection_request(
  target_request_id uuid
)
returns table (inspection_request_id uuid, cancelled_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_user_id uuid;
  request_requester uuid;
  request_status text;
  request_deleted timestamptz;
  stamped timestamptz;
begin
  caller_user_id := public.current_app_user_id();

  if caller_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  select ir.requester_user_id, ir.status::text, ir.deleted_at
    into request_requester, request_status, request_deleted
  from public.inspection_requests ir
  where ir.id = target_request_id
  for update;

  -- Not yours and not there are one answer, as everywhere else here.
  if request_requester is null
     or request_requester is distinct from caller_user_id
     or request_deleted is not null then
    raise exception 'INSPECTION_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- From either live state. Cancelling something already answered with a
  -- refusal, already completed, or already cancelled is not a thing that
  -- happens; each of those is an ending.
  --
  -- Note what is NOT checked: a deadline. A seeker may withdraw from a request
  -- whose 48 hours have run out and from an inspection whose four days have
  -- passed. Both are already closed to everyone else, and saying "I could not
  -- make it" after the fact is still truer than the silence it replaces.
  if request_status not in ('requested', 'accepted') then
    raise exception 'INSPECTION_STATE_TRANSITION_INVALID'
      using errcode = '22023',
            detail = 'Only a request still open or an inspection not yet completed can be cancelled.';
  end if;

  stamped := now();

  -- completion_deadline is left as it stands rather than nulled. It is the
  -- record of what was promised, and a cancelled row is not evaluated against
  -- it — leaving the accepted state is what ends the window.
  update public.inspection_requests ir
     set status = 'cancelled',
         cancelled_at = stamped,
         updated_at = stamped
   where ir.id = target_request_id;

  return query select target_request_id, stamped;
end;
$$;

comment on function public.cancel_inspection_request(uuid) is
  'The requesting seeker withdraws an inspection they can no longer attend, from requested or accepted. SECURITY DEFINER because inspection_requests.status is deliberately not granted. Cancellation is not a lapse: a cancelled row is not accepted, so no completion window runs against it. Cancelled is terminal — see inspection_requests_completed_is_terminal. Agents have no equivalent, by decision — see 0032 and ADR-019-A1.';

revoke all on function public.cancel_inspection_request(uuid) from public;
grant execute on function public.cancel_inspection_request(uuid) to authenticated;

-- ----------------------------------------------- cancelled is the last word too
--
-- The trigger from 0030 made 'completed' terminal. 'cancelled' needs the same
-- guarantee and for the same reason: REB-DOM-004 says "Cancelled inspections
-- remain in history", which is only true if nothing can move a row back out of
-- it. Un-cancelling would also resurrect a completion window the seeker has
-- already stepped out of.
create or replace function public.assert_inspection_completed_is_terminal()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('completed', 'cancelled')
     and new.status is distinct from old.status then
    raise exception 'INSPECTION_COMPLETED_IS_TERMINAL'
      using errcode = '23514',
            detail = 'A completed or cancelled inspection cannot return to any other status.';
  end if;

  if old.completed_at is not null
     and new.completed_at is distinct from old.completed_at then
    raise exception 'INSPECTION_COMPLETED_AT_IS_IMMUTABLE'
      using errcode = '23514',
            detail = 'When an inspection was marked complete is a fact, not a field.';
  end if;

  if old.cancelled_at is not null
     and new.cancelled_at is distinct from old.cancelled_at then
    raise exception 'INSPECTION_CANCELLED_AT_IS_IMMUTABLE'
      using errcode = '23514',
            detail = 'When an inspection was cancelled is a fact, not a field.';
  end if;

  if old.completion_deadline is not null
     and new.completion_deadline is distinct from old.completion_deadline then
    raise exception 'INSPECTION_DEADLINE_IS_FIXED'
      using errcode = '23514',
            detail = 'A completion deadline is fixed at acceptance and cannot be moved.';
  end if;

  return new;
end;
$$;
