-- ---------------------------------------------------------------------------
-- View counts an agent can actually read, without view rows leaving the server.
--
-- 0014 made listing_views unreadable and said why: "view counts are analytics,
-- not user-facing data". That reasoning is about ROWS, not counts. Each row
-- carries ip_hash, user_agent and referrer — a per-visit trail about a person
-- searching for housing, which is not something to hand an agent. A count of
-- distinct viewers on the agent's own listing is a different object entirely.
--
-- So the table stays unreadable and this function returns aggregates. Same
-- shape as every other privileged path here (0015, 0020, 0022, 0029, 0030):
-- SECURITY DEFINER, its own authorization check in the body, and — since 0029
-- — revoked from public, anon AND authenticated before being granted back.
--
-- ============================================================================
-- WHAT ONE "VIEW" MEANS, AND WHY IT IS A DAY
-- ============================================================================
--
-- Until now nothing deduplicated anything. A refresh was a view, a back
-- navigation was a view, and a React StrictMode remount was two. An agent
-- reading "214" would read it as 214 people, and it was not that.
--
-- The unit here is ONE VIEWER PER LISTING PER DAY, and the day is the reason:
-- the dashboard's finest bucket is a day. The chart toggles 7/30/90 and
-- buckets daily; the per-listing table is a total. A dedup window finer than
-- the display grain manufactures counts nobody can act on — two visits forty
-- minutes apart are not two leads — and the per-listing conversion ratio only
-- means something if its denominator is people rather than page loads. That
-- ratio is the most actionable number on the dashboard: views with no requests
-- is a price or photo problem, not a visibility problem, and it is only
-- readable if the numerator counts people.
--
-- ============================================================================
-- IDENTITY, AND WHY ip_hash IS NOT PART OF IT
-- ============================================================================
--
-- Identity is `coalesce(viewer_user_id::text, session_id)`. ip_hash is NOT a
-- fallback, and this is deliberate enough to be the main comment in the file.
--
-- Nsukka students share NAT — campus wifi, hostel connections, phone tethering
-- passed around. Deduplicating on ip_hash would collapse thirty real people
-- behind one address into a single view, and it would do it hardest on the
-- listings that are being looked at most. That is the specific failure this
-- design is built to avoid: a number that silently UNDER-COUNTS the busiest
-- listing is worse than no number, because the agent acts on it. They drop a
-- price that was never the problem.
--
-- THE THIRD CASE — a client that cannot store a session id — IS COUNTED RAW,
-- and it is handled in the client rather than here. ListingViewTracker always
-- sends a session_id: persistent in localStorage where storage works,
-- ephemeral per page load where it does not. So session_id is never null, this
-- function needs no fallback branch, and a storage-blocked visitor counts as a
-- new viewer on each page load.
--
-- That over-counts a small minority. It is the right direction to be wrong in:
-- over-counting a few storage-blocked visitors is visible and self-limiting,
-- while under-counting shared-NAT traffic is invisible and concentrated on
-- exactly the listings that matter. The rejected alternative — reporting
-- unattributable views as a separate figure — puts a number on the card that
-- the agent must mentally add and cannot act on, and it under-counts the busy
-- listings in precisely the way this paragraph exists to prevent.
--
-- ip_hash keeps being collected. It is for abuse investigation, not identity,
-- and nothing here reads it.
--
-- ============================================================================
-- COMPUTED, NOT STORED
-- ============================================================================
--
-- count(distinct ...) at read time. No rollup table, no materialised view, no
-- job — consistent with expiry being evaluated at read time and for the same
-- reason: there is no scheduler running.
--
-- MEASURED, NOT ESTIMATED, because the estimate was wrong by about fifty
-- times. The first version of this comment said 90,000 rows would be
-- single-digit milliseconds. Against this database, one agent's 90-day window:
--
--     20,000 rows    91 ms
--     50,000 rows   233 ms
--    100,000 rows   438 ms
--    200,000 rows   858 ms   (external merge sort, 10 MB spilled to disk)
--
-- Linear, about 4.4 microseconds per row. The cost is NOT the lookup — the
-- index scan is a few milliseconds. It is count(distinct), which must sort
-- every matching row by (listing, day, identity) before it can count. No index
-- removes that, which is why widening the index is not the fix.
--
-- WHAT THAT MEANS FOR THE DASHBOARD. The window dominates, so the toggle
-- decides the cost:
--
--   * 7 days at 100 views/listing/day across 10 listings — about 7,000 rows,
--     roughly 30 ms. Comfortable.
--   * 30 days, same rate — about 30,000 rows, roughly 140 ms. Fine.
--   * 90 days, same rate — about 90,000 rows, roughly 400 ms. Noticeable on a
--     page load, and it is the one an agent reaches for least often.
--
-- So this is right for launch and the 90-day toggle is the expensive path.
-- Default the dashboard to 30 days rather than 90.
--
-- THE TRIGGER FOR REVISITING, so it is a decision rather than a discovery:
-- when a single agent's 90-day window passes roughly 100,000 rows. The fix
-- then is NOT an incremental counter — count(distinct) cannot be maintained
-- incrementally. It is a daily distinct-viewer rollup written on the read path
-- or by a scheduler, or a sketch. Both are real designs and neither is this
-- one.
-- ---------------------------------------------------------------------------

