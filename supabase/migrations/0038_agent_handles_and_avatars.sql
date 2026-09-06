-- ---------------------------------------------------------------------------
-- The public agent profile: its URL, its picture, and the columns anon may
-- read to render it.
--
-- ===========================================================================
-- THE HANDLE, AND WHY IT IS NOT slug--public_uuid
-- ===========================================================================
--
-- Listings solved shareable identity with `slug--public_uuid`, and that scheme
-- is right for a listing: the link is CLICKED, nobody reads it, and the uuid
-- buys an identity that survives a retitled listing.
--
-- An agent profile link is TYPED, forwarded, and put in a WhatsApp bio, where
-- a stranger reads it while deciding whether this person is real:
--
--   /listings/modern-flat--0198c1f2-3a4b-7c8d-9e0f-1a2b3c4d5e6f   fine
--   /a/prime-homes-nsukka--0198c1f2-3a4b-7c8d-9e0f-1a2b3c4d5e6f   not fine
--
-- 57 characters, unrepeatable aloud, and it looks generated — on the one page
-- whose job is looking legitimate. So the identifier stops being plumbing here
-- and becomes part of the pitch, which is why the listing pattern does not
-- transfer.
--
-- A handle replaces it: unique, derived from the display name ONCE, never
-- re-derived. Derive-once buys the stability the uuid was buying, and buys
-- more of it — a renamed agent keeps prime-homes-nsukka working, where a
-- renamed listing's slug drifts and only the uuid still resolves.
--
-- ===========================================================================
-- WHY THE DATABASE DERIVES IT AND NOT THE APPLICATION
-- ===========================================================================
--
-- `authenticated` holds insert (bio, display_name, user_id) on this table.
-- Adding `handle` to that grant would make the namespace claimable by anyone
-- with a session token and curl: insert a profile with handle 'ruvo', or with
-- a competitor's business name, before they sign up. The application choosing
-- a candidate politely does not matter — 0027 closed a self-verification hole
-- whose whole shape was "the application never does this; PostgREST is
-- exposed".
--
-- So the column is never granted for insert or update, and a BEFORE INSERT
-- trigger assigns it. The caller cannot choose, cannot squat, and cannot
-- rename. That also matches the product decision: a handle that can change is
-- a link that can break, and every pasted URL is in somebody else's message
-- history.
--
-- The shape rules are duplicated in src/features/agents/handle.ts, which the
-- route uses to reject a malformed param without a query. That duplication is
-- pinned by a differential test rather than trusted — see handle-derivation
-- integration.
-- ---------------------------------------------------------------------------

alter table public.agent_profiles
  add column handle text,
  -- Storage path, never a URL. Private bucket, signed reads, opaque uuidv7
  -- name — ADR-033, same as every other media path here.
  add column avatar_path text;

-- ------------------------------------------------------------------ shape
--
-- Enforced by the database rather than only by the trigger, so a service-role
-- write or a later migration cannot introduce a handle the router will not
-- match. Mirrors isWellFormedHandle: 3-30 chars, lowercase alphanumerics in
-- hyphen-separated runs, no leading, trailing or doubled hyphen.
alter table public.agent_profiles
  add constraint agent_profiles_handle_shape
  check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(handle) between 3 and 30);

