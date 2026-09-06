-- ---------------------------------------------------------------------------
-- The last column on agent_profiles that any signed-in user could read about
-- every verified agent.
--
-- 0027 split this table's reads by mechanism: the public columns by grant, the
-- agent's own private fields through a function. It did that because
-- `authenticated` reads agent_profiles under two policies — agents_read_own_
-- profile, the legitimate need, and public_can_read_verified_agent_profiles,
-- the same one anon uses — and a column grant cannot tell them apart.
--
-- It applied that reasoning to rejection_reason and suspension_reason. It did
-- not apply it to free_listing_quota, which it granted with the note "the
-- entitlement calculation". That justification is about NEED, not about
-- safety, and the need is only ever for the caller's own row: every reader
-- filters `.eq("user_id", <the caller>)`.
--
-- 0026 had already named what the column is, while arguing anon must not see
-- it: "how much inventory the agent has left to publish. Commercially theirs."
-- The same sentence is true of a signed-in caller, who is very often a
-- competing agent — every agent in this market is also a Ruvo user.
--
-- MEASURED, NOT REASONED. As `authenticated`, with no JWT claims at all,
-- against this database:
--
--   set local role authenticated;
--   select id, display_name, free_listing_quota, user_id
--     from public.agent_profiles;
--   --                  id                  |    display_name    | free_listing_quota
--   --  fbbda28e-...-6001 | Prime Homes Nsukka |                 47
--
-- 47 was written by the probe beforehand, so the disclosure is proved by the
-- value rather than by the query merely succeeding. The public policy's
-- predicate does not consult the caller, so no session was needed to read it.
--
-- user_id came back on the same row and is NOT closed here. It has a genuine
-- cross-row reader (inspection-service's self-request pre-check reads the
-- listing agent's user_id), and every own-row lookup FILTERS on it — Postgres
-- refuses a WHERE on a column the caller cannot SELECT. Closing it means
-- moving those lookups onto current_agent_profile_id(), which is a change to
-- the path every authenticated agent page runs. That is a decision, not a
-- side effect of this one, and 0026 made the same call in the other direction
-- for exactly this reason. An opaque uuid for an already-public agent is also
-- a materially smaller disclosure than remaining inventory.
-- ---------------------------------------------------------------------------

revoke select (free_listing_quota) on public.agent_profiles from authenticated;

-- ---------------------------------------------------------------------------
-- The caller's own remaining quota, and only their own.
--
-- Same shape as own_agent_rejection_reason(): no parameter, so there is no
-- argument to get wrong and no way to ask about somebody else.
--
-- Returns 0 rather than null for a caller with no agent profile. The callers
-- all coalesce to 0 already, and a quota of "none" and "no profile" lead to
-- the same answer at every gate — canSubmitListing is false either way.
-- ---------------------------------------------------------------------------
create or replace function public.own_agent_free_listing_quota()
returns integer
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(
    (
      select ap.free_listing_quota
      from public.agent_profiles ap
      where ap.user_id = public.current_app_user_id()
        and ap.deleted_at is null
      limit 1
    ),
    0
  );
$$;

comment on function public.own_agent_free_listing_quota() is
  'The calling agent''s own remaining free listing quota. Deliberately not a column grant: authenticated also reads agent_profiles through public_can_read_verified_agent_profiles, so granting the column disclosed every verified agent''s remaining inventory to any signed-in user. Measured, see 0037.';

-- SECURITY DEFINER runs as the owner, so EXECUTE is the only boundary.
revoke all on function public.own_agent_free_listing_quota() from public;
revoke all on function public.own_agent_free_listing_quota() from anon;
grant execute on function public.own_agent_free_listing_quota() to authenticated;

comment on table public.agent_profiles is
  'Column-scoped for both anon (0026) and authenticated (0027, 0037). authenticated reads six columns and inserts three; rejection_reason and free_listing_quota come from own_agent_rejection_reason() and own_agent_free_listing_quota(), and suspension_reason has no reader outside service_role until a surface needs one. Widening any of these is a deliberate edit here.';
