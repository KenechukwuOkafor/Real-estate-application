-- Local development seed for the public listing slice.
-- Applied by `supabase db reset` after migrations in a local Supabase database.
--
-- clerk_user_id values below are REAL Clerk user ids, not fabricated ones.
-- They must be, because RLS policies compare them against auth.jwt() ->> 'sub'
-- and Clerk will never issue a subject like `seed_clerk_agent_001`. A
-- fabricated id makes every policy match zero rows, which is indistinguishable
-- from a broken policy.
--
-- Regenerate them for a new Clerk instance with:
--   node scripts/setup-clerk-personas.mjs
-- It is idempotent and prints the ids to paste here.

-- One transaction, deliberately.
--
-- listings.cover_image_id and listing_images.listing_id reference each other,
-- so the cover can only be set after the images exist. The BR-MEDIA-006
-- constraint trigger is DEFERRABLE INITIALLY DEFERRED precisely so that
-- intermediate state is legal inside a transaction and checked at COMMIT.
-- Without the explicit BEGIN, psql autocommits each statement and the approved
-- listings would be rejected for having no cover yet.
begin;

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
    'user_3I4mLDbEmYlwFCbJPiDH6QyXGFL',
    'ruvo_student+clerk_test@example.com',
    'Ruvo Student',
    '+2348000000000'
  ),
  (
    '6d5ec8a0-a70a-4974-b8b7-1c833f464001',
    'user_3I4mLJs1bll6JU2Lmw5AVZRGjT6',
    'ruvo_agent_verified+clerk_test@example.com',
    'Prime Homes Nsukka',
    '+2348000000001'
  ),
  (
    '6d5ec8a0-a70a-4974-b8b7-1c833f464002',
    'user_3I4mLIZjqgtiIjofLtGll31QHhz',
    'ruvo_agent_new+clerk_test@example.com',
    'Campus Keys Property',
    '+2348000000002'
  ),
  (
    '6d5ec8a0-a70a-4974-b8b7-1c833f464003',
    'user_3I4mLPZkVF2L6bCWweB2njatjhn',
    'ruvo_admin+clerk_test@example.com',
    'Ruvo Admin',
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
  verification_submitted_at,
  verified_at,
  verified_by,
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
    now() - interval '8 days',
    now() - interval '7 days',
    '6d5ec8a0-a70a-4974-b8b7-1c833f464003',
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
    null,
    null,
    false,
    0
  )
on conflict (user_id) do update
set
  display_name = excluded.display_name,
  bio = excluded.bio,
  verification_status = excluded.verification_status,
  verification_submitted_at = excluded.verification_submitted_at,
  verified_at = excluded.verified_at,
  verified_by = excluded.verified_by,
  founding_agent = excluded.founding_agent,
  free_listing_quota = excluded.free_listing_quota;

-- ---------------------------------------------------------------------------
-- The verification that made agent1 verified.
--
-- agent1 previously sat at verification_status 'verified' with no submission
-- and no documents behind it. That is not a state the product can produce: an
-- agent reaches 'verified' only by submitting documents an admin then
-- approves. Seeding the end state without the evidence meant local testing
-- never exercised the verification gate at all, which is the same masking the
-- comment above describes catching for free_listing_quota.
--
-- It also made a claim untestable. The public copy says agents are reviewed,
-- and validateVerificationSubmissionInput now requires a government ID in the
-- set; a seeded 'verified' agent holding no documents could not demonstrate
-- either. This document set is one the validator accepts, and
-- seed-verification-fixture.test.ts asserts exactly that against this file, so
-- weakening the seed fails the suite rather than passing silently.
--
-- reviewed_at is set, so listVerificationQueue (which filters reviewed_at is
-- null and profile status pending_review) will not surface this submission to
-- an admin as work to do. agent2 stays at 'not_submitted' — a brand-new signup
-- with nothing behind it is the other state that has to stay reachable.
--
-- The storage objects these paths name are uploaded by
-- scripts/seed-listing-media.mjs, for the same reason listing images are: SQL
-- can create rows but not objects, and a private bucket turns a path with
-- nothing behind it into a signed URL that 404s.
-- ---------------------------------------------------------------------------
insert into public.agent_verification_submissions (
  id,
  agent_profile_id,
  full_legal_name,
  notes,
  submitted_at,
  reviewed_at
)
values
  (
    '01920a1b-2c3d-7e4f-8a9b-0c1d2e3fa001',
    'fbbda28e-2358-49c2-ab0a-e472d7db6001',
    'Chinedu Prime Okeke',
    'Seeded submission. Approved by the seeded admin.',
    now() - interval '8 days',
    now() - interval '7 days'
  )
on conflict (id) do update
set
  full_legal_name = excluded.full_legal_name,
  notes = excluded.notes,
  submitted_at = excluded.submitted_at,
  reviewed_at = excluded.reviewed_at;

