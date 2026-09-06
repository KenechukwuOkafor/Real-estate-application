-- ---------------------------------------------------------------------------
-- The one number on a public agent profile a stranger cannot fake.
--
-- Everything else on that page is presentation (name, picture, bio) or
-- inventory (the grid, which empties between tenancies). This is the only
-- element that says something a new account cannot manufacture, and it is the
-- only one that persists when the grid is empty.
--
-- ===========================================================================
-- IT RETURNS TWO INTEGERS, NOT ROWS
-- ===========================================================================
--
-- The obvious implementation returns the deadline-bearing columns and lets
-- TypeScript apply responseRate(), which is what the agent dashboard already
-- does and would keep the expiry rule in exactly one place.
--
-- It is not what this does, because the caller here is anon. Handing an
-- anonymous caller one row per inspection request — even stripped of every
-- seeker-identifying column — publishes the timing and volume of an agent's
-- incoming demand to anyone who calls PostgREST directly. The page shows
-- "Replied to 9 of 10 requests"; the disclosure should be those two numbers
-- and not a demand timeline the page never renders.
--
-- ===========================================================================
-- WHICH MEANS THE EXPIRY RULE IS WRITTEN TWICE
-- ===========================================================================
--
-- expiry.ts's header records two live defects caused by one definition of
-- "expired" drifting from another, so this is not a cost to wave through. It
-- is pinned the same way the handle derivation is: a differential test drives
-- both implementations from the same rows and asserts they agree, including
-- on the cases that separate them — a request still inside its window, one
-- past it, and one a seeker withdrew.
--
-- The rule, matching responseRate() in features/agents/dashboard/metrics.ts
-- clause for clause:
--
--   answered     responded_at is not null.
--
--   answerable   answered, OR out of time. A request still inside its window
--                is in neither half: the agent has not failed to answer it,
--                they have not answered it YET, and counting it as a miss
--                would drop the rate every time a new request arrived.
--
--                Withdrawn requests are excluded entirely. A seeker who
--                cancels before the agent replies has removed the thing there
--                was to answer — counting it as a miss would let a seeker
--                damage an agent's public number by changing their mind.
--
-- ===========================================================================
-- LIFETIME, NOT A WINDOW
-- ===========================================================================
--
-- The dashboard windows this figure because it is answering "how am I doing
-- lately" and needs a previous period to compare against. The public page is
-- answering "can I trust this person", and a window is wrong for it twice
-- over: a published claim would change for reasons the agent did not cause,
-- as old requests aged out from under it, and the n>=10 gate below would be
-- reachable and then unreachable again on the same conduct.
--
-- The cost is that an agent who was responsive a year ago and ignores everyone
-- now decays slowly rather than sharply. Accepted: the alternative punishes a
-- seasonal business for its off season, and rental demand in a university town
-- is nothing but seasonal.
--
-- ===========================================================================
-- NO THRESHOLD IN HERE
-- ===========================================================================
--
-- The n>=10 suppression is a rendering decision and lives with the rendering.
-- Putting it here would mean the function answering null for a real 4-of-5,
-- and a later caller with a different threshold would have no way to ask.
-- ---------------------------------------------------------------------------

create or replace function public.agent_response_rate(target_agent_profile_id uuid)
returns table (answered integer, answerable integer)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    count(*) filter (where ir.responded_at is not null)::integer as answered,
    count(*)::integer as answerable
  from public.inspection_requests ir
  where ir.agent_profile_id = target_agent_profile_id
    and ir.deleted_at is null
    and (
      ir.responded_at is not null
      or not (
        ir.status = 'cancelled'
        or (
          ir.status = 'requested'
          and (ir.expires_at is null or ir.expires_at > now())
        )
      )
    );
$$;

comment on function public.agent_response_rate(uuid) is
  'Two integers — answered and answerable — for a public agent profile. Returns counts rather than rows so an anonymous caller cannot read an agent''s demand timeline out of a page that renders "9 of 10". Duplicates the read-time expiry rule from expiry.ts; the two are pinned by a differential test.';

-- SECURITY DEFINER runs as the owner, so EXECUTE is the only boundary. It
-- reads inspection_requests, which anon can read no row of — the aggregate is
-- the entire disclosure, and it is the same two numbers the page prints.
revoke all on function public.agent_response_rate(uuid) from public;
grant execute on function public.agent_response_rate(uuid) to anon, authenticated;
