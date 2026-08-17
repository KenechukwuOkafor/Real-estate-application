-- Least privilege at the grant layer.
--
-- Supabase grants anon and authenticated full DML on every table in public by
-- default. Before this migration all 13 business tables carried
-- SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER for both
-- roles, which means RLS was the single control standing between an
-- unauthenticated caller and `truncate public.users`.
--
-- ADR-010 wants RLS as the *final* boundary, not the only one, and both
-- REB-ARCH-004 and REB-SEC-001 name least privilege as a design principle.
-- Grants are the layer underneath: a privilege never granted cannot be
-- reached by a policy bug.
--
-- This also fixes a concrete hole in migration 0009. The column-level
-- `grant update (last_message_at, updated_at) on chats` was inert because the
-- blanket UPDATE grant already covered every column. An agent participant
-- satisfies participants_touch_own_chats WITH CHECK through the
-- agent_profile_id branch, so they could repoint student_user_id at an
-- arbitrary user and hand themselves someone else's conversation. Revoking the
-- table-wide grant makes the column list load-bearing.
--
-- Tables with no grant below are reachable only through the service-role
-- client until their group in this slice lands. RLS already denied them
-- (no policy, default deny); removing the grant removes the redundant
-- privilege as well.

revoke all on all tables in schema public from anon, authenticated;

-- Public marketplace reads. Row visibility is still constrained by the
-- policies from 0002 (approved listings, verified agent profiles) and 0009
-- (an agent reading their own profile).
grant select on public.listings to anon, authenticated;
grant select on public.listing_images to anon, authenticated;
grant select on public.agent_profiles to anon, authenticated;

-- Anonymous view beacon. BR-ANA-003 keeps this non-blocking; the insert policy
-- from 0002 restricts it to approved listings.
grant insert on public.listing_views to anon, authenticated;

-- Group 1: chats and messages.
grant select on public.chats to authenticated;
grant select, insert on public.messages to authenticated;

-- Only the message-activity stamp is writable by a participant. Ownership
-- columns are deliberately absent: student_user_id and agent_profile_id
-- define who the conversation belongs to, and a participant must not be able
-- to change that even though the row-level predicate matches.
grant update (last_message_at, updated_at) on public.chats to authenticated;

-- Sequences backing any granted INSERT must remain usable.
grant usage, select on all sequences in schema public to anon, authenticated;
