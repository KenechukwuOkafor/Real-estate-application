-- ---------------------------------------------------------------------------
-- Editing a live listing, without breaking the promise.
--
-- ADR-034 names edit-with-re-review as the answer to a wrong price on a live
-- listing, and until now there was none: post-approval mutation was closed in
-- 0021, so the only path was withdraw and relist, which costs a submission slot
-- to fix a typo.
--
-- The promise is that a moderator reviewed what a seeker sees. An edit that
-- went live unreviewed would break it in exactly the way the post-approval hole
-- did, so the edit is queued rather than applied.
--
-- ===========================================================================
-- DECISION 1: THE LISTING STAYS LIVE, AND THE PROPOSED VALUES WAIT HERE.
--
-- The alternative is to pull the listing from public view until the edit is
-- approved. That was rejected for three reasons, and the third is decisive.
--
-- It punishes correction: an agent loses visibility for as long as review takes,
-- as a consequence of fixing their own mistake. It breaks shared links, which
-- is how this product spreads — a seeker who was sent a listing finds nothing.
-- And it creates the incentive to LEAVE THE ERROR UP, which is the same failure
-- mode as charging for a correction. A wrong price that stays live because
-- fixing it is expensive is worse for everyone than a free, reviewed edit.
--
-- The cost is a place to hold proposed values, which is this table — and it is
-- not really a cost, because a moderator reviewing a change needs to see what
-- changed, and that requires holding the old and the new anyway.
--
-- The listing's own status does not move. It stays 'approved' and stays in
-- search. What enters the moderation queue is the REVISION, not the listing.
-- ===========================================================================
--
-- ===========================================================================
-- DECISION 2: A RE-REVIEW DOES NOT CONSUME A SLOT.
--
-- This cuts against the reasoning recorded in ADR-034, that a slot buys
-- moderator attention and a second review is real work — so it needs an answer
-- rather than a shrug.
--
-- Read the principle precisely: entitlement gates the moderation queue against
-- unbounded NEW INVENTORY. A revision is not new inventory. It is the same
-- listing, already paid for, being corrected. Charging again would mean the
-- platform charges twice for one listing's existence.
--
-- And the incentive analysis settles it. Charging for a correction makes an
-- agent leave a wrong price live, and that cost lands on seekers and on the
-- trust the product sells. A marginal moderator minute is cheaper than a lie in
-- the marketplace.
--
-- The churn objection is real and is answered WITHOUT a slot: at most one
-- pending revision per listing, enforced by a partial unique index below. An
-- agent with N approved listings can queue at most N revisions, which is a hard
-- bound on review volume. Rate is the right instrument for a rate problem;
-- entitlement is the wrong one.
-- ===========================================================================
--
-- ===========================================================================
-- DECISION 3: THE TERMS AND THE DESCRIPTION MAY CHANGE. THE IDENTITY MAY NOT.
--
-- Editable here: title, description, price_naira, amenities, rental_duration
-- and sublet_months. These are how the offer is described and on what terms.
--
-- Deliberately absent: property_type, bedrooms, bathrooms, area, city, state,
-- latitude, longitude, slug.
--
-- The line is not "important versus unimportant", it is WHAT A SEEKER SEARCHED
-- ON. Property type, room counts and area are filter dimensions: a listing
-- found under "2 bedroom in Odenigbo" that becomes "shop in Hilltop" makes the
-- search result that led them there retrospectively false, and a saved listing
-- silently becomes a different property. Re-review does not fix that, because
-- the seeker is not the one reviewing.
--
-- slug is excluded for a different reason: it is the public URL. Changing it
-- breaks every link already shared, which is the mechanism this product spreads
-- by.
--
-- Those changes mean it is a different listing, and creating one is the honest
-- path — that one does cost a slot, correctly, because it is new inventory.
--
-- The cost accepted: a mistyped bedroom count cannot be corrected in place. If
-- that turns out to be common the line can move, because this is a list of
-- columns and not an architecture.
-- ===========================================================================

create type public.listing_revision_status as enum (
  'pending_review',
  'approved',
  'rejected'
);

create table public.listing_revisions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  status public.listing_revision_status not null default 'pending_review',

  -- The proposed values. Typed columns rather than a jsonb blob, so the same
  -- constraints that guard a listing guard a proposal: a revision that could
  -- not be applied should be impossible to store, not discovered at apply time.
  title text not null,
  description text not null,
  price_naira bigint not null check (price_naira > 0),
  amenities jsonb not null default '[]'::jsonb,
  rental_duration public.rental_duration not null,
  sublet_months integer,

  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (char_length(trim(title)) > 0),
  check (char_length(trim(description)) > 0),

  -- The same pairing 0019 enforces on listings. Without it a revision could
  -- hold a shape the listings table would refuse, and the failure would land on
  -- the moderator's approval rather than on the agent who proposed it.
  constraint listing_revisions_sublet_months_matches_duration
    check (
      (rental_duration = 'sublet' and sublet_months is not null)
      or (rental_duration <> 'sublet' and sublet_months is null)
    ),
  constraint listing_revisions_sublet_months_positive
    check (sublet_months is null or sublet_months > 0)
);

-- DECISION 2's bound, as a constraint rather than a convention. One pending
-- revision per listing means an agent cannot queue work faster than a moderator
-- clears it, and it makes "you already have a change waiting" a state the
-- database knows rather than a race between two submissions.
create unique index listing_revisions_one_pending_per_listing
  on public.listing_revisions (listing_id)
  where status = 'pending_review';

