-- ---------------------------------------------------------------------------
-- Everything 'rented' means, now that 0035 has committed the value.
--
-- Read 0035 first for why this is a separate file. The short version: the
-- fingerprint index below evaluates 'rented' directly, and Postgres refuses
-- that in the transaction that added it.
--
-- ===========================================================================
-- THE STATE MACHINE THIS ADDS
-- ===========================================================================
--
--   approved  <-->  rented        both directions, by the agent, no review
--   approved   ->   archived      one direction, by the agent, terminal
--   rented     ->   archived      NOT offered. See below.
--
-- ===========================================================================
-- WHY GOING BACK TO 'approved' NEEDS NO RE-REVIEW, AND THE ONE THING THAT
-- MAKES THAT TRUE
-- ===========================================================================
--
-- The promise this product sells is that a moderator reviewed what a seeker
-- sees. Returning a listing to 'approved' without review looks like breaking
-- it, and would be, except for one fact: NOTHING CHANGED WHILE IT WAS RENTED.
-- The content a moderator approved is the content that goes back up.
--
-- That fact is not a wish. It holds because 'rented' is absent from two lists:
--
--   1. the agents_update_own_listings policy (0021), which permits UPDATE on
--      listings only where status in ('draft','rejected'); and
--   2. EDITABLE_LISTING_STATUSES in src/features/listings/editability.ts,
--      which the edit page, the listings page and the write guard all import.
--
-- Neither is touched by this migration. A rented listing is uneditable for
-- exactly the same reason an approved one is, and by exactly the same
-- mechanism.
--
-- THIS IS THE FRAGILE PART OF THE DESIGN AND IT IS FRAGILE IN A SPECIFIC WAY:
-- it is secured by an ABSENCE, and an absence is invisible in review. Nobody
-- reading either list notices a status that is not in it. The obvious future
-- convenience — "agents keep asking to fix a typo while a place is let, just
-- add 'rented' to EDITABLE_LISTING_STATUSES" — is a one-word change that turns
-- the flip back to approved into a publication of unreviewed content, and no
-- reviewer would see it.
--
-- So it is tested by attempt rather than by reading, in
-- src/server/repositories/listing-rented-integration.test.ts, which PATCHes
-- every content column of a rented listing through PostgREST as its owning
-- agent and requires all of them to be refused. That probe is the only thing
-- that will object to the convenience.
--
-- The editing path that DOES stay open is the right one: submit_listing_revision
-- is widened below, so a rented listing is corrected the same way an approved
-- one is — proposed, reviewed, then applied.
--
-- ===========================================================================
-- WHAT DOES NOT CHANGE, AND WAS CHECKED RATHER THAN ASSUMED
-- ===========================================================================
--
-- SLOTS. free_listing_quota is decremented at submission and nothing anywhere
-- reads listings.status to decide entitlement. Marking a listing taken is not
-- a submission, and marking it available again is not one either. No movement
-- in either direction, which is the entire point of separating this from
-- archived.
--
-- NEW INSPECTION REQUESTS ARE BLOCKED, with no change here.
-- create_inspection_request_atomic (0031) selects the listing
-- `and l.status = 'approved'`, so a rented listing raises LISTING_NOT_FOUND
-- on request. Correct: it is not in the feed, so nobody should be arranging
-- to see it.
--
-- EXISTING INSPECTIONS SURVIVE, also with no change here. Every place that
-- gates on listings.status was enumerated before this was written, and the
-- inspection lifecycle appears in none of them: the RLS policies on
-- inspection_requests (0012), chats and messages (0009), the read-time lapse
-- evaluation (0031) and completion (0030) all key on the request and its
-- participants, never on the listing's status. The seeker with an accepted
-- inspection may well be the person who rented it; they keep their chat.
--
-- ===========================================================================
-- WHY rented -> archived IS NOT OFFERED
-- ===========================================================================
--
-- It is a reasonable thing to want: a property is let, and then the agent
-- stops handling it entirely. But archive_own_listing accepts only 'approved',
-- and widening it here would be widening the one transition that cannot be
-- undone, for a case nobody has reported. The path exists already and costs
-- one extra click: mark it available, then remove it. Left deliberately
-- narrow — this is a list of accepted statuses, not an architecture, and it
-- can move the day somebody actually asks.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------- rented_at

