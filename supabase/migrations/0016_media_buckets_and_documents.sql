-- Media storage security.
--
-- Closes BR-MEDIA-003 and BR-SEC-005 (verification documents remain private,
-- both Critical), BR-MEDIA-004 (original filenames are never stored), and
-- BR-MEDIA-006 (a listing that is live always has a cover image, Critical).
--
-- Before this migration there was exactly one bucket, `listing-media`, marked
-- public, with no size limit, no MIME allowlist and no storage policies at all.
-- Every object ever uploaded was world-readable by URL forever — including
-- images on draft and rejected listings that were never approved by anyone.
--
-- REB-ARCH-005 names five buckets. Only the two that something actually writes
-- to are created here; property-videos, profile-images and system-assets are
-- deliberately absent until code exists to fill them.

-- ---------------------------------------------------------------- uuidv7()
--
-- REB-ARCH-005 specifies UUIDv7.ext naming. Postgres 18 ships uuidv7(); this
-- database is 17.6, so it is implemented here. Time-ordered ids keep storage
-- listings and index locality sane, and the random tail prevents guessing an
-- adjacent object's path.
create or replace function public.uuidv7()
returns uuid
language plpgsql
volatile
as $$
declare
  uuid_bytes bytea;
begin
  -- Bytes 0-5: milliseconds since the epoch, big endian. int8send yields 8
  -- bytes; the low 6 are the 48-bit timestamp RFC 9562 asks for.
  uuid_bytes :=
    substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
    || gen_random_bytes(10);

  -- Byte 6 high nibble = version 7 (0x70), low nibble stays random.
  uuid_bytes := set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);

  -- Byte 8 top two bits = RFC 4122 variant (0b10), rest stays random.
  uuid_bytes := set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);

  return encode(uuid_bytes, 'hex')::uuid;
end;
$$;

comment on function public.uuidv7() is
  'RFC 9562 UUIDv7. Postgres 18 has this built in; 17 does not. Used for storage object names per REB-ARCH-005.';

-- ------------------------------------------------------------------ buckets
--
-- Limits live on the bucket, not only in application code. An application
-- check is bypassed by anything that talks to storage directly; a bucket limit
-- is enforced by the storage service itself, which is what the brief means by
-- "refused at the bucket".
--
-- 10 MB per image is REB-ARCH-005's stated maximum.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-images',
  'property-images',
  false,
  10485760,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Government IDs, CAC documents, utility bills. Images and PDF only —
-- never an executable, and the allowlist is the enforcement, not a filter in
-- the upload form.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-documents',
  'verification-documents',
  false,
  10485760,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The original public bucket.
--
-- Nothing was ever uploaded to it: storage.objects was empty at migration time
-- and the seeded listing_images rows carried fabricated paths alongside
-- Unsplash URLs, so there is nothing to move.
--
-- It is neutered rather than dropped, because Supabase installs a
-- protect_delete() trigger that refuses direct DELETE on storage tables —
-- removing a bucket is a Storage API call, not a migration. Flipping it
-- private with an empty MIME allowlist means nothing can be read from it and
-- nothing new can be written to it, which is the security outcome; the empty
-- shell can be removed from the dashboard whenever convenient.
update storage.buckets
set public = false,
    file_size_limit = 0,
    allowed_mime_types = array[]::text[]
where id = 'listing-media';