create or replace function public.agent_listing_view_counts(
  since_day date,
  until_day date
)
returns table (
  listing_id uuid,
  viewed_on date,
  viewers bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  caller_profile uuid;
begin
  caller_profile := public.current_agent_profile_id();

  -- A grant is not an authorization check (0029). Nothing about holding
  -- EXECUTE says which agent is asking, and the whole point of this function
  -- is that it reaches a table the caller cannot read.
  if caller_profile is null then
    raise exception 'AGENT_PROFILE_REQUIRED'
      using errcode = '42501',
            detail = 'Only an agent may read view counts, and only their own.';
  end if;

  if since_day is null or until_day is null or until_day < since_day then
    raise exception 'VIEW_COUNT_RANGE_INVALID'
      using errcode = '22023',
            detail = 'The range must be two dates, and it must not run backwards.';
  end if;

  -- Bounded so one call cannot ask for the whole history. The dashboard's
  -- widest toggle is 90 days; a year is generous and still finite.
  if until_day - since_day > 366 then
    raise exception 'VIEW_COUNT_RANGE_TOO_WIDE'
      using errcode = '22023',
            detail = 'View counts are available for at most 366 days at a time.';
  end if;

  return query
  select
    v.listing_id,
    -- WEST AFRICA TIME, NOT UTC. An agent's "today" is a Nsukka day, and
    -- bucketing in UTC would move every view between 23:00 and midnight local
    -- into tomorrow — one hour of every day filed under the wrong bar on the
    -- chart. Africa/Lagos has no DST, so this is a fixed offset and not a
    -- seasonal bug waiting to happen. Hardcoded because the product is one
    -- city at launch; it becomes a column when that stops being true.
    (v.created_at at time zone 'Africa/Lagos')::date as viewed_on,
    count(distinct coalesce(v.viewer_user_id::text, v.session_id)) as viewers
  from public.listing_views v
  join public.listings l on l.id = v.listing_id
  where l.agent_profile_id = caller_profile
    and l.deleted_at is null
    -- created_at is left BARE on both sides so the (listing_id, created_at)
    -- index from 0001 is usable. Wrapping it in `at time zone` here — the
    -- obvious way to write "between these two local dates" — would make the
    -- predicate unindexable and turn this into a sequential scan of every view
    -- ever recorded. The conversion happens on the boundaries instead.
    and v.created_at >= (since_day::timestamp at time zone 'Africa/Lagos')
    and v.created_at < ((until_day + 1)::timestamp at time zone 'Africa/Lagos')
    -- A row with no identity at all cannot be counted as a distinct anybody.
    -- The client makes this unreachable; it is here because "the client
    -- guarantees it" is how listing_views came to be full of null session_ids
    -- in the first place.
    and (v.viewer_user_id is not null or v.session_id is not null)
  group by v.listing_id, (v.created_at at time zone 'Africa/Lagos')::date;
end;
$$;

comment on function public.agent_listing_view_counts(date, date) is
  'Distinct viewers per day for the calling agent''s own listings, bucketed in Africa/Lagos. Aggregates only — listing_views rows stay unreadable (0014), because the objection is to the per-visit trail and not to a count. Identity is viewer_user_id then session_id; ip_hash is deliberately not used, since shared NAT would under-count the busiest listings. See 0033.';

revoke all on function public.agent_listing_view_counts(date, date)
  from public, anon, authenticated;
grant execute on function public.agent_listing_view_counts(date, date) to authenticated;
