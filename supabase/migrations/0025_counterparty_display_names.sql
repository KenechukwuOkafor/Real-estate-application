-- ---------------------------------------------------------------------------
-- Letting an agent see the name of the person who asked to view their property.
--
-- public.users is readable only by yourself or an admin (0002). That is correct
-- as a default and it has a consequence nobody had looked at: an agent cannot
-- read a single field about a seeker who has asked to see their flat. The
-- inspection inbox renders "A seeker" for every row, and the chat header — which
-- embeds the same table through the same client — falls back to the literal
-- word "student". An agent is being asked to commit to meeting a stranger at a
-- property, and we were not telling them the stranger's name.
--
-- THE GRANT DECISION, per ADR-010-A1, is the whole of this migration.
--
-- The obvious fix is a policy: "an agent may read users who have an inspection
-- request with them". It is the wrong fix. `authenticated` holds column SELECT
-- on users.email, users.phone_number, users.clerk_user_id and users.avatar_url,
-- so a row-level widening hands an agent the seeker's email address and phone
-- number as a side effect of them asking a question. Nobody decided that, and
-- it is not what the surface needs.
--
-- So the disclosure is made by a function that returns exactly one field, and
-- the rows stay unreadable. What an agent learns is a name, because a name is
-- what the inbox has to show. Widening this later is then a deliberate edit to
-- a select list rather than an emergent property of a policy.
--
-- Reciprocity: nothing is needed in the other direction. An agent's name is
-- agent_profiles.display_name, which is already public — a seeker browsing
-- listings can see it before they ask anything.
-- ---------------------------------------------------------------------------

create or replace function public.counterparty_display_names(user_ids uuid[])
returns table (user_id uuid, full_name text)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select u.id, u.full_name
  from public.users u
  where u.id = any(user_ids)
    and u.deleted_at is null
    and (
      -- Somebody who has asked to view one of the caller's properties.
      exists (
        select 1
        from public.inspection_requests ir
        where ir.requester_user_id = u.id
          and ir.deleted_at is null
          and ir.agent_profile_id = public.current_agent_profile_id()
      )
      -- Or somebody the caller is already in a conversation with. Every chat
      -- today comes from an inspection request, so this is currently implied by
      -- the clause above — it is here because a chat that outlives its request,
      -- or one opened by some future route, must not silently blank the name in
      -- the header of a conversation that is visibly open.
      or exists (
        select 1
        from public.chats c
        where c.student_user_id = u.id
          and c.deleted_at is null
          and c.agent_profile_id = public.current_agent_profile_id()
      )
    );
$$;

comment on function public.counterparty_display_names(uuid[]) is
  'Names only, and only of seekers who have contacted the calling agent. Deliberately not a policy on public.users: authenticated holds column grants on email and phone_number there, so a row-level widening would disclose those too.';

-- SECURITY DEFINER runs as the owner, so EXECUTE is the only thing standing
-- between this and anonymous traffic.
revoke all on function public.counterparty_display_names(uuid[]) from public;
revoke all on function public.counterparty_display_names(uuid[]) from anon;
grant execute on function public.counterparty_display_names(uuid[]) to authenticated;
