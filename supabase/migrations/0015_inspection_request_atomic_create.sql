-- Atomic creation of an inspection request and its conversation.
--
-- requestInspection wrote three rows with no transaction: the request, the
-- chat, and the backlink from request to chat. A failure between them stranded
-- a request with no conversation — a seeker who can never talk to the agent,
-- and an agent who sees a request with no thread. That risk is why creation
-- stayed on the service-role client when the rest of group 3 migrated.
--
-- Wrapping the three writes in a function makes them one statement, which
-- Postgres runs in a single implicit transaction. All three land or none do,
-- and the escalation becomes this function rather than a service-role client
-- that can touch every table.
--
-- SECURITY DEFINER because chats deliberately has no INSERT policy: a chat
-- belongs to both parties, so the seeker's own credentials are the wrong
-- authority to create one. The function re-validates everything the service
-- layer checks, so the escalation is narrow and the rules live in one place
-- that is auditable as SQL.
create or replace function public.create_inspection_request_with_chat(
  target_listing_id uuid,
  request_message text,
  expires_at timestamptz
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
    create_inspection_request_with_chat.expires_at,
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

comment on function public.create_inspection_request_with_chat(uuid, text, timestamptz) is
  'Creates an inspection request, its chat and the backlink atomically. SECURITY DEFINER: chats have no INSERT policy because they belong to both parties.';

grant execute on function public.create_inspection_request_with_chat(uuid, text, timestamptz)
  to authenticated;