create index listing_revisions_status_submitted_idx
  on public.listing_revisions (status, submitted_at);

create trigger set_listing_revisions_updated_at
before update on public.listing_revisions
for each row
execute function public.set_updated_at();

comment on table public.listing_revisions is
  'Proposed changes to an approved listing, awaiting moderation. The listing stays live with its approved values until a revision is applied — see 0023.';

-- ---------------------------------------------------------------------- RLS

alter table public.listing_revisions enable row level security;

-- An agent reads their own revisions, to see that one is pending and why one
-- was rejected. Nothing more: every write goes through a function.
grant select on public.listing_revisions to authenticated;

create policy "agents_read_own_listing_revisions"
on public.listing_revisions
for select
to authenticated
using (
  exists (
    select 1
    from public.listings l
    where l.id = listing_revisions.listing_id
      and l.agent_profile_id = public.current_agent_profile_id()
  )
);

-- Deliberately no INSERT, UPDATE or DELETE grant to authenticated. Submitting a
-- revision is escalated into the function below, exactly as removal and
-- withdrawal are, so that "which listing, in which state" cannot be bypassed by
-- writing the row directly.

-- ---------------------------------------------------------------- functions

/*
 * Propose a change to a live listing.
 *
 * SECURITY DEFINER for the same reason archive_own_listing is: listings.status
 * is not granted and neither is this table's write path. The escalation is the
 * function, and it validates ownership and state rather than trusting a caller.
 */
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

  -- Only a live listing. A draft is edited directly, a listing in review is
  -- already in front of a moderator, and a FLAGGED listing is deliberately
  -- excluded: flagging exists to freeze something under investigation, and an
  -- agent revising the description while it is examined is the evidence moving.
  if listing_status <> 'approved' then
    raise exception 'LISTING_STATE_TRANSITION_INVALID' using errcode = '22023';
  end if;

  -- Checked here as well as by the unique index, so the common case is a
  -- named refusal rather than a constraint violation the caller has to decode.
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
    -- Normalised rather than trusted, matching the listings write path: the
    -- CHECK refuses a month count on anything that is not a sublet.
    case when new_rental_duration = 'sublet' then new_sublet_months else null end,
    new_title
  )
  -- Qualified. `submitted_at` is also the name of an OUT column on this
  -- function's RETURNS TABLE, and an unqualified reference is ambiguous
  -- (SQLSTATE 42702) rather than merely unclear.
  returning listing_revisions.id, listing_revisions.submitted_at
    into created_id, created_at_value;

  return query select created_id, created_at_value;
end;
$$;

comment on function public.submit_listing_revision(uuid, text, text, bigint, jsonb, public.rental_duration, integer) is
  'Queue a change to an approved listing for moderation. The listing stays live with its current values until the revision is applied.';

revoke all on function public.submit_listing_revision(uuid, text, text, bigint, jsonb, public.rental_duration, integer) from public;
grant execute on function public.submit_listing_revision(uuid, text, text, bigint, jsonb, public.rental_duration, integer) to authenticated;

/*
 * Apply an approved revision to its listing.
 *
 * One statement, because two writes without a transaction can leave a revision
 * marked approved over a listing that never received it — the agent is told the
 * change is live and a seeker sees the old price. That is precisely the class
 * of failure 0015 wrapped a function around.
 *
 * The reviewer is a parameter rather than current_app_user_id(), because this
 * runs on the service-role client, which carries no JWT to read an identity
 * from. admin-service already knows who is acting.
 */
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
  'Apply a pending revision to its listing and mark it approved, in one statement.';

revoke all on function public.apply_listing_revision(uuid, uuid) from public;
grant execute on function public.apply_listing_revision(uuid, uuid) to service_role;

/*
 * Refuse a revision. The listing keeps the values a moderator already approved.
 */
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

revoke all on function public.reject_listing_revision(uuid, uuid, text) from public;
grant execute on function public.reject_listing_revision(uuid, uuid, text) to service_role;

-- ------------------------------------- the grant nobody chose, on every table
--
-- Found while checking what this table actually granted. `authenticated` and
-- `anon` hold TRUNCATE, REFERENCES and TRIGGER on it — none of which were
-- granted here.
--
-- They come from Supabase's bootstrap default privileges for the `postgres`
-- role. 0010 revoked everything from anon and authenticated on the tables that
-- existed AT THAT MOMENT, and default privileges are why that revoke did not
-- stay true: every table created since has arrived carrying them. Three do
-- today — jobs, verification_documents, and this one.
--
-- TRUNCATE is the one that matters, because ROW LEVEL SECURITY DOES NOT APPLY
-- TO IT. A caller holding TRUNCATE on public.jobs empties the queue regardless
-- of any policy, and no policy would have been consulted.
--
-- NOT CURRENTLY REACHABLE, and this is a hardening rather than an incident:
-- PostgREST exposes GET, POST, PATCH and DELETE on tables and POST on rpc, and
-- there is no TRUNCATE verb among them, so a client holding the anon key has no
-- way to issue one. It becomes reachable the moment anything else can — a
-- direct connection, a future RPC that truncates, a tool that reuses the role.
-- Fixing the grant is cheaper than remembering the constraint.
--
-- Both halves: the tables that already inherited it, and the default so no
-- future table does. anon and authenticated are client roles — they have no use
-- for TRUNCATE, REFERENCES or TRIGGER on anything.

revoke truncate, references, trigger on all tables in schema public
  from anon, authenticated;

alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
