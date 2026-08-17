-- RLS group 1: chats and messages.
--
-- Ordered first by blast radius. These are private two-party conversations and
-- the worst thing in the system to leak. REB-ARCH-004: "Participants only. A
-- user cannot access conversations they do not participate in."
--
-- The gap this closes: listChatMessages (chat-repository.ts) filters only on
-- chat_id and deleted_at. It has no ownership predicate whatsoever. It is safe
-- today solely because chat-service always calls getChatForUser first, so a
-- single reordering or a new caller would leak every message in the system.
-- After this migration the database refuses regardless of caller discipline.
--
-- Deliberately no admin bypass. REB-ARCH-004's access matrix grants admins
-- "Reported Only*" on conversations and messages — moderation access scoped to
-- an investigation, not blanket read. The service layer grants admins nothing
-- here either, so a blanket admin policy would both contradict the spec and
-- widen access beyond current behaviour. Moderation access is a later slice.

-- Participation test, shared by both tables so they cannot drift apart.
--
-- SECURITY DEFINER so the messages policy does not re-enter the chats policy
-- on every row; the predicate is identical either way, but this keeps the
-- evaluation flat and the intent explicit.
create or replace function public.is_chat_participant(target_chat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.chats c
    where c.id = target_chat_id
      and c.deleted_at is null
      and (
        c.student_user_id = public.current_app_user_id()
        or c.agent_profile_id = public.current_agent_profile_id()
      )
  )
$$;

comment on function public.is_chat_participant(uuid) is
  'True when the calling Clerk subject is the student or the owning agent of the chat.';

grant execute on function public.is_chat_participant(uuid) to authenticated;

-- An agent must be able to resolve their own agent_profiles row to participate
-- in a chat at all. The only existing policy on agent_profiles is the public
-- read of verified profiles (0002), so without this an unverified agent cannot
-- see their own profile and would be locked out of their own conversations.
--
-- Scoped to self-SELECT only. Ownership and write policies for agent_profiles
-- belong to group 4; this is the minimum required to make group 1 correct.
create policy "agents_read_own_profile"
on public.agent_profiles
for select
to authenticated
using (user_id = public.current_app_user_id());

grant select on public.chats to authenticated;
grant select, insert on public.messages to authenticated;
grant update (last_message_at, updated_at) on public.chats to authenticated;

create policy "participants_read_own_chats"
on public.chats
for select
to authenticated
using (
  deleted_at is null
  and (
    student_user_id = public.current_app_user_id()
    or agent_profile_id = public.current_agent_profile_id()
  )
);

-- Narrow UPDATE so sendCurrentUserChatMessage can stamp last_message_at.
-- Column-level grant above means a participant cannot repoint student_user_id
-- or agent_profile_id even though the row predicate matches.
create policy "participants_touch_own_chats"
on public.chats
for update
to authenticated
using (
  deleted_at is null
  and (
    student_user_id = public.current_app_user_id()
    or agent_profile_id = public.current_agent_profile_id()
  )
)
with check (
  deleted_at is null
  and (
    student_user_id = public.current_app_user_id()
    or agent_profile_id = public.current_agent_profile_id()
  )
);

create policy "participants_read_chat_messages"
on public.messages
for select
to authenticated
using (
  deleted_at is null
  and public.is_chat_participant(chat_id)
);

-- Sending requires both participation and that the sender is honestly
-- identified: a participant cannot post as the other party.
create policy "participants_send_own_messages"
on public.messages
for insert
to authenticated
with check (
  sender_user_id = public.current_app_user_id()
  and public.is_chat_participant(chat_id)
);

-- No UPDATE or DELETE policy on messages, deliberately. REB-ARCH-004: "Users
-- cannot edit messages after sending. Deletion is not supported in the MVP."
-- Absence of a policy is denial (BR-RLS-002).