-- ------------------------------------------------- verification_documents
--
-- ADR-014: media are domain entities with their own UUID and metadata, not
-- attachments. Listings already reference media through listing_images;
-- submissions referenced a jsonb blob of agent-typed strings instead.
--
-- What the blob held: free-text "type|url" pairs the agent typed into a
-- textarea, prefilled with a placeholder. No file ever reached Ruvo — the
-- "documents" were links to wherever the agent happened to host a photo of
-- their government ID. BR-MEDIA-003 and BR-SEC-005 could not be met by any
-- amount of application code, because the data was never ours to protect.
create table public.verification_documents (
  id uuid primary key default public.uuidv7(),
  agent_verification_submission_id uuid not null
    references public.agent_verification_submissions(id),
  -- Denormalised so ownership policies do not have to join through the
  -- submission on every storage and row check.
  agent_profile_id uuid not null references public.agent_profiles(id),
  document_type text not null check (char_length(trim(document_type)) > 0),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  -- Metadata only. BR-MEDIA-004: this must never appear in a storage path or
  -- a URL, and storage_path above is always uuidv7.ext.
  original_filename text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index verification_documents_submission_idx
  on public.verification_documents (agent_verification_submission_id);
create index verification_documents_agent_profile_idx
  on public.verification_documents (agent_profile_id);

alter table public.verification_documents enable row level security;

grant select, insert on public.verification_documents to authenticated;

-- The service role needs it too, and this is not automatic.
--
-- Migration 0010's `grant all on all tables` was a point-in-time statement, so
-- it covered what existed then and nothing added later. This table was created
-- afterwards and landed with no service-role access at all — which breaks the
-- admin verification queue, since that page reads documents through the
-- service-role client to sign them. It fails only in a freshly built
-- environment, which is exactly the failure mode ADR-010-A1 requirement five
-- describes. Migration 0017 adds ALTER DEFAULT PRIVILEGES so the next table
-- does not repeat it.
grant select, insert, update, delete on public.verification_documents to service_role;

create policy "agents_read_own_verification_documents"
on public.verification_documents
for select
to authenticated
using (
  deleted_at is null
  and agent_profile_id = public.current_agent_profile_id()
);

create policy "admins_read_all_verification_documents"
on public.verification_documents
for select
to authenticated
using (public.current_user_has_role('admin'));

create policy "agents_attach_own_verification_documents"
on public.verification_documents
for insert
to authenticated
with check (agent_profile_id = public.current_agent_profile_id());

-- The jsonb column goes. There were zero submissions in the database, so this
-- is a clean cut rather than a migration: nothing is dropped that anyone
-- could have relied on. Had rows existed, the URLs in them pointed outside
-- Ruvo and could not have been moved into a bucket automatically anyway.
alter table public.agent_verification_submissions drop column documents;

-- ------------------------------------------------------- storage policies
--
-- Separate policy sets per bucket, deliberately. A shared set would mean a
-- widening intended for listing images silently applied to government IDs.
--
-- Path conventions these rely on:
--   property-images         listings/<listing_id>/<uuidv7>.<ext>
--   verification-documents  verification/<agent_profile_id>/<uuidv7>.<ext>
--
-- (storage.foldername(name))[2] is therefore the owning entity's id.

-- Anonymous and signed-in visitors may read images belonging to an approved,
-- live listing — and nothing else. This is what lets a public listing page
-- mint signed URLs without the service-role key, and it is what stops a draft
-- or rejected listing's images being readable by anyone but their owner.
create policy "public_read_images_of_approved_listings"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'property-images'
  and exists (
    select 1
    from public.listings l
    where l.id::text = (storage.foldername(name))[2]
      and l.deleted_at is null
      and l.status = 'approved'
  )
);

-- An agent reads their own listing's images at any status, so drafts are
-- previewable while being worked on.
create policy "agents_read_own_listing_images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'property-images'
  and exists (
    select 1
    from public.listings l
    where l.id::text = (storage.foldername(name))[2]
      and l.agent_profile_id = public.current_agent_profile_id()
  )
);

create policy "admins_read_all_listing_images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'property-images'
  and public.current_user_has_role('admin')
);

-- Uploads mirror the application rule: images may only be added to a listing
-- the agent owns, and only while it is editable.
create policy "agents_upload_own_listing_images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'property-images'
  and exists (
    select 1
    from public.listings l
    where l.id::text = (storage.foldername(name))[2]
      and l.agent_profile_id = public.current_agent_profile_id()
      and l.deleted_at is null
      and l.status in ('draft', 'rejected')
  )
);

