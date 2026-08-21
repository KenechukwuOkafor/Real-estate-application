-- ---------------------------------------------------------------------------
-- Fields a client should never set, on the write path that could still set them.
--
-- 0027 closed this shape on agent_profiles. The audit that followed found it is
-- general: every table with an INSERT grant except that one held it table-wide,
-- because nobody checks INSERT. The escalation story is always told about
-- CHANGING a value, and it does not occur to anyone that the row can arrive
-- already claiming it.
--
-- Most policies do constrain the payload, so this migration covers the three
-- where a client could write something only the system should — plus the
-- cheaper integrity fixes that are free in the same pass.
--
-- Not covered, deliberately: listings.status is already pinned by
-- agents_create_own_draft_listings' WITH CHECK to 'draft', which is a real
-- database constraint and not a convention. It stays as it is.
-- ===========================================================================
-- 1. listing_views.viewer_user_id — fabricated evidence about a person.
-- ===========================================================================
--
-- anon held INSERT on every column, and the policy only checks that the
-- listing is approved. So an UNAUTHENTICATED caller could write
-- `viewer_user_id = <any real user>`: a record asserting that a named person
-- looked at a named property. Proven against this database as anon.
--
-- Analytics poisoning is the smaller half. Ruvo holds these people's identity
-- documents, and a housing search is not a neutral fact about someone — a
-- forged trail of who was looking at what is evidence about an individual that
-- nobody can distinguish from the real thing.
--
-- Constraining it is not enough, because a constraint is only as good as the
-- next policy edit. The column becomes unwritable and system-supplied instead:
-- the caller cannot name anyone, and the database names the caller. An
-- anonymous session resolves to NULL, which is the honest record of an
-- anonymous view.
-- ---------------------------------------------------------------------------
alter table public.listing_views
  alter column viewer_user_id set default public.current_app_user_id();

revoke insert on public.listing_views from anon, authenticated;

-- Everything a view beacon legitimately reports. viewer_user_id is absent, and
-- id and created_at have defaults.
grant insert (listing_id, session_id, ip_hash, user_agent, referrer)
  on public.listing_views to anon, authenticated;

comment on column public.listing_views.viewer_user_id is
  'System-supplied, never client-supplied: defaults to current_app_user_id() and INSERT is not granted on it. anon resolves to NULL. Forging attribution would mean asserting that a named person viewed a named property.';

-- ===========================================================================
-- 2. reports — moderation outcomes written by the person being moderated.
-- ===========================================================================
--
-- authenticated held INSERT on every column and the policy checks only
-- reporter_user_id. A report could therefore arrive with status 'resolved',
-- resolution_notes written by the reporter, and resolved_by naming an admin
-- who never saw it. Proven: status and resolution_notes both landed.
--
-- Moderation records are what you reach for when something has gone wrong. A
-- resolution log containing entries no moderator wrote, indistinguishable from
-- the ones they did, is worse than no log — it is the corruption of the thing
-- that was supposed to be the account of record.
--
-- status keeps its 'open' default, so a filed report starts where it should.
-- ---------------------------------------------------------------------------
revoke insert on public.reports from authenticated;

grant insert (reason, reporter_user_id, target_id, target_type)
  on public.reports to authenticated;

comment on table public.reports is
  'status, resolution_notes, resolved_by and resolved_at are system-set: INSERT is granted on the four columns a reporter supplies, and UPDATE on none. A moderation record must contain only what moderators wrote.';

-- ===========================================================================
-- 3. verification_documents.storage_path — unconstrained, now bounded.
-- ===========================================================================
--
-- The policy tied the row to the agent and said nothing about where the path
-- pointed. The service checks that the object exists under the agent's own
-- prefix, which is the right check in the wrong place: it binds the
-- application, not the database, and PostgREST is reachable without it.
--
-- Paths are uuidv7-based and so impractical to guess, which is why this is a
-- missing constraint rather than a live exploit. It is still the difference
-- between "nobody can find another agent's path" and "another agent's path
-- would be refused".
-- ---------------------------------------------------------------------------
drop policy if exists agents_attach_own_verification_documents
  on public.verification_documents;

create policy agents_attach_own_verification_documents
  on public.verification_documents
  for insert
  to authenticated
  with check (
    agent_profile_id = public.current_agent_profile_id()
    -- Mirrors buildVerificationDocumentPrefix: verification/<agent_profile_id>/…
    and storage_path like 'verification/' || public.current_agent_profile_id()::text || '/%'
  );

revoke insert on public.verification_documents from authenticated;

grant insert (
  agent_verification_submission_id,
  agent_profile_id,
  document_type,
  storage_path,
  mime_type,
  size_bytes,
  original_filename
) on public.verification_documents to authenticated;

-- ===========================================================================
-- 4. The integrity noise, fixed because it is free here.
-- ===========================================================================
--
-- agent_verification_submissions.reviewed_at: writable by the agent being
-- reviewed. Self-defeating rather than an escalation — a non-null value makes
-- requirePendingVerificationState refuse their own approval — but a column
-- meaning "an admin has looked at this" must not be settable by its subject.
--
-- listing_images.is_cover: the one-cover-per-listing flag and
-- listings.cover_image_id are maintained together by updateListingCoverImage.
-- An insert setting the flag directly desynchronises them.
--
-- listings: everything review owns — approved_at, approved_by, submitted_at,
-- archived_at and the four reason columns — plus status, which the WITH CHECK
-- already pins and which createDraftListing leaves to its default anyway.
-- ---------------------------------------------------------------------------
revoke insert on public.agent_verification_submissions from authenticated;
grant insert (agent_profile_id, full_legal_name, notes)
  on public.agent_verification_submissions to authenticated;

revoke insert on public.listing_images from authenticated;
grant insert (listing_id, storage_path, position, width, height, mime_type, size_bytes)
  on public.listing_images to authenticated;

revoke insert on public.listings from authenticated;
grant insert (
  agent_profile_id,
  amenities,
  area,
  bathrooms,
  bedrooms,
  city,
  description,
  latitude,
  longitude,
  price_naira,
  property_type,
  rental_duration,
  slug,
  state,
  sublet_months,
  title
) on public.listings to authenticated;

-- ===========================================================================
-- 5. messages.read_at — a receipt the sender writes about the recipient.
-- ===========================================================================
--
-- 0024 added read receipts and scoped UPDATE on this table to `read_at` alone,
-- with a policy turning on who sent the message, so that only a recipient can
-- mark something read. INSERT was table-wide, so a sender could simply post
-- the message already carrying a read_at.
--
-- This one went unproven through a whole audit for want of a fixture: the seed
-- had no chats, so is_chat_participant() refused every probe, and a refusal
-- for want of a participant is indistinguishable from a refusal for want of a
-- grant. With the seeded conversation in place it is proven — insert
-- succeeded, read_at survived, the sender had marked their own message read on
-- the recipient's behalf.
--
-- INSERT narrows to what sendMessage writes. read_at reverts to being
-- exclusively the recipient's UPDATE, which is what 0024 intended.
-- ---------------------------------------------------------------------------
revoke insert on public.messages from authenticated;
grant insert (chat_id, sender_user_id, body) on public.messages to authenticated;

comment on column public.messages.read_at is
  'Written only by the recipient, through the UPDATE grant from 0024. Not insertable: a sender could otherwise post a message already marked read on the recipient''s behalf.';
