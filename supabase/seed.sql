-- Local development seed for the public listing slice.
-- Applied by `supabase db reset` after migrations in a local Supabase database.

insert into public.users (
  id,
  clerk_user_id,
  email,
  full_name,
  phone_number
)
values
  (
    '6d5ec8a0-a70a-4974-b8b7-1c833f464000',
    'seed_clerk_student_001',
    'student1@ruvo.local',
    'Ruvo Student One',
    '+2348000000000'
  ),
  (
    '6d5ec8a0-a70a-4974-b8b7-1c833f464001',
    'seed_clerk_agent_001',
    'agent1@ruvo.local',
    'Prime Homes Nsukka',
    '+2348000000001'
  ),
  (
    '6d5ec8a0-a70a-4974-b8b7-1c833f464002',
    'seed_clerk_agent_002',
    'agent2@ruvo.local',
    'Campus Keys Property',
    '+2348000000002'
  ),
  (
    '6d5ec8a0-a70a-4974-b8b7-1c833f464003',
    'seed_clerk_admin_001',
    'admin1@ruvo.local',
    'Ruvo Admin One',
    '+2348000000003'
  )
on conflict (clerk_user_id) do nothing;

insert into public.user_roles (
  id,
  user_id,
  role
)
values
  (
    '1dd56053-7f52-43da-90f3-6c9dd1f4c000',
    '6d5ec8a0-a70a-4974-b8b7-1c833f464000',
    'student'
  ),
  (
    '1dd56053-7f52-43da-90f3-6c9dd1f4c001',
    '6d5ec8a0-a70a-4974-b8b7-1c833f464001',
    'agent'
  ),
  (
    '1dd56053-7f52-43da-90f3-6c9dd1f4c002',
    '6d5ec8a0-a70a-4974-b8b7-1c833f464002',
    'agent'
  ),
  (
    '1dd56053-7f52-43da-90f3-6c9dd1f4c003',
    '6d5ec8a0-a70a-4974-b8b7-1c833f464003',
    'admin'
  )
on conflict (user_id, role) do nothing;

insert into public.agent_profiles (
  id,
  user_id,
  display_name,
  bio,
  verification_status,
  verified_at,
  founding_agent,
  free_listing_quota
)
-- Two deliberately different agent states.
--
-- agent1 is the normal working agent: verified, holding the same 3 submission
-- slots that approving a verification actually grants
-- (VERIFIED_AGENT_LISTING_QUOTA in src/server/policies/listing-entitlement.ts).
--
-- agent2 is a brand-new signup: an agent role, a minimal profile, no
-- verification, no slots. Nothing in the product can move them forward except
-- submitting verification and having an admin approve it.
--
-- Both previously sat at verification_status 'verified' with quota 20, which
-- meant local testing never met the gates a real new agent hits first. That
-- masked the entitlement break: the codebase had no path to raise quota above
-- its default of 0, but no seeded agent ever needed one.
values
  (
    'fbbda28e-2358-49c2-ab0a-e472d7db6001',
    '6d5ec8a0-a70a-4974-b8b7-1c833f464001',
    'Prime Homes Nsukka',
    'Verified agent focused on student rentals.',
    'verified',
    now(),
    false,
    3
  ),
  (
    'fbbda28e-2358-49c2-ab0a-e472d7db6002',
    '6d5ec8a0-a70a-4974-b8b7-1c833f464002',
    'Campus Keys Property',
    null,
    'not_submitted',
    null,
    false,
    0
  )
on conflict (user_id) do update
set
  display_name = excluded.display_name,
  bio = excluded.bio,
  verification_status = excluded.verification_status,
  verified_at = excluded.verified_at,
  founding_agent = excluded.founding_agent,
  free_listing_quota = excluded.free_listing_quota;

insert into public.listings (
  id,
  public_uuid,
  agent_profile_id,
  status,
  title,
  slug,
  description,
  property_type,
  price_naira,
  bedrooms,
  bathrooms,
  area,
  city,
  state,
  country,
  latitude,
  longitude,
  amenities,
  approved_at,
  submitted_at
)
values
  (
    '3c719a67-c526-44d2-b9f5-83042d03f001',
    '20887cbf-53fc-4c45-adb2-c5d4d33cf001',
    'fbbda28e-2358-49c2-ab0a-e472d7db6001',
    'approved',
    'Clean Self Contain in Odenigbo',
    'clean-self-contain-odenigbo',
    'Bright self contain with tiled floor, borehole water, prepaid meter, and easy access to campus transport routes.',
    'self_contain',
    280000,
    1,
    1,
    'Odenigbo',
    'Nsukka',
    'Enugu',
    'Nigeria',
    6.856100,
    7.392200,
    '["water","prepaid_meter","tiled_floor"]'::jsonb,
    now(),
    now()
  ),
  (
    '3c719a67-c526-44d2-b9f5-83042d03f002',
    '20887cbf-53fc-4c45-adb2-c5d4d33cf002',
    -- Owned by agent1. agent2 is unverified, and
    -- public_can_read_verified_agent_profiles hides unverified profiles, so
    -- parking public inventory under agent2 would break seeker browsing.
    'fbbda28e-2358-49c2-ab0a-e472d7db6001',
    'approved',
    'Two Bedroom Flat at Hilltop',
    'two-bedroom-flat-hilltop',
    'Well-ventilated two bedroom apartment with POP ceiling, wardrobe space, and accessible road network.',
    '2_bedroom',
    750000,
    2,
    2,
    'Hilltop',
    'Nsukka',
    'Enugu',
    'Nigeria',
    6.857400,
    7.401100,
    '["wardrobe","pop_ceiling","balcony"]'::jsonb,
    now(),
    now()
  ),
  (
    '3c719a67-c526-44d2-b9f5-83042d03f003',
    '20887cbf-53fc-4c45-adb2-c5d4d33cf003',
    'fbbda28e-2358-49c2-ab0a-e472d7db6001',
    'approved',
    'Lodge Room Close to UNN Gate',
    'lodge-room-close-to-unn-gate',
    'Student-friendly lodge room with security gate, stable water supply, and short walking distance to transport.',
    'lodge_room',
    180000,
    1,
    1,
    'UNN Gate',
    'Nsukka',
    'Enugu',
    'Nigeria',
    6.859000,
    7.398000,
    '["security","water","near_campus"]'::jsonb,
    now(),
    now()
  )
