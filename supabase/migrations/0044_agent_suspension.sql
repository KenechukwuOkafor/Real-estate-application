-- ---------------------------------------------------------------------------
-- Suspension: applied, lifted and explained. ADR-017-A1.
--
-- Until this migration nothing wrote verification_status = 'suspended' or
-- suspension_reason. A suspension could only be made by editing the database by
-- hand, could not be undone except the same way, and was never explained to the
-- agent. This adds:
--
--   suspend_agent(target, moderator, reason)  verified  -> suspended
--   reinstate_agent(target, moderator)        suspended -> verified
--   own_agent_suspension_reason()             the agent's own reason, and only theirs
--
-- and closes the one gap in what suspension already did: a suspended agent could
-- still push revisions into the moderation queue.
--
-- WHAT SUSPENSION DOES NOT TOUCH, deliberately (ADR-017-A1): conversations,
-- inspections already requested or accepted, withdrawing a listing, marking one
-- rented or available, drafts. Seekers mid-conversation have done nothing wrong,
-- and suspension is a moderation action against the agent, not against them.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- suspend_agent / reinstate_agent
-- ===========================================================================
--
-- Governance writes, so SECURITY DEFINER functions rather than a widened
-- policy (ADR-010-A1): verification_status and suspension_reason are not
-- columns any client role may update, and that does not change here.
--
-- The caller check is assert_caller_moderates, the same gate apply_listing_revision
-- uses: the caller must be service_role or an admin, and the moderator named for
-- the record must hold the admin role. That inherits the known residual recorded
-- in ADR-010-A1 for reviewer_user_id — the moderator is an argument, checked to
-- be AN admin but not proven to be THE caller — and does not widen it.
--
-- A reason is required and never substituted. The agent reads it as written
-- (own_agent_suspension_reason below), which is the same rule reject, flag and
-- dispute now follow in admin-service.

