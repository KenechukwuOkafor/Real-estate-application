create table public.agent_verification_submissions (
  id uuid primary key default gen_random_uuid(),
  agent_profile_id uuid not null references public.agent_profiles(id),
  full_legal_name text not null,
  notes text,
  documents jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index agent_verification_submissions_agent_profile_id_idx
  on public.agent_verification_submissions (agent_profile_id);

create index agent_verification_submissions_submitted_at_idx
  on public.agent_verification_submissions (submitted_at desc);

create trigger set_agent_verification_submissions_updated_at
before update on public.agent_verification_submissions
for each row
execute function public.set_updated_at();

alter table public.agent_verification_submissions enable row level security;