insert into public.verification_documents (
  id,
  agent_verification_submission_id,
  agent_profile_id,
  document_type,
  storage_path,
  mime_type,
  size_bytes,
  original_filename
)
values
  -- The identity document, required by validateVerificationSubmissionInput.
  -- Without it this agent could not have been verified through the product.
  (
    '01920a1b-2c3d-7e4f-8a9b-0c1d2e3f4001',
    '01920a1b-2c3d-7e4f-8a9b-0c1d2e3fa001',
    'fbbda28e-2358-49c2-ab0a-e472d7db6001',
    'government_id',
    'verification/fbbda28e-2358-49c2-ab0a-e472d7db6001/01920a1b-2c3d-7e4f-8a9b-0c1d2e3f4001.webp',
    'image/webp',
    26,
    'national-id.webp'
  ),
  -- An addition rather than a substitute: it says something about the
  -- business, and on its own it would no longer be accepted.
  (
    '01920a1b-2c3d-7e4f-8a9b-0c1d2e3f4002',
    '01920a1b-2c3d-7e4f-8a9b-0c1d2e3fa001',
    'fbbda28e-2358-49c2-ab0a-e472d7db6001',
    'cac_certificate',
    'verification/fbbda28e-2358-49c2-ab0a-e472d7db6001/01920a1b-2c3d-7e4f-8a9b-0c1d2e3f4002.webp',
    'image/webp',
    26,
    'cac-certificate.webp'
  )
on conflict (id) do update
set
  document_type = excluded.document_type,
  storage_path = excluded.storage_path,
  mime_type = excluded.mime_type,
  size_bytes = excluded.size_bytes,
  original_filename = excluded.original_filename;

insert into public.listings (
  id,
  public_uuid,
  agent_profile_id,
  status,
  title,
  slug,
  description,
  property_type,
  -- All three durations are seeded, deliberately. A seed in which every listing
  -- is yearly cannot show that the card, the detail page or the filter handle
  -- the other two, which is the condition the hardcoded "per year" label
  -- survived in for as long as it did.
  rental_duration,
  sublet_months,
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
    'yearly',
    null,
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
    'monthly',
    null,
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
    'sublet',
    6,
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
  rental_duration = excluded.rental_duration,
  sublet_months = excluded.sublet_months,
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
  position,
  mime_type,
  size_bytes,
  is_cover
)
values
  (
    '40fbc9b0-d821-42d7-bf6e-887a49b3a001',
    '3c719a67-c526-44d2-b9f5-83042d03f001',
    'listings/3c719a67-c526-44d2-b9f5-83042d03f001/01992a10-0001-7000-8000-0000000000a1.webp',
    0,
    'image/webp',
    180000,
    true
  ),
  (
    '40fbc9b0-d821-42d7-bf6e-887a49b3a002',
    '3c719a67-c526-44d2-b9f5-83042d03f001',
    'listings/3c719a67-c526-44d2-b9f5-83042d03f001/01992a10-0002-7000-8000-0000000000a2.webp',
    1,
    'image/webp',
    170000,
    false
  ),
  (
    '40fbc9b0-d821-42d7-bf6e-887a49b3a003',
    '3c719a67-c526-44d2-b9f5-83042d03f001',
    'listings/3c719a67-c526-44d2-b9f5-83042d03f001/01992a10-0003-7000-8000-0000000000a3.webp',
    2,
    'image/webp',
    175000,
    false
  ),
  (
    '40fbc9b0-d821-42d7-bf6e-887a49b3a004',
    '3c719a67-c526-44d2-b9f5-83042d03f002',
    'listings/3c719a67-c526-44d2-b9f5-83042d03f002/01992a10-0004-7000-8000-0000000000a4.webp',
    0,
    'image/webp',
    181000,
    true
  ),
  (
    '40fbc9b0-d821-42d7-bf6e-887a49b3a005',
    '3c719a67-c526-44d2-b9f5-83042d03f002',
    'listings/3c719a67-c526-44d2-b9f5-83042d03f002/01992a10-0005-7000-8000-0000000000a5.webp',
    1,
    'image/webp',
    179000,
    false
  ),
  (
    '40fbc9b0-d821-42d7-bf6e-887a49b3a006',
    '3c719a67-c526-44d2-b9f5-83042d03f002',
    'listings/3c719a67-c526-44d2-b9f5-83042d03f002/01992a10-0006-7000-8000-0000000000a6.webp',
    2,
    'image/webp',
    177000,
    false
  ),
  (
    '40fbc9b0-d821-42d7-bf6e-887a49b3a007',
    '3c719a67-c526-44d2-b9f5-83042d03f003',
    'listings/3c719a67-c526-44d2-b9f5-83042d03f003/01992a10-0007-7000-8000-0000000000a7.webp',
    0,
    'image/webp',
    165000,
    true
  ),
  (
    '40fbc9b0-d821-42d7-bf6e-887a49b3a008',
    '3c719a67-c526-44d2-b9f5-83042d03f003',
    'listings/3c719a67-c526-44d2-b9f5-83042d03f003/01992a10-0008-7000-8000-0000000000a8.webp',
    1,
    'image/webp',
    164000,
    false
  ),
  (
    '40fbc9b0-d821-42d7-bf6e-887a49b3a009',
    '3c719a67-c526-44d2-b9f5-83042d03f003',
    'listings/3c719a67-c526-44d2-b9f5-83042d03f003/01992a10-0009-7000-8000-0000000000a9.webp',
    2,
    'image/webp',
    163000,
    false
  )
on conflict (id) do update
set
  storage_path = excluded.storage_path,
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

commit;
