-- ---------------------------------------------------------------------------
-- Agent-initiated withdrawal.
--
-- Closing post-approval mutation in 0021 left an agent with a live listing and
-- no way to act on it at all: no edit, no unpublish, nothing. That was the
-- honest position — the previous "path" was reaching past the product into
-- PostgREST — but "no path" is not a resting place. This is the path.
--
-- approved -> archived, and archived is the end.
--
-- THE GRANT DECISION, EXPLICITLY. listings.status stays UNGRANTED. It is a
-- governance column in the strictest sense: the same UPDATE privilege that
-- would permit 'archived' would permit 'approved', and an agent who can write
-- their own status can publish without moderation. So this is a SECURITY
-- DEFINER function, the same shape as remove_listing_image in 0020 and
-- create_inspection_request_with_chat in 0015.
--
-- The function validates two things and nothing else: the caller owns the
-- listing, and it is currently approved. Withdrawal is not a moderation
-- decision and must not become one.
--
-- NO QUOTA REFUND, DELIBERATELY. A slot is consumed at SUBMISSION, not at
-- approval — it buys moderator attention, and by the time a listing can be
-- withdrawn that attention has already been spent. Refunding would return
-- payment for work that was performed. It would also make the slot a deposit
-- rather than a fee, so an agent could cycle listings indefinitely to keep
-- their inventory looking fresh while consuming unbounded review capacity.
-- Relisting is a new listing and a new submission, which is a second piece of
-- real moderator work, and it is charged accordingly.
--
-- The uncomfortable case this leaves — a wrong price on a live listing costing
-- a whole slot to correct — is real, and the answer to it is edit-with-
-- re-review, not a revolving slot. ADR-034 already says the allowance size is
-- configuration and a judgement with no evidence behind it; raising it is the
-- lever for that, not making it refundable.
-- ---------------------------------------------------------------------------

create or replace function public.archive_own_listing(target_listing_id uuid)
returns table (listing_id uuid, archived_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_profile uuid;
  listing_owner uuid;
  listing_status text;
  listing_deleted timestamptz;
  stamped timestamptz;
begin
  caller_profile := public.current_agent_profile_id();

  if caller_profile is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  select l.agent_profile_id, l.status::text, l.deleted_at
    into listing_owner, listing_status, listing_deleted
  from public.listings l
  where l.id = target_listing_id;

  -- Not yours reads as not found, matching every other ownership check here.
  if listing_owner is null
     or listing_owner is distinct from caller_profile
     or listing_deleted is not null then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Only from approved. A draft is deleted rather than withdrawn, a listing in
  -- review is withdrawn by the reviewer rejecting it, and a flagged or disputed
  -- listing must not be removable by the agent under investigation — that would
  -- let someone end an investigation by ending the thing being investigated.
  if listing_status <> 'approved' then
    raise exception 'LISTING_STATE_TRANSITION_INVALID' using errcode = '22023';
  end if;

  stamped := now();

  update public.listings
     set status = 'archived',
         archived_at = stamped
   where id = target_listing_id;

  return query select target_listing_id, stamped;
end;
$$;

comment on function public.archive_own_listing(uuid) is
  'Agent-initiated withdrawal of their own approved listing. SECURITY DEFINER because listings.status is deliberately not granted to agents. Archived is terminal — see listings_archived_is_terminal.';

revoke all on function public.archive_own_listing(uuid) from public;
grant execute on function public.archive_own_listing(uuid) to authenticated;

-- ------------------------------------------------- archived is the last word
--
-- The specification says archived -> published is invalid. That was true only
-- as an absence: agents cannot write status at all, and no admin action accepts
-- 'archived' as a source, so nothing in the application performed the
-- transition. Nothing FORBADE it either. The service-role client bypasses RLS
-- entirely, so any future admin action, script or migration could quietly move
-- a listing back out of archived and the only thing standing in the way would
-- be that nobody had written the line yet.
--
-- Terminal now means terminal for every caller, including service-role. A
-- listing whose life is over cannot be restarted; relisting is a new listing,
-- which is also what makes the "no quota refund" decision above coherent.
--
-- Only status changes are blocked. An archived row can still be soft-deleted,
-- and its updated_at still moves, because neither of those brings it back.
create or replace function public.assert_archived_is_terminal()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'archived' and new.status is distinct from old.status then
    raise exception 'LISTING_ARCHIVED_IS_TERMINAL'
      using errcode = '23514',
            detail = 'An archived listing cannot return to any other status. Relisting means creating a new listing.';
  end if;

  return new;
end;
$$;

create trigger listings_archived_is_terminal
before update on public.listings
for each row
execute function public.assert_archived_is_terminal();
