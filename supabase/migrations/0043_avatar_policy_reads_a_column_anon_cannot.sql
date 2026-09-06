-- ---------------------------------------------------------------------------
-- A policy that filtered on a column its caller cannot read — and took every
-- public listing image down with it.
--
-- 0039's public_read_verified_agent_avatars was written to mirror the row
-- policy on the profile itself:
--
--   and ap.deleted_at is null
--   and ap.verification_status = 'verified'
--
-- anon holds SELECT on verification_status and NOT on deleted_at. 0040's own
-- comment says exactly this, about exactly this table:
--
--   "Postgres refuses a WHERE on a column the caller cannot SELECT — so a
--    defensive .is('deleted_at', null) here would fail the query outright
--    rather than being harmlessly redundant."
--
-- The rule was written down one migration later and broken one migration
-- earlier, in a policy body rather than an application query, which is why it
-- did not look like the thing the rule was about.
--
-- ===========================================================================
-- THE BLAST RADIUS, WHICH IS THE PART WORTH RECORDING
-- ===========================================================================
--
-- SELECT policies on a table are OR'd, and Postgres evaluates them all. So a
-- policy that RAISES does not merely fail to admit its own rows — it fails the
-- whole statement, including rows another policy would have admitted.
--
-- storage.objects carries every bucket's policies together. The broken avatar
-- policy therefore denied anonymous reads of PROPERTY IMAGES: every listing
-- photo on every public page, from a policy about avatars.
--
-- Caught by an existing test — "an anonymous visitor can read an approved
-- listing's image" — which is a test about a bucket this slice never touched.
-- Nothing in the avatar suite would have found it, because a policy that
-- raises for everyone looks exactly like a policy that admits nobody.
--
-- ===========================================================================
-- THE FIX IS A DELETION, NOT A GRANT
-- ===========================================================================
--
-- deleted_at is withheld from anon deliberately and stays withheld. The clause
-- goes instead, and dropping it loosens nothing: this subquery is not
-- SECURITY DEFINER, so it runs under the caller's own RLS on agent_profiles,
-- and public_can_read_verified_agent_profiles already restricts what it can
-- see to `deleted_at is null and verification_status = 'verified'`. The clause
-- was re-asserting, one level down, a predicate the caller could not escape.
--
-- verification_status stays. It is granted, and it is not redundant for
-- `authenticated`: agents_read_own_profile admits an agent's own unverified
-- row to this subquery, and without the check that agent's unverified avatar
-- would be readable through the PUBLIC policy rather than only through their
-- own. Same outcome for them, wrong reason, and the next person to widen
-- agents_read_own_profile would widen this too.
-- ---------------------------------------------------------------------------

drop policy if exists "public_read_verified_agent_avatars" on storage.objects;

create policy "public_read_verified_agent_avatars"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'agent-avatars'
  and exists (
    select 1
    from public.agent_profiles ap
    where ap.id::text = (storage.foldername(name))[2]
      -- No deleted_at clause. Not an omission: see the header. anon cannot
      -- SELECT that column, and the row policy on agent_profiles already
      -- excludes deleted profiles from everything this subquery can see.
      and ap.verification_status = 'verified'
  )
);
