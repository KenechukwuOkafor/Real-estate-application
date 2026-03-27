-- Public listing RLS policy snapshot.
-- Keep this file aligned with supabase/migrations/0002_public_listing_policies.sql.

grant usage on schema public to anon, authenticated;

grant select on public.agent_profiles to anon, authenticated;
grant select on public.listings to anon, authenticated;
grant select on public.listing_images to anon, authenticated;
grant insert on public.listing_views to anon, authenticated;

create policy "public_can_read_verified_agent_profiles"
on public.agent_profiles
for select
to anon, authenticated
using (
  deleted_at is null
  and verification_status = 'verified'
);

create policy "public_can_read_approved_listings"
on public.listings
for select
to anon, authenticated
using (
  deleted_at is null
  and status = 'approved'
);

create policy "public_can_read_images_for_approved_listings"
on public.listing_images
for select
to anon, authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.listings
    where public.listings.id = public.listing_images.listing_id
      and public.listings.deleted_at is null
      and public.listings.status = 'approved'
  )
);

create policy "public_can_track_views_for_approved_listings"
on public.listing_views
for insert
to anon, authenticated
with check (
  exists (
    select 1
    from public.listings
    where public.listings.id = public.listing_views.listing_id
      and public.listings.deleted_at is null
      and public.listings.status = 'approved'
  )
);
