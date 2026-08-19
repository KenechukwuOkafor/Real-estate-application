-- RLS group 2: agent_verification_submissions.
--
-- Identity documents. BR-SEC-005 (Critical): "Verification documents remain
-- private." REB-ARCH-004: agents read their own, administrators read all.
--
-- Note on what is actually stored: the documents column holds agent-supplied
-- URLs, not uploaded files, so these policies protect the submission record
-- and the full legal name. The documents themselves live at whatever URL the
-- agent typed and are outside the database's control entirely — a gap worth
-- naming, but a media problem rather than an RLS one.

grant select, insert on public.agent_verification_submissions to authenticated;

-- Agents read only their own submissions.
create policy "agents_read_own_verification_submissions"
on public.agent_verification_submissions
for select
to authenticated
using (
  deleted_at is null
  and agent_profile_id = public.current_agent_profile_id()
);

-- Administrators read all of them, for the review queue.
--
-- The role comes from public.user_roles via current_user_has_role, never from
-- a claim in the JWT (ADR-003). A revoked admin loses access on the next
-- statement rather than when their token happens to expire.
create policy "admins_read_all_verification_submissions"
on public.agent_verification_submissions
for select
to authenticated
using (public.current_user_has_role('admin'));

-- An agent may file a submission only against their own profile.
create policy "agents_create_own_verification_submissions"
on public.agent_verification_submissions
for insert
to authenticated
with check (agent_profile_id = public.current_agent_profile_id());

-- No UPDATE or DELETE policy for authenticated, deliberately.
--
-- Review outcomes are written by admin-service through the service-role
-- client, which is the escalation the brief explicitly preserves for
-- verification review. Granting agents UPDATE here would let them clear
-- reviewed_at and resubmit around the state guard in agent-service.