alter table public.listings add column rented_at timestamptz;

comment on column public.listings.rented_at is
  'When this listing was marked taken. Null unless it is currently rented — cleared when it goes back on the market, because it records the CURRENT let and not a history of them. See 0036.';

-- No backfill, and no trigger dance of the kind 0034 needed. Nothing has ever
-- been rented, because until 0035 the status did not exist, so every row's
-- correct value is null and the UPDATE that would have queued deferred
-- constraint trigger events is not written at all.

-- ------------------------------------------------------------- fingerprint
--
-- listings_duplicate_fingerprint_active_idx (0001) stops one property being
-- listed twice at once. Its WHERE clause names the statuses in which a listing
-- HOLDS its property's identity, and 'rented' belongs there.
--
-- The alternative was to let rented drop out of the index, matching archived.
-- That is wrong because archived and rented differ in exactly the respect the
-- index cares about: an archived listing is never coming back, so its property
-- is free to be listed afresh, while a rented listing IS coming back and its
-- property is not free. Leaving rented out would allow this:
--
--   day 1   mark A rented
--   day 2   submit B for the same property        -- allowed
--   day 3   mark A available again
--           ERROR: duplicate key value violates unique constraint
--                  "listings_duplicate_fingerprint_active_idx"
--
-- The refusal would land on day 3, on the agent who did nothing wrong that
-- day, for a reason produced on day 2. With rented in the index the refusal
-- lands at submission on day 2, where the agent is doing the thing being
-- refused and can be told the useful sentence: you already have this listing,
-- mark it available.
drop index if exists public.listings_duplicate_fingerprint_active_idx;

create unique index listings_duplicate_fingerprint_active_idx
  on public.listings (duplicate_fingerprint)
  where status in ('pending_review', 'approved', 'rented', 'flagged', 'under_dispute')
    and deleted_at is null
    and duplicate_fingerprint is not null;

-- ----------------------------------------------------------- the two moves

/*
 * Take a live listing off the market.
 *
 * SECURITY DEFINER for the reason archive_own_listing is: listings.status is
 * deliberately not granted to agents, so a status change is a request for the
 * system to act rather than a column an agent writes. Same shape throughout —
 * resolve the caller, refuse an anonymous one, treat "not yours" as not found.
 */
create or replace function public.mark_own_listing_rented(target_listing_id uuid)
returns table (listing_id uuid, rented_at timestamptz)
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

  if listing_owner is null
     or listing_owner is distinct from caller_profile
     or listing_deleted is not null then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Only from approved. A draft was never on the market, a listing in review
  -- is not on it yet, and a flagged or disputed listing must not be movable by
  -- the agent under investigation — the same reasoning archive_own_listing
  -- records, for the same reason.
  if listing_status <> 'approved' then
    raise exception 'LISTING_STATE_TRANSITION_INVALID' using errcode = '22023';
  end if;

  stamped := now();

  update public.listings
     set status = 'rented',
         rented_at = stamped
   where id = target_listing_id;

  return query select target_listing_id, stamped;
end;
$$;

comment on function public.mark_own_listing_rented(uuid) is
  'Agent takes their own live listing off the market. Reversible by mark_own_listing_available — unlike archive_own_listing, which is terminal. Consumes no submission slot and leaves existing inspections alone. See 0036.';

/*
 * Put it back.
 *
 * approved_at is deliberately NOT restamped. It records when a moderator
 * approved this content, and no moderator did anything today — the content is
 * the same content, which is the fact that makes this transition legitimate at
 * all. Restamping it would also reorder the dashboard activity feed, which
 * reads approved_at, and announce an approval that did not happen.
 *
 * rented_at IS cleared, because it names the current let and there is no
 * longer one. A history of lets would be a different object with a different
 * shape, and inventing it as a single nullable column would get it wrong.
 */
