-- RLS group 4: listing writes, listing_images, agent_profiles.
--
-- Ownership: an agent mutates only their own rows. The public read policies
-- from 0002 (approved listings, verified agent profiles, images of approved
-- listings) are untouched — anonymous browsing must not regress.
--
-- The recurring shape in this migration is that the column grant, not the row
-- predicate, is what prevents privilege escalation. An agent legitimately owns
-- their listing row, so a row-level policy alone would happily let them set
-- status = 'approved' and publish without moderation. Ownership answers "which
-- rows", the grant answers "which columns", and both are required.

-- ---------------------------------------------------------------- listings

-- An agent sees all of their own listings regardless of status. The public
-- policy only exposes approved ones, so without this an agent cannot see their
-- own drafts, rejected or flagged listings.
create policy "agents_read_own_listings"
on public.listings
for select
to authenticated
using (
  deleted_at is null
  and agent_profile_id = public.current_agent_profile_id()
);

grant insert on public.listings to authenticated;

-- New listings must belong to the caller and must start as drafts.
--
-- The status literal matters: without it an agent could insert a row already
-- marked 'approved' and appear in public search without ever being moderated.
create policy "agents_create_own_draft_listings"
on public.listings
for insert
to authenticated
with check (
  agent_profile_id = public.current_agent_profile_id()
  and status = 'draft'
);

-- Editable content only. Every moderation column is deliberately absent:
-- status, approved_at, approved_by, rejection_reason, flag_reason,
-- dispute_reason, submitted_at, archived_at. agent_profile_id is absent too,
-- so a listing cannot be reassigned to another agent.
grant update (
  amenities, area, bathrooms, bedrooms, city, cover_image_id, description,
  latitude, longitude, price_naira, property_type, slug, state, title,
  updated_at, video_url
) on public.listings to authenticated;

create policy "agents_update_own_listings"
on public.listings
for update
to authenticated
using (
  deleted_at is null
  and agent_profile_id = public.current_agent_profile_id()
)
with check (
  deleted_at is null
  and agent_profile_id = public.current_agent_profile_id()
);

-- ---------------------------------------------------------- listing_images

create policy "agents_read_own_listing_images"
on public.listing_images
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.listings l
    where l.id = listing_images.listing_id
      and l.agent_profile_id = public.current_agent_profile_id()
  )
);

grant insert on public.listing_images to authenticated;

create policy "agents_add_own_listing_images"
on public.listing_images
for insert
to authenticated
with check (
  exists (
    select 1
    from public.listings l
    where l.id = listing_images.listing_id
      and l.agent_profile_id = public.current_agent_profile_id()
  )
);

-- Reordering and cover selection only. storage_path and public_url are absent:
-- those are derived server-side from the object that actually exists in the
-- bucket, and letting an agent rewrite them would undo that verification.
grant update (is_cover, position) on public.listing_images to authenticated;

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
  )
)
with check (
  exists (
    select 1
    from public.listings l
    where l.id = listing_images.listing_id
      and l.agent_profile_id = public.current_agent_profile_id()
  )
);

-- ---------------------------------------------------------- agent_profiles

grant insert on public.agent_profiles to authenticated;

create policy "users_create_own_agent_profile"
on public.agent_profiles
for insert
to authenticated
with check (user_id = public.current_app_user_id());

-- Public-facing identity only.
--
-- verification_status, verified_at, verified_by, founding_agent,
-- free_listing_quota, rejection_reason and suspension_reason are all absent.
-- Any of them would be a self-grant: an agent who can write verification_status
-- can verify themselves, and one who can write free_listing_quota can mint
-- unlimited submission slots.
grant update (bio, display_name, updated_at) on public.agent_profiles
  to authenticated;

create policy "agents_update_own_profile"
on public.agent_profiles
for update
to authenticated
using (
  deleted_at is null
  and user_id = public.current_app_user_id()
)
with check (
  deleted_at is null
  and user_id = public.current_app_user_id()
);
