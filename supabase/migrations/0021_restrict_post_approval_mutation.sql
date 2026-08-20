-- ---------------------------------------------------------------------------
-- An approved listing is not a workspace object.
--
-- Ruvo's proposition is that a moderator reviewed what a seeker sees. That
-- guarantee was false. Verified by attempt, as the owning agent through their
-- own credentials — not by reading the policy — EVERY column granted to
-- `authenticated` was mutable on an approved listing, and on a flagged one:
--
--   amenities, area, bathrooms, bedrooms, city, cover_image_id, description,
--   latitude, longitude, price_naira, property_type, rental_duration, slug,
--   state, title, video_url          (16 of 16, none refused)
--   listing_images.is_cover, position (2 of 2, none refused)
--
-- The service layer refuses all of this. The database did not, and the service
-- layer is not the boundary: the anon key ships in the browser bundle by
-- design and the agent's own Clerk token sits beside it, so any agent could
-- reach PostgREST directly.
--
-- Concretely: get approved at ₦280,000, then set ₦999,999. That is the exact
-- bait-and-switch this product exists to prevent. `slug` is mutable too, so a
-- shared link could be broken after the fact. And on a FLAGGED listing — the
-- state that exists precisely to freeze something under investigation — an
-- agent could rewrite the description and reorder the photographs while a
-- moderator looked at it.
--
-- THE PREDICATE BELONGS ON THE POLICY, NOT ON THE GRANT. This is the same
-- lesson as `listing_images.deleted_at` in 0020, arriving from the other
-- direction. There, a column grant could not express "only while this is a
-- draft", so the write was escalated into a function. Here the columns are
-- already granted and correctly so — they are content — and what was missing
-- was the row predicate saying WHICH rows that content may be written to.
-- Ownership answers "whose"; status answers "still yours to change".
--
-- Draft and rejected only, matching src/features/listings/editability.ts and
-- the write guard that reads it. Deliberately not widened:
--   pending_review  sits in a queue; editing changes what is being reviewed
--   approved        is live inventory a seeker may already have acted on
--   flagged         is where editing the evidence is the whole risk
--   under_dispute   is under investigation
--   archived        is finished
--
-- Moderation is unaffected and this was confirmed rather than assumed:
-- admin-service performs every transition on getSupabaseAdminClient(), the
-- service-role client, which bypasses RLS entirely. Submit-for-review reads
-- with the agent's client but writes status with the admin client, so it is
-- unaffected too. Image registration already refuses anything that is not a
-- draft or rejection before it writes, so it only ever touches rows these
-- policies still permit.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------- listings

drop policy if exists "agents_update_own_listings" on public.listings;

create policy "agents_update_own_listings"
on public.listings
for update
to authenticated
using (
  deleted_at is null
  and agent_profile_id = public.current_agent_profile_id()
  and status in ('draft', 'rejected')
)
with check (
  deleted_at is null
  and agent_profile_id = public.current_agent_profile_id()
  -- Also on the resulting row. `status` is not granted to agents, so this
  -- cannot currently differ from the USING clause — but if it were ever
  -- granted, its absence here would let an agent move a listing INTO an
  -- editable state and edit it in the same statement.
  and status in ('draft', 'rejected')
);

-- ---------------------------------------------------------- listing_images

drop policy if exists "agents_reorder_own_listing_images" on public.listing_images;

create policy "agents_reorder_own_listing_images"
on public.listing_images
for update
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.listings l
    where l.id = listing_images.listing_id
      and l.agent_profile_id = public.current_agent_profile_id()
      and l.status in ('draft', 'rejected')
  )
)
with check (
  exists (
    select 1
    from public.listings l
    where l.id = listing_images.listing_id
      and l.agent_profile_id = public.current_agent_profile_id()
      and l.status in ('draft', 'rejected')
  )
);

-- public.remove_listing_image is unaffected: it is SECURITY DEFINER, so it does
-- not consult these policies, and it already refuses anything that is not a
-- draft or a rejection.

-- ------------------------------------------------------- one cover, at most
--
-- Found by the same probe: two images of one listing could both carry
-- is_cover, because nothing ever said they could not. The flag is a
-- denormalisation of listings.cover_image_id, and two rows claiming to be the
-- cover means anything reading the flag rather than the pointer can disagree
-- with anything reading the pointer.
--
-- Partial, on two axes. `where is_cover` so the many non-cover rows are not
-- forced unique. `and deleted_at is null` so a removed cover does not block its
-- replacement — remove_listing_image clears the flag before promoting, but a
-- soft-deleted row keeping the flag would otherwise be a permanent obstruction.
create unique index listing_images_one_cover_per_listing
  on public.listing_images (listing_id)
  where is_cover and deleted_at is null;

-- ------------------------------------------- a removed image frees its slot
--
-- Found by writing the test for the sequence above: remove a photo, then upload
-- a replacement, and the upload fails with
--
--   duplicate key value violates unique constraint
--   "listing_images_listing_id_position_key"
--
-- The removal is a SOFT delete, so the row keeps its (listing_id, position) and
-- the slot stays occupied forever. The client numbers uploads from zero, so the
-- very next upload after removing the first photo collides. That makes the
-- removal feature shipped one migration ago unusable in the obvious sequence:
-- take the wrong photo out, put the right one in.
--
-- The constraint from 0001 was written before anything could be soft-deleted.
-- It becomes a partial unique index so it constrains what is actually there —
-- a deleted row is not a photograph in a position, it is a record that one used
-- to be.
alter table public.listing_images
  drop constraint if exists listing_images_listing_id_position_key;

create unique index listing_images_live_position_per_listing
  on public.listing_images (listing_id, position)
  where deleted_at is null;
