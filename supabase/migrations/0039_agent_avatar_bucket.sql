-- ---------------------------------------------------------------------------
-- The agent avatar bucket.
--
-- ===========================================================================
-- NO REVIEW QUEUE, AND WHY THAT IS NOT A GAP
-- ===========================================================================
--
-- An avatar goes live on upload. Agents will mostly use a business logo, which
-- makes no identity claim at all — the tick is what claims identity, and the
-- tick is already gated on documents and admin review. Putting a picture of a
-- shop front behind a queue would add a wait to the one part of the profile
-- that is purely presentational, and the wait would land on every agent to
-- catch the rare one.
--
-- The control is removal, not approval. Admins can clear an avatar, which is
-- the same shape listing moderation already uses: flagging exists there
-- precisely because approval is not the only control available.
--
-- ===========================================================================
-- ADR-033, NO EXCEPTIONS
-- ===========================================================================
--
-- Private bucket, signed reads, size and MIME limits at the bucket rather than
-- only in the upload form, opaque uuidv7 object names. An application check is
-- bypassed by anything that talks to storage directly; a bucket limit is not.
--
-- 2 MB rather than the 10 MB listing images get. An avatar renders at about
-- 96px in a circle. The gap between what that needs and what a phone camera
-- produces is entirely upload time on a Nigerian mobile connection, and the
-- agents this is for are on exactly that connection.
--
-- Path convention: avatars/<agent_profile_id>/<uuidv7>.<ext>, so
-- (storage.foldername(name))[2] is the owning profile, matching the two
-- existing buckets.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agent-avatars',
  'agent-avatars',
  false,
  2097152,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------------ reads
--
-- Mirrors the row policy on the profile itself: an avatar is readable by the
-- public exactly when the profile is, which is when the agent is verified and
-- undeleted. An unverified agent's page is visible to nobody but themselves,
-- and neither is their picture.
create policy "public_read_verified_agent_avatars"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'agent-avatars'
  and exists (
    select 1
    from public.agent_profiles ap
    where ap.id::text = (storage.foldername(name))[2]
      and ap.deleted_at is null
      and ap.verification_status = 'verified'
  )
);

-- An agent reads their own avatar whatever their verification status, so the
-- preview on /agent/account works before they are verified.
create policy "agents_read_own_avatar"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'agent-avatars'
  and (storage.foldername(name))[2] = public.current_agent_profile_id()::text
);

create policy "admins_read_all_agent_avatars"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'agent-avatars'
  and public.current_user_has_role('admin')
);

-- ----------------------------------------------------------------- writes
--
-- Into your own folder and nowhere else. No verification gate: an unverified
-- agent may set up their profile while waiting, and nobody can see it.
create policy "agents_upload_own_avatar"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'agent-avatars'
  and (storage.foldername(name))[2] = public.current_agent_profile_id()::text
);

-- Replacing a picture is deleting the old object. Scoped identically, so an
-- agent can only ever remove their own.
create policy "agents_delete_own_avatar"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'agent-avatars'
  and (storage.foldername(name))[2] = public.current_agent_profile_id()::text
);

create policy "admins_delete_any_agent_avatar"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'agent-avatars'
  and public.current_user_has_role('admin')
);

-- ---------------------------------------------------------------------------
-- The pointer.
--
-- avatar_path is writable by its owner, alongside the two columns 0013 already
-- scoped. It is a path into a bucket whose policies confine the agent to their
-- own folder, so the worst a crafted write achieves is pointing at an object
-- they could already read.
-- ---------------------------------------------------------------------------
grant update (avatar_path) on public.agent_profiles to authenticated;
