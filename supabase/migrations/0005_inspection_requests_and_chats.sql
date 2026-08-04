create type public.inspection_status as enum (
  'requested',
  'accepted',
  'declined',
  'expired',
  'cancelled',
  'completed'
);

create type public.chat_type as enum (
  'inspection'
);

create table public.inspection_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  requester_user_id uuid not null references public.users(id),
  agent_profile_id uuid not null references public.agent_profiles(id),
  status public.inspection_status not null default 'requested',
  message text,
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz,
  chat_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index inspection_requests_listing_id_idx
  on public.inspection_requests (listing_id);

create index inspection_requests_requester_user_id_idx
  on public.inspection_requests (requester_user_id);

create index inspection_requests_agent_profile_id_idx
  on public.inspection_requests (agent_profile_id);

create index inspection_requests_status_expires_at_idx
  on public.inspection_requests (status, expires_at);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  type public.chat_type not null,
  listing_id uuid references public.listings(id),
  inspection_request_id uuid unique references public.inspection_requests(id),
  student_user_id uuid not null references public.users(id),
  agent_profile_id uuid not null references public.agent_profiles(id),
  last_message_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index chats_student_user_id_idx on public.chats (student_user_id);
create index chats_agent_profile_id_idx on public.chats (agent_profile_id);
create index chats_listing_id_idx on public.chats (listing_id);
create index chats_last_message_at_idx on public.chats (last_message_at);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id),
  sender_user_id uuid not null references public.users(id),
  body text not null check (char_length(trim(body)) > 0),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index messages_chat_id_idx on public.messages (chat_id);
create index messages_chat_id_created_at_idx
  on public.messages (chat_id, created_at);
create index messages_sender_user_id_idx on public.messages (sender_user_id);

alter table public.inspection_requests
  add constraint inspection_requests_chat_id_fkey
  foreign key (chat_id)
  references public.chats(id);

create trigger set_inspection_requests_updated_at
before update on public.inspection_requests
for each row
execute function public.set_updated_at();

create trigger set_chats_updated_at
before update on public.chats
for each row
execute function public.set_updated_at();

alter table public.inspection_requests enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