-- Verification documents: owner and admin only. No anon policy exists, so
-- anonymous access is denied by default deny — BR-MEDIA-003, BR-SEC-005.
create policy "agents_read_own_verification_documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[2] = public.current_agent_profile_id()::text
);

create policy "admins_read_all_verification_documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'verification-documents'
  and public.current_user_has_role('admin')
);

create policy "agents_upload_own_verification_documents"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[2] = public.current_agent_profile_id()::text
);

-- No UPDATE or DELETE policy on either bucket. Media outlives the row that
-- references it (REB-ARCH-005 leaves removal to cleanup jobs), and an agent
-- being able to overwrite an object in place would let them swap an approved
-- image for something unmoderated at the same URL.

-- ------------------------------------------------------------ BR-MEDIA-006
--
-- "Cover image must always exist while a listing is active." Critical, and
-- previously unenforced anywhere: approveListingAsAdmin never checked
-- cover_image_id, and the public mapper simply fell back to the first
-- non-deleted image, so a listing could go live with coverImageUrl null and
-- render a gap.
create or replace function public.assert_active_listing_has_cover()
returns trigger
language plpgsql
as $$
declare
  live_status text;
  live_cover uuid;
  live_deleted timestamptz;
begin
  -- Re-read the row rather than trusting NEW.
  --
  -- This trigger is DEFERRABLE INITIALLY DEFERRED so that the circular
  -- reference between listings.cover_image_id and listing_images.listing_id
  -- can be satisfied within a transaction. But a deferred AFTER trigger fires
  -- at COMMIT carrying the NEW snapshot from when the statement ran — so
  -- NEW.cover_image_id is still null even after a later UPDATE has set it.
  -- Reading the table gives the state that is actually being committed.
  select l.status::text, l.cover_image_id, l.deleted_at
    into live_status, live_cover, live_deleted
  from public.listings l
  where l.id = new.id;

  -- Deleted outright later in the same transaction; nothing to enforce.
  if live_status is null then
    return new;
  end if;

  if live_status = 'approved' and live_deleted is null then
    if live_cover is null then
      raise exception 'LISTING_COVER_REQUIRED'
        using errcode = '23514',
              detail = 'An approved listing must have a cover image (BR-MEDIA-006).';
    end if;

    if not exists (
      select 1
      from public.listing_images li
      where li.id = live_cover
        and li.listing_id = new.id
        and li.deleted_at is null
    ) then
      raise exception 'LISTING_COVER_REQUIRED'
        using errcode = '23514',
              detail = 'The cover image must belong to this listing and not be deleted (BR-MEDIA-006).';
    end if;
  end if;

  return new;
end;
$$;

create constraint trigger listings_require_cover_when_active
after insert or update on public.listings
deferrable initially deferred
for each row
execute function public.assert_active_listing_has_cover();

-- The other half: a cover cannot be soft-deleted out from under a live
-- listing. Without this the trigger above only guards the listings table and
-- the invariant could be broken from listing_images instead.
create or replace function public.assert_cover_not_removed_while_active()
returns trigger
language plpgsql
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if exists (
      select 1
      from public.listings l
      where l.cover_image_id = new.id
        and l.status = 'approved'
        and l.deleted_at is null
    ) then
      raise exception 'LISTING_COVER_REQUIRED'
        using errcode = '23514',
              detail = 'Cannot remove the cover image of an approved listing (BR-MEDIA-006).';
    end if;
  end if;

  return new;
end;
$$;

create trigger listing_images_protect_active_cover
before update on public.listing_images
for each row
execute function public.assert_cover_not_removed_while_active();

-- public_url goes.
--
-- With a private bucket there is no public URL to store. Keeping a column of
-- that name holding a value nobody may use invites exactly the mistake this
-- migration exists to prevent — and the seeded rows proved the point, since
-- they held images.unsplash.com links that were never in our bucket at all.
-- Reads are now signed at render time from storage_path.
alter table public.listing_images drop column public_url;
