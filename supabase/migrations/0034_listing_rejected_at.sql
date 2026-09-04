-- ---------------------------------------------------------------------------
-- When a listing was rejected, which nothing recorded.
--
-- listings has approved_at and archived_at and submitted_at. It has
-- rejection_reason, so the moderator's sentence survives. What it has never
-- had is WHEN — so a rejection cannot be placed on a time-ordered list at all.
--
-- The agent dashboard's activity feed needs that ordering, and updated_at
-- cannot supply it: updated_at moves on every edit, so a listing rejected in
-- June and edited yesterday claims to have been rejected yesterday. It is not
-- a timestamp of anything in particular, which is exactly why it cannot stand
-- in for one.
--
-- Nullable and staying nullable. A listing that was never rejected has no
-- rejection instant, and inventing one — the epoch, the creation date — would
-- put a rejection on the feed of every listing that never had one.
-- ---------------------------------------------------------------------------

alter table public.listings add column rejected_at timestamptz;

comment on column public.listings.rejected_at is
  'When this listing was last rejected by a moderator. Null unless it has been. Distinct from updated_at, which moves on every edit — see 0034.';

-- ---------------------------------------------------------------- the backfill
--
-- Rows already sitting at 'rejected' get updated_at as an APPROXIMATION, and
-- it is only that: it is the last time the row changed for any reason, which
-- for a rejected listing is usually but not always the rejection. Written down
-- rather than left null because a feed that silently omits every historical
-- rejection is worse than one carrying a few imprecise dates, and there is no
-- better source — the moment was never recorded anywhere, audit_logs included.
--
-- ======================================================================
-- THE TRIGGER DANCE BELOW IS NOT DECORATION. BOTH HALVES ARE LOAD-BEARING.
-- ======================================================================
--
-- 1. set_listings_updated_at is DISABLED across the backfill.
--
--    It sets `new.updated_at = now()` unconditionally. Without disabling it,
--    this UPDATE would stamp every rejected listing's updated_at with the
--    migration time — destroying the very values being copied into
--    rejected_at, and rewriting the edit history of every rejected listing to
--    say it was touched during a deploy. The SET expression would still read
--    the old value, so the backfill would look correct while quietly
--    corrupting the column it read from.
--
-- 2. SET CONSTRAINTS ALL IMMEDIATE, before the trigger is re-enabled.
--
--    listings_require_cover_when_active is a DEFERRABLE INITIALLY DEFERRED
--    constraint trigger. The UPDATE queues an event per touched row, and
--    ALTER TABLE refuses to run while any are pending:
--
--      ERROR:  cannot ALTER TABLE "listings" because it has pending trigger events
--
--    This is 0019's lesson in a new costume, and it has 0019's blind spot too:
--    on an EMPTY database the UPDATE touches no rows, queues no events, and the
--    re-enable succeeds — so the broken form passes the replay-from-zero job
--    every time and fails on the first database that has a rejected listing in
--    it. Flushing the queue first is what makes the ALTER legal.
--
--    Verified by hand against a populated table, which per 0019 is the only
--    place the difference is observable. Without the flush: the error above.
--    With it: updated_at preserved at nine days old, rejected_at carrying that
--    same historic value.
alter table public.listings disable trigger set_listings_updated_at;

update public.listings
   set rejected_at = updated_at
 where status = 'rejected'
   and rejected_at is null;

set constraints all immediate;

alter table public.listings enable trigger set_listings_updated_at;