create or replace function public.mark_own_listing_available(target_listing_id uuid)
returns table (listing_id uuid, approved_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_profile uuid;
  listing_owner uuid;
  listing_status text;
  listing_deleted timestamptz;
  listing_approved_at timestamptz;
begin
  caller_profile := public.current_agent_profile_id();

  if caller_profile is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  select l.agent_profile_id, l.status::text, l.deleted_at, l.approved_at
    into listing_owner, listing_status, listing_deleted, listing_approved_at
  from public.listings l
  where l.id = target_listing_id;

  if listing_owner is null
     or listing_owner is distinct from caller_profile
     or listing_deleted is not null then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Only from rented. Notably this refuses 'archived' — and so does the
  -- listings_archived_is_terminal trigger from 0022, which would refuse the
  -- UPDATE below even if this check were removed. Two refusals for one
  -- transition is deliberate: this one produces the error an agent can read,
  -- and the trigger is what makes terminal mean terminal for every caller
  -- including service_role.
  if listing_status <> 'rented' then
    raise exception 'LISTING_STATE_TRANSITION_INVALID' using errcode = '22023';
  end if;

  update public.listings
     set status = 'approved',
         rented_at = null
   where id = target_listing_id;

  return query select target_listing_id, listing_approved_at;
end;
$$;

comment on function public.mark_own_listing_available(uuid) is
  'Agent puts their own rented listing back on the market. No re-review, because nothing changed while it was off — an invariant held by rented being absent from the agents_update_own_listings policy and from EDITABLE_LISTING_STATUSES. See 0036.';

revoke all on function public.mark_own_listing_rented(uuid) from public, anon;
revoke all on function public.mark_own_listing_available(uuid) from public, anon;
grant execute on function public.mark_own_listing_rented(uuid) to authenticated;
grant execute on function public.mark_own_listing_available(uuid) to authenticated;

-- ------------------------------------------- correcting a rented listing
--
-- The only editing path a rented listing has, and it is the same one an
-- approved listing has: propose, review, apply. Widened here from
-- `status <> 'approved'` to a two-status check.
--
-- Everything else about the function is 0023's, unchanged and reproduced
-- because `create or replace` cannot amend one line in place. The pending-per-
-- listing rule, the sublet normalisation and the qualified RETURNING all
-- carry their original reasoning; read 0023 for it.
--
-- apply_listing_revision needs no change: it has no status guard, so it writes
-- the approved content onto the listing and leaves the listing's own status
-- alone. A revision applied to a rented listing keeps it rented, which is
-- right — approving a correction is not a decision to put the property back on
-- the market, and only the agent knows whether it is free.
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
  'Queue a change to an approved or rented listing for moderation. The listing keeps its current values, and its current status, until the revision is applied.';

-- ---------------------------------------------- the cover, while off-market
--
-- BR-MEDIA-006 says a live listing has a cover image. Both halves of its
-- enforcement (0016) ask `status = 'approved'`, which would stop asking the
-- moment a listing went rented.
--
-- Nothing can currently exploit that. remove_listing_image refuses anything
-- that is not a draft or a rejection, and the listing_images UPDATE policy
-- (0021) permits those two statuses only, so a rented listing's images are
-- unreachable by every write path an agent has.
--
-- Widened anyway, because that is the argument these two triggers exist to
-- stop accepting. 0016 wrote the second one specifically so the invariant did
-- not depend on the listings table being the only way in, and "contained by
-- something else" is the reasoning 0029 was written to retire. A rented
-- listing goes back on the market with one function call and no review; it
-- must not be able to arrive there without a cover.
create or replace function public.assert_active_listing_has_cover()
returns trigger
language plpgsql
as $$
declare
  live_status text;
  live_cover uuid;
  live_deleted timestamptz;
begin
  -- Re-read the row rather than trusting NEW: this trigger is DEFERRABLE
  -- INITIALLY DEFERRED and fires at COMMIT carrying the NEW snapshot from when
  -- the statement ran, so a cover set by a later UPDATE in the same
  -- transaction would still read as null. 0016 has the full account.
  select l.status::text, l.cover_image_id, l.deleted_at
    into live_status, live_cover, live_deleted
  from public.listings l
  where l.id = new.id;

  if live_status is null then
    return new;
  end if;

  if live_status in ('approved', 'rented') and live_deleted is null then
    if live_cover is null then
      raise exception 'LISTING_COVER_REQUIRED'
        using errcode = '23514',
              detail = 'An approved or rented listing must have a cover image (BR-MEDIA-006).';
    end if;

    if not exists (
      select 1
      from public.listing_images li
      where li.id = live_cover
        and li.listing_id = new.id
        and li.deleted_at is null
    ) then
      raise exception 'LISTING_COVER_REQUIRED'
        using errcode = '23514',
              detail = 'The cover image must belong to this listing and not be deleted (BR-MEDIA-006).';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.assert_cover_not_removed_while_active()
returns trigger
language plpgsql
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if exists (
      select 1
      from public.listings l
      where l.cover_image_id = new.id
        and l.status in ('approved', 'rented')
        and l.deleted_at is null
    ) then
      raise exception 'LISTING_COVER_REQUIRED'
        using errcode = '23514',
              detail = 'Cannot remove the cover image of an approved or rented listing (BR-MEDIA-006).';
    end if;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------- honest absence
--
-- A seeker saved a listing, or was sent the link. The listing is now off the
-- market. Today they get notFound() — the same blank 404 as a typo'd URL, a
-- deleted draft, or a listing that never existed.
--
-- That is the "No reply" problem again. The system knows the answer and shows
-- nothing, so the seeker cannot tell "this is gone" from "I typed it wrong"
-- and the honest move is to say which.
--
-- ARCHIVED IS INCLUDED, not just rented, because the dead end is identical
-- from the seeker's side and the two sentences are genuinely different things
-- to tell them: a rented property may come back and is worth asking about, a
-- removed one is not. Collapsing them into one message would make one of the
-- two a lie.
--
-- ===========================================================================
-- WHY A FUNCTION AND NOT A WIDER POLICY
-- ===========================================================================
--
-- The obvious alternative is to widen public_can_read_approved_listings (0002)
-- to `status in ('approved','rented','archived')` and let the application's
-- own `.eq("status","approved")` keep the feed clean. Rejected, and 0021 is
-- the reason: THE PREDICATE BELONGS ON THE POLICY, NOT ON THE CALLER. There
-- are three query sites that filter status in listings-repository.ts today,
-- and a fourth written next year that forgets would put let and removed
-- properties back into search with nothing to stop it.
--
-- So the policy is untouched and this returns an aggregate of what a seeker
-- needs, the same shape 0033 used to give agents view counts without making
-- listing_views readable.
--
-- WHAT IT REPUBLISHES, deliberately kept to four columns: the reason, the
-- title, the area and the city. Enough to confirm "yes, this is the place you
-- saved, and it is gone" and to send them somewhere useful. Not the price, not
-- the description, not the photographs — an archived listing may have been
-- removed BECAUSE it was wrong, and a tombstone is a poor place to keep
-- serving a price nobody stands behind. The storage policy is left alone for
-- the same reason, so the page has no images to show and does not ask for any.
--
-- NO CALLER CHECK, which makes this the one SECURITY DEFINER function here
-- without one, so the omission is stated rather than left to look like an
-- oversight: every column it returns was public on this listing yesterday, and
-- it is reachable by anon by design — the seeker following a shared link has
-- no session. There is nothing to authorize.
create or replace function public.listing_absence_notice(target_public_uuid uuid)
returns table (absence_status text, title text, area text, city text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.status::text, l.title, l.area, l.city
  from public.listings l
  where l.public_uuid = target_public_uuid
    and l.deleted_at is null
    and l.status::text in ('rented', 'archived');
$$;

comment on function public.listing_absence_notice(uuid) is
  'Why a listing a seeker holds a link to is no longer there, and the least that identifies it. Rented and archived only — every other status yields nothing and stays a 404. See 0036.';

revoke all on function public.listing_absence_notice(uuid) from public;
grant execute on function public.listing_absence_notice(uuid) to anon, authenticated;
