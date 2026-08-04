create type public.subscription_plan as enum (
  'basic',
  'pro',
  'enterprise'
);

create type public.subscription_status as enum (
  'active',
  'expired',
  'cancelled',
  'grace_period'
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  agent_profile_id uuid not null references public.agent_profiles(id),
  plan public.subscription_plan not null,
  status public.subscription_status not null,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  cancelled_at timestamptz,
  provider text not null default 'paystack',
  provider_reference text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index subscriptions_agent_profile_id_idx
  on public.subscriptions (agent_profile_id);

create index subscriptions_status_expires_at_idx
  on public.subscriptions (status, expires_at);

create trigger set_subscriptions_updated_at
before update on public.subscriptions
for each row
execute function public.set_updated_at();

alter table public.subscriptions enable row level security;
