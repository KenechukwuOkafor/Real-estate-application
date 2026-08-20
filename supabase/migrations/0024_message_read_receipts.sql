-- ---------------------------------------------------------------------------
-- Marking a message read.
--
-- messages.read_at has existed since 0009 and nothing has ever written it:
-- `authenticated` holds INSERT and SELECT and no UPDATE at all. An unread count
-- built on it would therefore have counted every message the other party ever
-- sent, forever — a badge that never clears, which is worse than no badge,
-- because it stops meaning anything and then gets ignored.
--
-- The inspection inbox needs the count to be true, so this makes it writable by
-- exactly the person it is about.
--
-- THE GRANT DECISION, per ADR-010-A1. read_at is content, and unusually it is
-- content about the READER rather than about the message. There is no
-- escalation to prevent: marking a message read grants nothing, reveals
-- nothing, and cannot be used to alter what was said. What it must not allow is
-- one party rewriting the OTHER party's state — an agent marking their own
-- messages read on the seeker's behalf, which would silently clear a badge the
-- seeker had not looked at.
--
-- So the column grant is narrow and the row predicate carries the rest: a
-- participant may mark a message read only when they did not send it. Ownership
-- answers "which conversation"; the sender check answers "whose state is this".
-- ---------------------------------------------------------------------------

grant update (read_at) on public.messages to authenticated;

create policy "participants_mark_received_messages_read"
on public.messages
for update
to authenticated
using (
  deleted_at is null
  -- Not the sender. Reading your own message is not a thing that happens, and
  -- allowing it would let either party clear the other's badge.
  and sender_user_id is distinct from public.current_app_user_id()
  and exists (
    select 1
    from public.chats c
    where c.id = messages.chat_id
      and c.deleted_at is null
      and (
        c.student_user_id = public.current_app_user_id()
        or c.agent_profile_id = public.current_agent_profile_id()
      )
  )
)
with check (
  deleted_at is null
  and sender_user_id is distinct from public.current_app_user_id()
  and exists (
    select 1
    from public.chats c
    where c.id = messages.chat_id
      and c.deleted_at is null
      and (
        c.student_user_id = public.current_app_user_id()
        or c.agent_profile_id = public.current_agent_profile_id()
      )
  )
);

-- Counting unread messages per chat is the inbox's hot query: one row per
-- accepted request, each asking "how many here are unread". Partial, because
-- read messages are the overwhelming majority over time and none of them are
-- ever the answer.
create index messages_unread_by_chat_idx
  on public.messages (chat_id)
  where read_at is null and deleted_at is null;
