-- RLS identity helpers.
--
-- ADR-010 makes PostgreSQL the final authorization boundary. Every policy in
-- this slice needs to answer three questions, and they need to be answered
-- identically everywhere or the policies drift apart:
--
--   1. who is calling?              -> public.clerk_user_id()
--   2. which app user is that?      -> public.current_app_user_id()
--   3. what roles do they hold?     -> public.current_user_has_role()
--
-- No policies here. This migration only establishes the identity path so it
-- can be proven end to end before anything depends on it.
--
-- ADR-003 keeps Postgres authoritative for roles: current_user_has_role reads
-- public.user_roles rather than trusting a claim in the JWT. A compromised or
-- stale token cannot grant a role it was never issued, and roles revoked in
-- the database take effect on the next statement rather than the next token.

-- The Clerk subject, straight off the verified JWT.
--
-- Supabase validates the token against Clerk's JWKS (configured under
-- [auth.third_party.clerk] in supabase/config.toml) before the request reaches
-- Postgres, so this value is trustworthy. Returns null for anonymous callers,
-- which makes every ownership comparison below evaluate false rather than
-- error — default deny, per BR-RLS-002.
create or replace function public.clerk_user_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

comment on function public.clerk_user_id() is
  'Clerk subject claim of the caller, or null when anonymous. Also serves as the diagnostic for confirming the token path reaches Postgres.';

-- The caller's public.users.id.
--
-- SECURITY DEFINER on purpose. Policies on other tables need to resolve the
-- caller to a users row, and public.users will itself carry a policy. Without
-- DEFINER, evaluating a policy that calls this would re-enter the users policy
-- and recurse. Fixing search_path is mandatory for a DEFINER function: it stops
-- a caller shadowing `users` with something of their own.
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id
  from public.users u
  where u.clerk_user_id = public.clerk_user_id()
    and u.deleted_at is null
  limit 1
$$;

comment on function public.current_app_user_id() is
  'public.users.id for the calling Clerk subject, or null. SECURITY DEFINER to avoid recursive policy evaluation on public.users.';

-- Whether the caller holds a role, read from Postgres.
--
-- ADR-003: Clerk owns identity, Ruvo owns roles. Nothing is mirrored into
-- Clerk metadata and no role claim in the JWT is consulted.
create or replace function public.current_user_has_role(target public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.users u on u.id = ur.user_id
    where u.clerk_user_id = public.clerk_user_id()
      and u.deleted_at is null
      and ur.role = target
  )
$$;

comment on function public.current_user_has_role(public.app_role) is
  'True when the calling Clerk subject holds the role in public.user_roles. Roles are never read from the JWT (ADR-003).';

-- The agent profile owned by the caller, if any. Ownership for listings,
-- listing_images, verification submissions and inspection requests all key
-- off agent_profile_id rather than user_id.
create or replace function public.current_agent_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ap.id
  from public.agent_profiles ap
  join public.users u on u.id = ap.user_id
  where u.clerk_user_id = public.clerk_user_id()
    and u.deleted_at is null
    and ap.deleted_at is null
  limit 1
$$;

comment on function public.current_agent_profile_id() is
  'public.agent_profiles.id owned by the calling Clerk subject, or null.';

grant execute on function public.clerk_user_id() to anon, authenticated;
grant execute on function public.current_app_user_id() to anon, authenticated;
grant execute on function public.current_user_has_role(public.app_role) to anon, authenticated;
grant execute on function public.current_agent_profile_id() to anon, authenticated;
