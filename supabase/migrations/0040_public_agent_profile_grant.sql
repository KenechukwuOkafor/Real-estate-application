-- ---------------------------------------------------------------------------
-- What anon may read on agent_profiles, now that there is a page to read it.
--
-- 0026 narrowed this from fifteen columns to three. Fifteen was not a decision
-- — it was `grant select on public.agent_profiles to anon`, and nobody had
-- ever read the list. The rule that replaced it is that every column is added
-- by name with a reason, and that a hypothetical future use is not one.
--
-- BEFORE (0026):  id, display_name, verification_status
-- AFTER:          id, display_name, verification_status,
--                 handle, bio, avatar_path, verified_at
--
-- Each addition, and what renders it:
--
--   handle        The URL. /a/<handle> cannot resolve without it, and it is
--                 the only column the route filters on.
--
--   bio           The agent's own words about their focus and service area.
--                 Already written by agents through /agent/profile and read
--                 by NOBODY — granted to authenticated in 0027 for the edit
--                 form, rendered on no public surface. This grant is what
--                 gives it a reader.
--
--   avatar_path   The storage path the page mints a signed URL from. Not a
--                 URL and never rendered as one; the bucket is private and
--                 its read policy is the actual boundary (0039).
--
--   verified_at   "Verified since March 2026". 0026 named this exactly:
--                 "the one remaining column a public surface has a plausible
--                 future use for — agent tenure — but it is not rendered
--                 today and a grant for a hypothetical is how this list grew
--                 in the first place. Granting it later is one line."
--
--                 This is later, and this is the line. Tenure is one of the
--                 few things on the page a new account cannot manufacture,
--                 which is the whole reason the page exists.
--
-- STILL WITHHELD, and why the page does not need them:
--
--   free_listing_quota          commercially theirs; 0037 took it off
--                               `authenticated` too, having measured the leak
--   rejection_reason            a moderator's private assessment of a person
--   suspension_reason           the same, and still has no reader anywhere
--   user_id, verified_by        internal identifiers; the page joins on id
--   founding_agent              not rendered, and would be a badge nobody
--                               decided to award in public
--   verification_submitted_at   the date they applied is not the date they
--                               were trusted; verified_at is the honest one
--   created_at, updated_at      "member since" would be a second, weaker
--                               tenure signal competing with verified_at,
--                               and updated_at leaks editing activity
--   deleted_at                  NOT granted, and the page must therefore not
--                               filter on it. The row policy already excludes
--                               deleted profiles, and Postgres refuses a
--                               WHERE on a column the caller cannot SELECT —
--                               so a defensive .is("deleted_at", null) here
--                               would fail the query outright rather than
--                               being harmlessly redundant.
--
-- No revoke first. 0026 already replaced the table-wide grant with a column
-- list, so this adds to a column grant rather than sitting inert beside a
-- table-wide one — which is the mistake ADR-010-A1 records and 0026 and 0027
-- both opened by avoiding.
-- ---------------------------------------------------------------------------

grant select (handle, bio, avatar_path, verified_at)
  on public.agent_profiles to anon;

-- `authenticated` reads the same public page. It already holds bio; handle,
-- avatar_path and verified_at are new to it as well, and carry exactly the
-- reasons above.
grant select (handle, avatar_path, verified_at)
  on public.agent_profiles to authenticated;

comment on table public.agent_profiles is
  'Column-scoped for anon (0026, 0040) and authenticated (0027, 0037, 0040). anon reads seven columns, all rendered by /a/<handle> or a listing card. rejection_reason and free_listing_quota reach their own agent through own_agent_rejection_reason() and own_agent_free_listing_quota(); suspension_reason has no reader outside service_role. handle is readable by everyone and writable by nobody but service_role — it is assigned by trigger (0038), because an insert grant on it is a squatting surface. Widening any of this is a deliberate edit here.';
