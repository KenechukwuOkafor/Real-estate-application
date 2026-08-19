-- RLS group 5: saved_listings, reports, audit_logs, user_roles,
-- subscriptions, users.
--
-- Completes BR-RLS-001: every business table enforces RLS through a reviewed
-- policy. Tables reachable only by the service-role client still get policies,
-- so that migrating those call sites later cannot silently open them.

-- ----------------------------------------------------------- saved_listings

grant select, insert, delete on public.saved_listings to authenticated;

create policy "users_read_own_saved_listings"
on public.saved_listings
for select
to authenticated
using (user_id = public.current_app_user_id());

create policy "users_save_for_themselves"
on public.saved_listings
for insert
to authenticated
with check (user_id = public.current_app_user_id());

-- DELETE is granted here, unusually. REB-ARCH-004 prefers soft deletes and
-- says DELETE should rarely be granted, but saved_listings has no deleted_at
-- column and unsaving is a genuine hard delete of a user's own bookmark. The
-- policy keeps it to their own rows.
create policy "users_unsave_their_own"
on public.saved_listings
for delete
to authenticated
using (user_id = public.current_app_user_id());

-- ------------------------------------------------------------------ reports

grant select, insert on public.reports to authenticated;

-- REB-ARCH-004: "Any authenticated user may submit reports. Only
-- administrators resolve reports."
create policy "users_file_own_reports"
on public.reports
for insert
to authenticated
with check (reporter_user_id = public.current_app_user_id());

create policy "users_read_own_reports"
on public.reports
for select
to authenticated
using (
  deleted_at is null
  and reporter_user_id = public.current_app_user_id()
);

create policy "admins_read_all_reports"
on public.reports
for select
to authenticated
using (public.current_user_has_role('admin'));

-- No UPDATE for authenticated: resolution is an admin action and runs through
-- the service-role client.

-- --------------------------------------------------------------- audit_logs

-- BR-RLS-005 (Critical): audit logs are read-only. REB-ARCH-004: append-only,
-- no UPDATE, no DELETE, only administrators may read.
--
-- INSERT is deliberately NOT granted to authenticated. Audit writes go through
-- audit-service on the service-role client, which the brief preserves. Letting
-- a user insert their own audit rows would let them forge the record of their
-- own actions.
grant select on public.audit_logs to authenticated;

create policy "admins_read_audit_logs"
on public.audit_logs
for select
to authenticated
using (public.current_user_has_role('admin'));

-- --------------------------------------------------------------- user_roles

-- Readable so a user can see what they are, never writable: an INSERT grant
-- here would be a direct self-promotion to admin. Role grants run through the
-- user-sync and verification-approval paths on the service-role client, which
-- is where the SELF_SERVICE_ROLES allowlist is enforced.
grant select on public.user_roles to authenticated;

create policy "users_read_own_roles"
on public.user_roles
for select
to authenticated
using (user_id = public.current_app_user_id());

create policy "admins_read_all_roles"
on public.user_roles
for select
to authenticated
using (public.current_user_has_role('admin'));

-- ------------------------------------------------------------ subscriptions

-- REB-ARCH-004: "Users may only view their own subscription. Administrators
-- manage all subscriptions." No write policies: nothing in the codebase
-- creates a subscription yet, and when billing lands it will be a webhook
-- acting as the system, not the agent.
grant select on public.subscriptions to authenticated;

create policy "agents_read_own_subscriptions"
on public.subscriptions
for select
to authenticated
using (
  deleted_at is null
  and agent_profile_id = public.current_agent_profile_id()
);

create policy "admins_read_all_subscriptions"
on public.subscriptions
for select
to authenticated
using (public.current_user_has_role('admin'));

-- -------------------------------------------------------------------- users

-- Self-read only. Identity rows are written by the user-sync path on the
-- service-role client before a usable session exists, so no write policy.
grant select on public.users to authenticated;

create policy "users_read_themselves"
on public.users
for select
to authenticated
using (
  deleted_at is null
  and clerk_user_id = public.clerk_user_id()
);

create policy "admins_read_all_users"
on public.users
for select
to authenticated
using (public.current_user_has_role('admin'));

-- listing_views already carries its insert policy from 0002 and is
-- deliberately never readable by anon or authenticated: view counts are
-- analytics, not user-facing data.
