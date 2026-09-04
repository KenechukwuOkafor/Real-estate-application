-- ---------------------------------------------------------------------------
-- The agent's 48-hour deadline stops being something the seeker names.
--
-- create_inspection_request_with_chat has taken `expires_at timestamptz` as a
-- parameter since 0015. The function validates the listing, the self-request
-- and the one-active-request rule, and then writes whatever deadline it was
-- handed. That deadline is not the caller's to set: it is the window the
-- AGENT has to answer, and the caller is the seeker.
--
-- Nothing in the product exploits this, because the service always passed
-- now() + 48 hours. But the grant is `execute` to `authenticated`, and the
-- argument is part of the call. Anyone who can call the function can choose:
--
--   * a far-future deadline gives the agent unlimited time to respond, and
--     the request blocks that seeker from re-asking about the listing for as
--     long as it stays open (blocksNewRequest treats 'requested' inside its
--     window as live) — a self-inflicted lock-out, but a real one;
--   * a deadline already in the past creates a request that is expired the
--     instant it exists, so the agent's inbox never counts it as needing an
--     answer and the seeker's dashboard reads "No reply" against an agent who
--     was never given the chance to give one. That one defames.
--
-- 0030 made the same decision for the completion window without discussion:
-- complete_inspection_request computes `now() + interval '4 days'` inside the
-- function because a deadline is enforcement, and enforcement does not accept
-- its own terms from the party it constrains. This applies that to the window
-- that came first.
--
-- THE OLD SIGNATURE IS DROPPED, NOT LEFT BESIDE THE NEW ONE. A three-argument
-- overload kept "for compatibility" is the hole, still callable, with a
-- comment above it explaining that nobody should. There is one caller and it
-- is in this repository.
-- ---------------------------------------------------------------------------

drop function if exists public.create_inspection_request_with_chat(uuid, text, timestamptz);

create or replace function public.create_inspection_request_with_chat(
  target_listing_id uuid,
  request_message text
)
returns table (inspection_request_id uuid, chat_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_user_id uuid;
  listing_agent_profile_id uuid;
  listing_owner_user_id uuid;
  new_request_id uuid;
  new_chat_id uuid;
begin
  caller_user_id := public.current_app_user_id();

  if caller_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  -- Only approved, live listings are inspectable.
  select l.agent_profile_id, ap.user_id
    into listing_agent_profile_id, listing_owner_user_id
  from public.listings l
  join public.agent_profiles ap on ap.id = l.agent_profile_id
  where l.id = target_listing_id
    and l.deleted_at is null
    and l.status = 'approved';

  if listing_agent_profile_id is null then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if listing_owner_user_id = caller_user_id then
    raise exception 'INSPECTION_SELF_REQUEST' using errcode = 'P0001';
  end if;

  -- One active request per seeker per listing.
  if exists (
    select 1
    from public.inspection_requests ir
    where ir.listing_id = target_listing_id
      and ir.requester_user_id = caller_user_id
      and ir.status in ('requested', 'accepted')
      and ir.deleted_at is null
  ) then
    raise exception 'INSPECTION_ALREADY_ACTIVE' using errcode = '23505';
  end if;

  insert into public.inspection_requests (
    agent_profile_id, expires_at, listing_id, message, requester_user_id
  )
  values (
    listing_agent_profile_id,
    -- 48 hours, computed here, where it is enforced. The seeker no longer has
    -- an opinion about how long the agent has.
    now() + interval '48 hours',
    target_listing_id,
    request_message,
    caller_user_id
  )
  returning id into new_request_id;

  insert into public.chats (
    agent_profile_id, inspection_request_id, listing_id, student_user_id, type
  )
  values (
    listing_agent_profile_id,
    new_request_id,
    target_listing_id,
    caller_user_id,
    'inspection'
  )
  returning id into new_chat_id;

  update public.inspection_requests
     set chat_id = new_chat_id
   where id = new_request_id;

  return query select new_request_id, new_chat_id;
end;
$$;

comment on function public.create_inspection_request_with_chat(uuid, text) is
  'Creates an inspection request, its chat and the backlink atomically. SECURITY DEFINER: chats have no INSERT policy because they belong to both parties. The 48-hour response window is computed here and is not an argument — see 0031.';

revoke all on function public.create_inspection_request_with_chat(uuid, text) from public;
grant execute on function public.create_inspection_request_with_chat(uuid, text) to authenticated;
