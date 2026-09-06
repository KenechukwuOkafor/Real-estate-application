-- ---------------------------------------------------------------------------
-- Profile views, counted separately from listing views.
--
-- ===========================================================================
-- WHAT THIS IS EVIDENCE FOR
-- ===========================================================================
--
-- The question is whether a public agent profile gets traffic that goes
-- nowhere. A seeker who lands on /a/prime-homes-nsukka, reads it, and neither
-- opens a listing nor sends an inspection request arrived with a question the
-- page could not answer. That is the case for opening a general contact
-- channel — and it is deliberately the ONLY case, because the inspection
-- request is currently the sole pipeline and the reason a conversation on this
-- platform means something.
--
-- Folding these into listing_views would destroy exactly that comparison: the
-- numerator and the denominator would be the same number. Hence a table.
--
-- ===========================================================================
-- SAME DEDUPLICATION AS listing_views, AND IT IS NOT AT WRITE TIME
-- ===========================================================================
--
-- Rows are stored raw and deduplicated when counted: one viewer per profile
-- per day, identity `coalesce(viewer_user_id::text, session_id)`, exactly as
-- 0033 does. Its reasoning transfers unchanged and is worth restating, because
-- the obvious alternative is wrong in a way that hides itself:
--
-- ip_hash is NOT part of identity. Nsukka students share NAT — campus wifi,
-- hostel connections, tethering passed around — so deduplicating on it would
-- collapse thirty real people into one view, hardest on whatever is being
-- looked at most. Over-counting a few storage-blocked visitors is visible and
-- self-limiting; under-counting shared-NAT traffic is invisible and
-- concentrated on the pages that matter.
--
-- ===========================================================================
-- ATTRIBUTION TRAVELS WITH THE CONNECTION
-- ===========================================================================
--
-- viewer_user_id defaults to current_app_user_id() and INSERT is not granted
-- on it, so a caller cannot name anybody — the database names the caller, and
-- an anonymous session honestly resolves to NULL. 0028 closed this on
-- listing_views after finding the route passing a value it had resolved
-- itself: correct, but only incidentally, because the database accepted
-- whatever it was told.
-- ---------------------------------------------------------------------------

create table public.agent_profile_views (
  id uuid primary key default gen_random_uuid(),
  agent_profile_id uuid not null references public.agent_profiles(id),
  viewer_user_id uuid references public.users(id) default public.current_app_user_id(),
  session_id text,
  ip_hash text,
  user_agent text,
  referrer text,
  created_at timestamptz not null default now()
);

create index agent_profile_views_profile_id_idx
  on public.agent_profile_views (agent_profile_id);
create index agent_profile_views_profile_id_created_at_idx
  on public.agent_profile_views (agent_profile_id, created_at);

comment on column public.agent_profile_views.viewer_user_id is
  'System-supplied, never client-supplied: defaults to current_app_user_id() and INSERT is not granted on it. anon resolves to NULL.';

alter table public.agent_profile_views enable row level security;

-- ------------------------------------------------------------------ writes
--
-- Anyone may record a view of a profile they could have been looking at, which
-- is a verified, undeleted one — the same predicate that decides whether the
-- page renders at all. A view of an unverified agent's profile can only come
-- from that agent looking at their own page, and counting it would put the
-- agent's own traffic into the evidence.
create policy "public_can_record_agent_profile_views"
on public.agent_profile_views
for insert
to anon, authenticated
with check (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.id = agent_profile_id
      and ap.deleted_at is null
      and ap.verification_status = 'verified'
  )
);

-- Everything a beacon legitimately reports. viewer_user_id is absent by
-- design; id and created_at have defaults.
grant insert (agent_profile_id, session_id, ip_hash, user_agent, referrer)
  on public.agent_profile_views to anon, authenticated;

-- ------------------------------------------------------------------- reads
--
-- No SELECT grant to anyone. Each row carries ip_hash, user_agent and referrer
-- — a per-visit trail about a person looking for housing, which is not
-- something to hand an agent, and 0014 made the same call for listing_views
-- and 0033 kept it while adding aggregates.
--
-- No aggregate function accompanies this table yet, deliberately. Nothing
-- renders a profile view count: the question this data answers is a product
-- question about whether the page is missing an answer, and that is asked
-- against the whole dataset rather than on somebody's dashboard. A per-agent
-- reader can be added when a surface needs one, and choosing it then is the
-- point — a function granted for a hypothetical is how the anon column list on
-- agent_profiles reached fifteen.
