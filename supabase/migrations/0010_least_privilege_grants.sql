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

-- The service-role client's privileges, stated explicitly rather than
-- inherited from ambient defaults.
--
-- Found by resetting the database from zero for the first time: tables created
-- by the CLI migration runner do not receive service_role DML, so a fresh
-- `supabase db reset` produced a database where every admin, audit and
-- user-sync path failed with "permission denied for table users". The existing
-- database only worked because it had been bootstrapped differently, months
-- earlier. This predates the RLS work — it applies to the tables from 0001
-- onwards — and would have surfaced on the first deploy to a new environment.
--
-- Verified that the revoke above does not cascade here: service_role is not a
-- member of anon or authenticated, and re-running the revoke with these grants
-- in place leaves them intact. They are granted because nothing granted them,
-- not because something took them away.
--
-- service_role bypasses RLS, so this is the escalation path itself. It is
-- reachable only with SUPABASE_SERVICE_ROLE_KEY, which never leaves the server.
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

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