create or replace function public.suspend_agent(
  target_agent_profile_id uuid,
  moderator_user_id uuid,
  reason text
)
returns table (agent_profile_id uuid, suspension_reason text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  trimmed text := btrim(coalesce(reason, ''));
  current_status text;
begin
  perform public.assert_caller_moderates(moderator_user_id);

  if trimmed = '' then
    raise exception 'MODERATION_REASON_REQUIRED' using errcode = '22023';
  end if;

  select ap.verification_status::text
    into current_status
  from public.agent_profiles ap
  where ap.id = target_agent_profile_id
    and ap.deleted_at is null
  for update;

  if current_status is null then
    raise exception 'AGENT_PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Only a verified agent can be suspended. An agent who was never verified is
  -- already invisible and already unable to submit; refusing their
  -- verification is the action for them, and suspending would only hide that.
  if current_status <> 'verified' then
    raise exception 'VERIFICATION_STATE_TRANSITION_INVALID' using errcode = '22023';
  end if;

  update public.agent_profiles ap
     set verification_status = 'suspended',
         suspension_reason = trimmed
   where ap.id = target_agent_profile_id;

  return query select target_agent_profile_id, trimmed;
end;
$$;

comment on function public.suspend_agent(uuid, uuid, text) is
  'Suspend a verified agent with a reason they will read. Hides them from seekers and blocks submissions; conversations and inspections continue. Service role or admin only. See ADR-017-A1.';

create or replace function public.reinstate_agent(
  target_agent_profile_id uuid,
  moderator_user_id uuid
)
returns table (agent_profile_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_status text;
begin
  perform public.assert_caller_moderates(moderator_user_id);

  select ap.verification_status::text
    into current_status
  from public.agent_profiles ap
  where ap.id = target_agent_profile_id
    and ap.deleted_at is null
  for update;

  if current_status is null then
    raise exception 'AGENT_PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if current_status <> 'suspended' then
    raise exception 'VERIFICATION_STATE_TRANSITION_INVALID' using errcode = '22023';
  end if;

  -- Back to verified, not pending_review. A suspension is a moderation
  -- judgement, not a finding that the identity documents were wrong, and
  -- re-review would make lifting it depend on the agent re-uploading documents
  -- nobody doubts. The reason is cleared: it described a state that has ended.
  update public.agent_profiles ap
     set verification_status = 'verified',
         suspension_reason = null
   where ap.id = target_agent_profile_id;

  return query select target_agent_profile_id;
end;
$$;

comment on function public.reinstate_agent(uuid, uuid) is
  'Lift a suspension: back to verified, reason cleared. Service role or admin only. See ADR-017-A1.';

-- No client role. Granted to service_role explicitly rather than left to a
-- default ACL — 0029 is the record of what defaults did here — and revoked from
-- anon and authenticated by name, because REVOKE ... FROM PUBLIC does not reach
-- a direct grant (ADR-010-A1).
revoke all on function public.suspend_agent(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reinstate_agent(uuid, uuid) from public, anon, authenticated;
grant execute on function public.suspend_agent(uuid, uuid, text) to service_role;
grant execute on function public.reinstate_agent(uuid, uuid) to service_role;

-- ===========================================================================
-- own_agent_suspension_reason
-- ===========================================================================
--
-- A function, not a column grant, for the reason own_agent_rejection_reason is
-- (0027): the grant that let an agent read their own suspension_reason would let
-- any signed-in user read every agent's. This answers for the caller only, and
-- only while they are suspended — a stale reason on a reinstated profile is not
-- something to show, though reinstate_agent clears it anyway.

create or replace function public.own_agent_suspension_reason()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ap.suspension_reason
  from public.agent_profiles ap
  where ap.user_id = public.current_app_user_id()
    and ap.deleted_at is null
    and ap.verification_status = 'suspended'
  limit 1;
$$;

comment on function public.own_agent_suspension_reason() is
  'The calling agent''s own suspension reason, while suspended. Never another agent''s. See 0044 and 0027.';

revoke all on function public.own_agent_suspension_reason() from public, anon;
grant execute on function public.own_agent_suspension_reason() to authenticated;

-- ===========================================================================
-- submit_listing_revision: a suspended agent may not feed the moderation queue
-- ===========================================================================
--
-- The gap ADR-017-A1 closes. Entitlement already stopped a suspended agent
-- submitting a LISTING for review; nothing stopped a revision, so a hidden agent
-- could keep putting new content in front of moderators, and from there back in
-- front of seekers.
--
-- 'suspended' specifically, not "anything but verified". In production the only
-- non-verified status that can hold an approved or rented listing is suspended —
-- verified moves only to suspended — so the narrower test is the exact one. The
-- broader one would also have refused fixtures that model an unverified owner,
-- which is a state production cannot reach and not one to design around.
--
-- Body otherwise identical to 0036; signature unchanged, so the grants from 0029
-- carry over untouched.

create or replace function public.submit_listing_revision(
  target_listing_id uuid,
  new_title text,
  new_description text,
  new_price_naira bigint,
  new_amenities jsonb,
  new_rental_duration public.rental_duration,
  new_sublet_months integer
)
returns table (revision_id uuid, submitted_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_profile uuid;
  caller_status text;
  listing_owner uuid;
  listing_status text;
  listing_deleted timestamptz;
  created_id uuid;
  created_at_value timestamptz;
begin
  caller_profile := public.current_agent_profile_id();

  if caller_profile is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  select ap.verification_status::text
    into caller_status
  from public.agent_profiles ap
  where ap.id = caller_profile;

  if caller_status = 'suspended' then
    raise exception 'AGENT_SUSPENDED' using errcode = '42501';
  end if;

  select l.agent_profile_id, l.status::text, l.deleted_at
    into listing_owner, listing_status, listing_deleted
  from public.listings l
  where l.id = target_listing_id;

  if listing_owner is null
     or listing_owner is distinct from caller_profile
     or listing_deleted is not null then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- A listing that has been reviewed and is not under investigation. Approved
  -- and rented are the two, and they are the same case wearing different hats:
  -- content a moderator signed off, which the agent may not overwrite in
  -- place. A draft is edited directly, a listing in review is already in front
  -- of a moderator, and a FLAGGED listing is deliberately excluded — flagging
  -- exists to freeze something under investigation, and an agent revising the
  -- description while it is examined is the evidence moving.
  --
  -- Comparing against a text literal, not a listing_status one: listing_status
  -- is declared text and l.status is cast into it above. That is what lets
  -- 'rented' appear in this migration at all — see 0035.
  if listing_status not in ('approved', 'rented') then
    raise exception 'LISTING_STATE_TRANSITION_INVALID' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.listing_revisions r
    where r.listing_id = target_listing_id
      and r.status = 'pending_review'
  ) then
    raise exception 'LISTING_REVISION_ALREADY_PENDING' using errcode = '23505';
  end if;

  insert into public.listing_revisions (
    amenities, description, listing_id, price_naira,
    rental_duration, sublet_months, title
  )
  values (
    coalesce(new_amenities, '[]'::jsonb), new_description, target_listing_id,
    new_price_naira, new_rental_duration,
    case when new_rental_duration = 'sublet' then new_sublet_months else null end,
    new_title
  )
  returning listing_revisions.id, listing_revisions.submitted_at
    into created_id, created_at_value;

  return query select created_id, created_at_value;
end;
$$;

comment on function public.submit_listing_revision(uuid, text, text, bigint, jsonb, public.rental_duration, integer) is
  'Queue a change to an approved or rented listing for moderation. The listing keeps its current values, and its current status, until the revision is applied. Refused for a suspended agent (0044, ADR-017-A1).';
