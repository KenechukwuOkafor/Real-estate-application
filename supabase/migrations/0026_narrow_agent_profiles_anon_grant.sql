-- ---------------------------------------------------------------------------
-- Narrowing the anonymous read of agent_profiles to what a public surface
-- actually renders.
--
-- 0010 wrote `grant select on public.agent_profiles to anon, authenticated`.
-- A table-wide grant, so anon held SELECT on all fifteen columns:
--
--   bio, created_at, deleted_at, display_name, founding_agent,
--   free_listing_quota, id, rejection_reason, suspension_reason, updated_at,
--   user_id, verification_status, verification_submitted_at, verified_at,
--   verified_by
--
-- Nobody chose that list. The row predicate,
-- public_can_read_verified_agent_profiles, was written with care and is
-- correct: it exposes only verified, undeleted profiles. Being satisfied with
-- the row answer is exactly what stops anyone reading the column list, which
-- is why a table with a good policy is where an over-wide grant survives
-- longest.
--
-- What it exposed, for any verified agent, to an unauthenticated caller
-- querying PostgREST directly:
--
--   rejection_reason, suspension_reason  a moderator's private assessment of a
--                                        person. Empty today only because no
--                                        moderation has written one; the
--                                        moment one is written it is public.
--   free_listing_quota                   how much inventory the agent has left
--                                        to publish. Commercially theirs.
--   user_id, verified_by                 internal identifiers linking an agent
--                                        to a users row and to the admin who
--                                        reviewed them.
--   bio, created_at, updated_at,         not rendered anywhere public.
--   founding_agent,
--   verification_submitted_at, verified_at
--
-- What public surfaces read is two columns. The listing card takes
-- display_name and verification_status (listings-repository mapListingCard),
-- and the listing detail page renders the same two. `id` stays because the
-- embed joins on it.
--
-- verified_at is deliberately NOT granted. It is the one remaining column a
-- public surface has a plausible future use for — agent tenure, if the card's
-- trust slot ever needs a signal that varies — but it is not rendered today
-- and a grant for a hypothetical is how this list grew in the first place.
-- Granting it later is one line.
--
-- authenticated is deliberately left alone and is NOT fixed by this migration.
-- It holds the same table-wide grant, and it needs most of it: an agent reads
-- their own rejection_reason on /agent/verification, which
-- agents_read_own_profile permits. But its other policy is the same public
-- one, so a signed-in seeker can still read any verified agent's
-- rejection_reason. Closing that means splitting the two reads — the public
-- columns by grant, the agent's own private fields through a function, as
-- 0025 does for users.full_name — which is a larger change than this one and
-- should be decided rather than smuggled in here.
-- ---------------------------------------------------------------------------

-- The table-wide grant must go first. A column grant added alongside a
-- table-wide one is inert, which is its own entry in ADR-010-A1's common
-- mistakes.
revoke select on public.agent_profiles from anon;

grant select (id, display_name, verification_status)
  on public.agent_profiles to anon;

comment on table public.agent_profiles is
  'anon holds SELECT on id, display_name and verification_status only — what a listing card and listing detail page render. Widening it is a deliberate edit here, not a side effect of a table-wide grant. authenticated remains table-wide because an agent reads their own rejection_reason.';
