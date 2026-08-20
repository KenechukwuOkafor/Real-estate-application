-- ---------------------------------------------------------------------------
-- The duration model. Listings domain: rental frequency is required for
-- publication, and until now it did not exist as a column.
--
-- "per year" was hardcoded in src/features/listings/rent-period.ts, rendered on
-- every card, asserted by a test, and duplicated as the literal "Annual price"
-- on the detail page. The file said so itself: the first monthly listing would
-- have displayed incorrectly. The label was true only because nothing could
-- contradict it.
--
-- Three durations. `sublet` carries a month count; the other two do not.
-- ---------------------------------------------------------------------------

create type public.rental_duration as enum (
  'yearly',
  'monthly',
  'sublet'
);

comment on type public.rental_duration is
  'How long a listing is offered for. `sublet` is a fixed run of months and requires listings.sublet_months; the other two are recurring terms and forbid it.';

-- Every listing that exists today is implicitly a yearly rental: that is what
-- the hardcoded label claimed, and it was true because nothing could contradict
-- it. Backfilling to 'yearly' writes down the assumption already being made
-- rather than inventing a new one.
--
-- THE DEFAULT IS THE BACKFILL, AND IT IS DROPPED IMMEDIATELY. Do not "simplify"
-- this into a nullable column, an UPDATE, and a separate SET NOT NULL. That
-- form fails on any database that already has listings:
--
--   ERROR:  cannot ALTER TABLE "listings" because it has pending trigger events
--
-- The UPDATE queues the set_updated_at trigger, and SET NOT NULL cannot run in
-- the same transaction while those events are pending. Supabase applies each
-- migration in one transaction, so the two cannot be separated within this file.
--
-- CI WOULD NEVER CATCH THAT. The pipeline replays migrations into an empty
-- database, so the UPDATE touches zero rows, queues no triggers, and the broken
-- form passes every time — right up until the first `db push` against a
-- database that has real listings in it. Verified by hand against a populated
-- table, which is the only place the difference is observable.
--
-- Adding a NOT NULL column WITH a default is also a catalog-only operation in
-- PostgreSQL 11+, so it does not rewrite the table.
alter table public.listings
  add column rental_duration public.rental_duration not null default 'yearly',
  add column sublet_months integer;

-- DELIBERATELY NO DEFAULT FROM HERE ON.
--
-- Keeping 'yearly' as the default would be the same bug in a new location: an
-- insert that forgets the duration would silently become annual, which is
-- exactly how "per year" came to be true everywhere without anyone deciding it.
-- Dropping it makes an omission a loud failure at the boundary that omitted it,
-- so every insert site has to state the duration it means.
alter table public.listings
  alter column rental_duration drop default;

-- The month count is required if and only if the duration is sublet. Written as
-- the two directions rather than as a biconditional expression because the
-- error a developer sees should name which half they violated, and because this
-- reads the way the rule is spoken.
alter table public.listings
  add constraint listings_sublet_months_matches_duration
    check (
      (rental_duration = 'sublet' and sublet_months is not null)
      or (rental_duration <> 'sublet' and sublet_months is null)
    );

-- A zero or negative sublet is not a shorter sublet, it is a malformed row.
-- No upper bound is imposed: where a sublet stops being a sublet and becomes a
-- tenancy is a product judgement with no evidence behind it yet, and guessing
-- one here would be a constraint nobody decided.
alter table public.listings
  add constraint listings_sublet_months_positive
    check (sublet_months is null or sublet_months > 0);

comment on column public.listings.rental_duration is
  'Yearly, monthly, or a fixed sublet. Required — there is deliberately no default, so an insert that omits it fails rather than silently becoming annual.';

comment on column public.listings.sublet_months is
  'Length of a sublet in months. Present if and only if rental_duration = ''sublet'', enforced by listings_sublet_months_matches_duration.';

-- Duration is a filter dimension in the same way property_type is, and gets the
-- same index treatment.
create index listings_rental_duration_idx on public.listings (rental_duration);

-- ---------------------------------------------------------------------------
-- Grants. ADR-010-A1: decide the grant, not only the policy.
--
-- Both columns are CONTENT, not governance. They describe the offer, exactly as
-- price_naira and property_type do, and both of those are already writable by
-- the owning agent. Nothing about a duration grants entitlement, changes
-- moderation state, or affects verification, so there is no escalation to
-- prevent — an agent who mislabels a monthly flat as yearly has made a mistake
-- in their own listing, not crossed a privilege boundary, and must be able to
-- correct it without an administrator.
--
-- Contrast status, approved_at, verification_status and free_listing_quota,
-- which are absent from every agent grant precisely because writing them would
-- be a self-grant. Duration is not that kind of column.
--
-- Sublet being agents-only needs no mechanism here: creating any listing already
-- requires agent_profile_id = public.current_agent_profile_id(), and a seeker has
-- no agent_profiles row, so that predicate is null and the insert is refused.
-- The restriction is a consequence of listing creation being agents-only.
--
-- `grant update (col)` is additive in PostgreSQL, so this extends the column
-- list from 0013 rather than replacing it.
-- ---------------------------------------------------------------------------

grant update (rental_duration, sublet_months) on public.listings to authenticated;