on conflict (id) do update
set
  -- Included so re-seeding an existing database moves ownership too, rather
  -- than needing a full `supabase db reset`.
  agent_profile_id = excluded.agent_profile_id,
  title = excluded.title,
  slug = excluded.slug,
  description = excluded.description,
  property_type = excluded.property_type,
  price_naira = excluded.price_naira,
  bedrooms = excluded.bedrooms,
  bathrooms = excluded.bathrooms,
  area = excluded.area,
  city = excluded.city,
  state = excluded.state,
  country = excluded.country,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  amenities = excluded.amenities,
  status = excluded.status,
  approved_at = excluded.approved_at,
  submitted_at = excluded.submitted_at;

insert into public.listing_images (
  id,
  listing_id,
  storage_path,
  public_url,
  position,
  mime_type,
  size_bytes,
  is_cover
)
values
  (
    '40fbc9b0-d821-42d7-bf6e-887a49b3a001',
    '3c719a67-c526-44d2-b9f5-83042d03f001',
    'seed/listings/odenigbo-cover.webp',
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
    0,
    'image/webp',
    180000,
    true
  ),
  (
    '40fbc9b0-d821-42d7-bf6e-887a49b3a002',
    '3c719a67-c526-44d2-b9f5-83042d03f001',
    'seed/listings/odenigbo-2.webp',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80',
    1,
    'image/webp',
    170000,
    false
  ),
  (
    '40fbc9b0-d821-42d7-bf6e-887a49b3a003',
    '3c719a67-c526-44d2-b9f5-83042d03f001',
    'seed/listings/odenigbo-3.webp',
    'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80',
    2,
    'image/webp',
    175000,
    false
  ),
  (
    '40fbc9b0-d821-42d7-bf6e-887a49b3a004',
    '3c719a67-c526-44d2-b9f5-83042d03f002',
    'seed/listings/hilltop-cover.webp',
    'https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=1200&q=80',
    0,
    'image/webp',
    181000,
    true
  ),
  (
    '40fbc9b0-d821-42d7-bf6e-887a49b3a005',
    '3c719a67-c526-44d2-b9f5-83042d03f002',
    'seed/listings/hilltop-2.webp',
    'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&w=1200&q=80',
    1,
    'image/webp',
    179000,
    false
  ),
  (
    '40fbc9b0-d821-42d7-bf6e-887a49b3a006',
    '3c719a67-c526-44d2-b9f5-83042d03f002',
    'seed/listings/hilltop-3.webp',
    'https://images.unsplash.com/photo-1464890100898-a385f744067f?auto=format&fit=crop&w=1200&q=80',
    2,
    'image/webp',
    177000,
    false
  ),
  (
    '40fbc9b0-d821-42d7-bf6e-887a49b3a007',
    '3c719a67-c526-44d2-b9f5-83042d03f003',
    'seed/listings/unn-gate-cover.webp',
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
    0,
    'image/webp',
    165000,
    true
  ),
  (
    '40fbc9b0-d821-42d7-bf6e-887a49b3a008',
    '3c719a67-c526-44d2-b9f5-83042d03f003',
    'seed/listings/unn-gate-2.webp',
    'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80',
    1,
    'image/webp',
    164000,
    false
  ),
  (
    '40fbc9b0-d821-42d7-bf6e-887a49b3a009',
    '3c719a67-c526-44d2-b9f5-83042d03f003',
    'seed/listings/unn-gate-3.webp',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80',
    2,
    'image/webp',
    163000,
    false
  )
on conflict (id) do update
set
  storage_path = excluded.storage_path,
  public_url = excluded.public_url,
  position = excluded.position,
  mime_type = excluded.mime_type,
  size_bytes = excluded.size_bytes,
  is_cover = excluded.is_cover;

update public.listings
set cover_image_id = case id
  when '3c719a67-c526-44d2-b9f5-83042d03f001' then '40fbc9b0-d821-42d7-bf6e-887a49b3a001'::uuid
  when '3c719a67-c526-44d2-b9f5-83042d03f002' then '40fbc9b0-d821-42d7-bf6e-887a49b3a004'::uuid
  when '3c719a67-c526-44d2-b9f5-83042d03f003' then '40fbc9b0-d821-42d7-bf6e-887a49b3a007'::uuid
  else cover_image_id
end
where id in (
  '3c719a67-c526-44d2-b9f5-83042d03f001',
  '3c719a67-c526-44d2-b9f5-83042d03f002',
  '3c719a67-c526-44d2-b9f5-83042d03f003'
);
