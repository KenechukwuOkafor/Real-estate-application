create extension if not exists citext;
create extension if not exists pgcrypto;

create type public.app_role as enum (
  'student',
  'agent',
  'admin'
);

create type public.listing_status as enum (
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'archived',
  'flagged',
  'under_dispute'
);

create type public.property_type as enum (
  'self_contain',
  '1_bedroom',
  '2_bedroom',
  '3_bedroom',
  'shop',
  'lodge_room'
);

create type public.agent_verification_status as enum (
  'not_submitted',
  'pending_review',
  'verified',
  'rejected',
  'suspended'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  email citext not null,
  full_name text,
  avatar_url text,
  phone_number text,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index users_email_active_idx
  on public.users (email)
  where deleted_at is null;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create index user_roles_user_id_idx on public.user_roles (user_id);
create index user_roles_role_idx on public.user_roles (role);

create table public.agent_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id),
  display_name text not null,
  bio text,
  verification_status public.agent_verification_status not null default 'not_submitted',
  verification_submitted_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references public.users(id),
  rejection_reason text,
  suspension_reason text,
  founding_agent boolean not null default false,
  free_listing_quota integer not null default 0 check (free_listing_quota >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index agent_profiles_verification_status_idx
  on public.agent_profiles (verification_status);

create index agent_profiles_founding_agent_idx
  on public.agent_profiles (founding_agent);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  public_uuid uuid not null unique default gen_random_uuid(),
  agent_profile_id uuid not null references public.agent_profiles(id),
  status public.listing_status not null default 'draft',
  title text not null,
  slug text not null,
  description text not null,
  property_type public.property_type not null,
  price_naira bigint not null check (price_naira > 0),
  bedrooms integer not null check (bedrooms >= 0),
  bathrooms integer not null check (bathrooms >= 0),
  area text not null,
  city text not null default 'Nsukka',
  state text not null default 'Enugu',
  country text not null default 'Nigeria',
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  amenities jsonb not null default '[]'::jsonb,
  video_url text,
  cover_image_id uuid,
  duplicate_fingerprint text,
  rejection_reason text,
  flag_reason text,
  dispute_reason text,
  approved_at timestamptz,
  approved_by uuid references public.users(id),
  submitted_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (agent_profile_id, slug),
  check (property_type <> 'self_contain' or (bedrooms = 1 and bathrooms = 1)),
  check (char_length(trim(title)) > 0),
  check (char_length(trim(description)) > 0),
  check (char_length(trim(area)) > 0)
);

create index listings_agent_profile_id_idx on public.listings (agent_profile_id);
create index listings_status_idx on public.listings (status);
create index listings_property_type_idx on public.listings (property_type);
create index listings_price_naira_idx on public.listings (price_naira);
create index listings_area_idx on public.listings (area);
create index listings_status_city_state_price_id_idx
  on public.listings (status, city, state, price_naira, id);
create index listings_status_property_type_bedrooms_id_idx
  on public.listings (status, property_type, bedrooms, id);
create index listings_approved_at_idx on public.listings (approved_at);
create index listings_deleted_at_idx on public.listings (deleted_at);
create unique index listings_duplicate_fingerprint_active_idx
  on public.listings (duplicate_fingerprint)
  where status in ('pending_review', 'approved', 'flagged', 'under_dispute')
    and deleted_at is null
    and duplicate_fingerprint is not null;

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  storage_path text not null,
  public_url text not null,
  position integer not null check (position >= 0),
  width integer,
  height integer,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (listing_id, position)
);

create index listing_images_listing_id_idx on public.listing_images (listing_id);
create index listing_images_listing_id_is_cover_idx
  on public.listing_images (listing_id, is_cover);

alter table public.listings
  add constraint listings_cover_image_id_fkey
  foreign key (cover_image_id)
  references public.listing_images(id);

create table public.listing_views (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  viewer_user_id uuid references public.users(id),
  session_id text,
  ip_hash text,
  user_agent text,
  referrer text,
  created_at timestamptz not null default now()
);

create index listing_views_listing_id_idx on public.listing_views (listing_id);
create index listing_views_listing_id_created_at_idx
  on public.listing_views (listing_id, created_at);
create index listing_views_viewer_user_id_idx on public.listing_views (viewer_user_id);

create table public.saved_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  listing_id uuid not null references public.listings(id),
  created_at timestamptz not null default now(),
  unique (user_id, listing_id)
);

create index saved_listings_user_id_idx on public.saved_listings (user_id);
create index saved_listings_listing_id_idx on public.saved_listings (listing_id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_type_entity_id_idx
  on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_user_id_idx on public.audit_logs (actor_user_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at);

create trigger set_users_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

create trigger set_agent_profiles_updated_at
before update on public.agent_profiles
for each row
execute function public.set_updated_at();

create trigger set_listings_updated_at
before update on public.listings
for each row
execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.user_roles enable row level security;
alter table public.agent_profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.listing_views enable row level security;
alter table public.saved_listings enable row level security;
alter table public.audit_logs enable row level security;