-- ---------------------------------------------------------------------------
-- Derivation.
--
-- Kept in one function so the trigger and the backfill below cannot disagree —
-- a backfill that slugified differently from the trigger would give the
-- earliest agents handles no later agent could ever be assigned, and nobody
-- would notice until two of them collided.
-- ---------------------------------------------------------------------------
create or replace function public.slugify_agent_handle(display_name text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  with stripped as (
    select trim(
      both '-' from
      regexp_replace(
        lower(
          -- Accents to their base letter, so a name typed with them keeps its
          -- syllables rather than losing whole characters to the filter.
          translate(
            display_name,
            'àáâãäåèéêëìíîïòóôõöùúûüýÿñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝÑÇ',
            'aaaaaaeeeeiiiiooooouuuuyyncAAAAAAEEEEIIIIOOOOOUUUUYNC'
          )
        ),
        '[^a-z0-9]+', '-', 'g'
      )
    ) as slug
  ),
  cut as (
    select
      slug,
      -- Cut at a word boundary when there is one. "nsukka-student-accom" reads
      -- as a typo of the business name; "nsukka-student" reads as a shortening
      -- of it, and only the second gets pasted without explanation.
      case
        when length(slug) <= 30 then slug
        when strpos(reverse(left(slug, 31)), '-') > 0
          then left(slug, 31 - strpos(reverse(left(slug, 31)), '-'))
        else left(slug, 30)
      end as cutslug
    from stripped
  )
  select trim(both '-' from cutslug) from cut;
$$;

comment on function public.slugify_agent_handle(text) is
  'Display name to handle stem. Mirrors slugifyAgentHandle in src/features/agents/handle.ts; the two are pinned together by a differential test, not by hope.';

-- ---------------------------------------------------------------------------
-- Words that must not be somebody''s handle.
--
-- A stranger seeing /a/support or /a/verified draws a conclusion the tick is
-- supposed to earn. "agent" is deliberately absent: nobody reads /a/agent as
-- Ruvo, and it is the fallback stem for a display name with no latin
-- characters at all.
-- ---------------------------------------------------------------------------
create or replace function public.agent_handle_is_reserved(candidate text)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select candidate = any (array[
    'about', 'admin', 'api', 'auth', 'contact', 'dashboard', 'help',
    'listing', 'listings', 'login', 'me', 'new', 'official', 'ruvo',
    'settings', 'signup', 'staff', 'support', 'verified', 'verify'
  ]);
$$;

-- ---------------------------------------------------------------------------
-- Assignment.
--
-- Loops on the unique index rather than reading first. A check-then-insert
-- races two agents registering the same business name in the same second, and
-- the loser gets a duplicate-key error instead of prime-homes-2.
-- ---------------------------------------------------------------------------
create or replace function public.assign_agent_handle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  stem text;
  candidate text;
  n integer := 1;
  suffix text;
  room integer;
begin
  if new.handle is not null then
    -- Only service_role can reach this: the column is granted for neither
    -- insert nor update. A value arriving here is a deliberate admin
    -- reassignment, and it keeps the shape constraint above.
    return new;
  end if;

  stem := public.slugify_agent_handle(coalesce(new.display_name, ''));

  if length(stem) < 3 then
    -- A two-letter business name is real and cannot be a handle on its own.
    -- Appending keeps what the agent actually wrote in the URL.
    stem := left(case when stem = '' then 'agent' else stem || '-homes' end, 30);
  end if;

  loop
    if n = 1 then
      candidate := stem;
    else
      suffix := '-' || n::text;
      room := 30 - length(suffix);
      candidate := trim(both '-' from left(stem, room)) || suffix;
    end if;

    if not public.agent_handle_is_reserved(candidate)
       and not exists (select 1 from public.agent_profiles ap where ap.handle = candidate)
    then
      new.handle := candidate;
      return new;
    end if;

    n := n + 1;

    if n > 1000 then
      raise exception 'could not assign a handle for %', new.display_name;
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------------ backfill
--
-- Row by row through the same function, so existing agents get exactly the
-- handle the trigger would have given them, collisions included.
do $$
declare
  profile record;
  stem text;
  candidate text;
  n integer;
begin
  for profile in
    select id, display_name from public.agent_profiles
    where handle is null order by created_at
  loop
    stem := public.slugify_agent_handle(coalesce(profile.display_name, ''));

    if length(stem) < 3 then
      stem := left(case when stem = '' then 'agent' else stem || '-homes' end, 30);
    end if;

    n := 1;
    loop
      candidate := case
        when n = 1 then stem
        else trim(both '-' from left(stem, 30 - length('-' || n::text))) || '-' || n::text
      end;

      exit when not public.agent_handle_is_reserved(candidate)
        and not exists (select 1 from public.agent_profiles ap where ap.handle = candidate);

      n := n + 1;
    end loop;

    update public.agent_profiles set handle = candidate where id = profile.id;
  end loop;
end;
$$;

alter table public.agent_profiles alter column handle set not null;
create unique index agent_profiles_handle_key on public.agent_profiles (handle);

create trigger assign_agent_handle_before_insert
before insert on public.agent_profiles
for each row execute function public.assign_agent_handle();
