-- ---------------------------------------------------------------------------
-- Splitting the authenticated read of agent_profiles, and closing a
-- self-approval hole found while doing it.
--
-- ===========================================================================
-- PART 1: THE READ. What 0026 did for anon, for authenticated.
-- ===========================================================================
--
-- authenticated held the table-wide grant from 0010. It has two policies:
-- agents_read_own_profile, which is the legitimate need, and
-- public_can_read_verified_agent_profiles, the same one anon uses. The second
-- means a signed-in seeker could read ANY verified agent's rejection_reason
-- and suspension_reason — a moderator's private assessment of a person, with a
-- login as the only barrier.
--
-- Postgres cannot grant a column conditionally on which policy matched, so the
-- reads have to be split by mechanism rather than by predicate: the public
-- columns by grant, the agent's own private field through a function. Same
-- shape as 0025, and for the same reason — a row-level widening would have
-- disclosed the private columns to everyone the public policy admits.
--
-- The column list is CHOSEN, from what is read rather than what was selected:
--
--   display_name          rendered on cards, the agent workspace, admin views
--   verification_status   drives every gate and status band
--   id                    embed joins and ownership lookups
--   free_listing_quota    the entitlement calculation
--   bio                   the agent profile form and admin review
--   user_id               ownership checks (inspection-service, chat-service)
--   deleted_at            NOT rendered anywhere, and still required: two
--                         queries filter `.is("deleted_at", null)`, and
--                         Postgres refuses a WHERE on a column the caller
--                         cannot SELECT. A column can be needed by the grant
--                         without ever reaching a screen.
--
-- Withheld: rejection_reason, suspension_reason, verified_at, verified_by,
-- founding_agent, verification_submitted_at, created_at, updated_at.
--
-- suspension_reason is withheld from the function too, not only the grant.
-- Nothing renders it — there is no suspended-agent surface — so giving it a
-- reader now would be granting for a hypothetical, which is how the anon list
-- reached fifteen columns. It is readable by service_role alone until a
-- surface needs it, and that is the point at which somebody should choose.
--
-- ===========================================================================
-- PART 2: THE WRITE. An escalation the read audit uncovered.
-- ===========================================================================
--
-- 0010 also granted INSERT table-wide. 0013 then carefully scoped UPDATE to
-- (bio, display_name, updated_at), and the comment on upsertAgentProfile
-- explains why in detail: verification_status, verified_at, verified_by,
-- founding_agent, free_listing_quota, rejection_reason and suspension_reason
-- are each a self-grant, and user_id must not be reassignable.
--
-- Every one of those was writable on INSERT. The policy's WITH CHECK asserts
-- only `user_id = current_app_user_id()`, so it verifies who the row belongs
-- to and nothing about what it claims.
--
-- Proven against this database, as authenticated, with a real Clerk subject:
--
--   insert into public.agent_profiles
--     (user_id, display_name, verification_status, free_listing_quota, verified_at)
--   values (current_app_user_id(), 'PROBE', 'verified', 999, now())
--   -- INSERT 0 1
--
-- A signed-in user could create themselves an already-verified agent profile
-- with unlimited submission slots, skipping document upload, admin review and
-- the entitlement gate that subscriptions are meant to sell — and their
-- listings would then be publicly visible, because verified profiles are
-- publicly readable. The application never does this; PostgREST is exposed, so
-- anyone with a session token and curl can.
--
-- INSERT narrows to what upsertAgentProfile actually writes. Everything else
-- has a database default or belongs to review.
-- ---------------------------------------------------------------------------

-- Table-wide grants must be revoked before column grants mean anything: a
-- column grant added alongside a table-wide one is inert.
revoke select, insert on public.agent_profiles from authenticated;

grant select (
  bio,
  deleted_at,
  display_name,
  free_listing_quota,
  id,
  user_id,
  verification_status
) on public.agent_profiles to authenticated;

grant insert (bio, display_name, user_id) on public.agent_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- The agent's own review outcome, and only their own.
--
-- /agent/verification tells a rejected agent why they were rejected. That is
-- the legitimate need the table-wide grant was serving, and it is the whole
-- reason this function exists rather than the column simply being withheld.
--
-- Returns one field for one row: the caller's. Not parameterised — there is no
-- argument to get wrong, and no way to ask about somebody else.
-- ---------------------------------------------------------------------------
create or replace function public.own_agent_rejection_reason()
returns text
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select ap.rejection_reason
  from public.agent_profiles ap
  where ap.user_id = public.current_app_user_id()
    and ap.deleted_at is null
  limit 1;
$$;

comment on function public.own_agent_rejection_reason() is
  'The calling agent''s own rejection reason. Deliberately not a column grant: authenticated also reads agent_profiles through public_can_read_verified_agent_profiles, so granting the column would disclose every verified agent''s moderation note to any signed-in user.';

-- SECURITY DEFINER runs as the owner, so EXECUTE is the only boundary.
revoke all on function public.own_agent_rejection_reason() from public;
revoke all on function public.own_agent_rejection_reason() from anon;
grant execute on function public.own_agent_rejection_reason() to authenticated;

comment on table public.agent_profiles is
  'Column-scoped for both anon (0026) and authenticated (0027). authenticated reads seven columns and inserts three; rejection_reason comes from own_agent_rejection_reason(), and suspension_reason has no reader outside service_role until a surface needs one. Widening any of these is a deliberate edit here.';
