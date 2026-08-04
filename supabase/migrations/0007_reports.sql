create type public.report_target_type as enum (
  'listing',
  'agent',
  'message'
);

create type public.report_status as enum (
  'open',
  'under_review',
  'resolved',
  'dismissed'
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references public.users(id),
  target_type public.report_target_type not null,
  target_id uuid not null,
  reason text not null check (char_length(trim(reason)) > 0),
  status public.report_status not null default 'open',
  resolution_notes text,
  resolved_by uuid references public.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index reports_reporter_user_id_idx on public.reports (reporter_user_id);
create index reports_target_type_target_id_idx on public.reports (target_type, target_id);
create index reports_status_idx on public.reports (status);

create trigger set_reports_updated_at
before update on public.reports
for each row
execute function public.set_updated_at();

alter table public.reports enable row level security;
