-- ---------------------------------------------------------------------------
-- Removing a listing image.
--
-- An agent could add a photo and never take it back — a worse position than not
-- being able to add one, since the mistake is permanent and public.
--
-- WHY THIS IS A FUNCTION AND NOT A GRANT. Per ADR-010-A1 the grant is a
-- decision, so here is the decision: `deleted_at` on listing_images is NOT
-- granted to agents, and the act of removal is escalated into this function
-- instead.
--
-- The act itself is content. An agent pruning their own draft is curating their
-- own submission, exactly as `is_cover` and `position` already are. But a COLUMN
-- grant cannot say "only while the listing is still a workspace object", and
-- `agents_reorder_own_listing_images` carries no status predicate — it permits
-- updates to images of ANY listing the agent owns, approved and flagged
-- included. Granting `deleted_at` there would therefore let an agent strip
-- images from live inventory below the three-image minimum with no re-review,
-- and delete images from a FLAGGED listing, which is the evidence flagging
-- exists to preserve.
--
-- So the column stays ungranted and the escalation becomes this function, which
-- re-validates everything and keeps the rules auditable as SQL. Same shape as
-- create_inspection_request_with_chat in 0015, and for the same reason.
--
-- COVER PROMOTION HAPPENS HERE, NOT IN A FOLLOW-UP. Both cover triggers guard
-- only `approved` listings, and removal is permitted only on draft and rejected
-- ones — so neither trigger fires and nothing stops a removal from orphaning
-- `listings.cover_image_id`. That is worse than being stopped: the stale
-- pointer sits quietly until the listing is submitted and an ADMIN clicks
-- approve, at which point the deferred trigger raises LISTING_COVER_REQUIRED.
-- The failure lands days later, on the moderator's action, for something the
-- agent did. Promoting a survivor in the same statement is what prevents that.
--
-- THE STORAGE OBJECT IS LEFT BEHIND, DELIBERATELY, AND THIS IS A REAL COST.
-- The row is soft-deleted and the object stays in the bucket: it matches how
-- everything else here is removed, it keeps the path addressable if a removal
-- needs undoing, and deleting from storage inside a database function would put
-- an irreversible external side effect inside a transaction that can still roll
-- back. But the media cleanup lane that is supposed to reclaim these is
-- specified and NOTHING DRAINS IT, so in practice orphaned objects accumulate
-- against the storage quota with no reclaim path at all. That is a known,
-- accepted cost and not a solved problem. It resolves when a deployment exists
-- for the scheduler to call.
-- ---------------------------------------------------------------------------

create or replace function public.remove_listing_image(target_image_id uuid)
returns table (removed_image_id uuid, new_cover_image_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_profile uuid;
  image_listing_id uuid;
  image_deleted_at timestamptz;
  parent_status text;
  parent_owner uuid;
  parent_cover uuid;
  parent_deleted timestamptz;
  promoted uuid;
begin
  caller_profile := public.current_agent_profile_id();

  if caller_profile is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  select li.listing_id, li.deleted_at
    into image_listing_id, image_deleted_at
  from public.listing_images li
  where li.id = target_image_id;

  -- Already gone, or never existed. The same answer either way: a caller must
  -- not be able to tell one from the other.
  if image_listing_id is null or image_deleted_at is not null then
    raise exception 'LISTING_IMAGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select l.status::text, l.agent_profile_id, l.cover_image_id, l.deleted_at
    into parent_status, parent_owner, parent_cover, parent_deleted
  from public.listings l
  where l.id = image_listing_id;

  -- Not yours reads as not found, matching the RLS policies. An id belonging to
  -- another agent must not reveal that it exists.
  if parent_owner is distinct from caller_profile or parent_deleted is not null then
    raise exception 'LISTING_IMAGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- The same two statuses the edit surface and the write guard use. Not widened
  -- here: an approved listing losing a photo without re-review is the thing the
  -- moderation queue exists to prevent, and a flagged one losing a photo is
  -- evidence disappearing.
  if parent_status not in ('draft', 'rejected') then
    raise exception 'LISTING_STATE_TRANSITION_INVALID' using errcode = '22023';
  end if;

  update public.listing_images
     set deleted_at = now(),
         -- Cleared as well as removed. A soft-deleted row that still claims to
         -- be the cover is a contradiction waiting to be read by something that
         -- filters on is_cover without also filtering on deleted_at.
         is_cover = false
   where id = target_image_id;

  if parent_cover = target_image_id then
    -- Lowest position wins, created_at breaking ties, so promotion is
    -- deterministic rather than whatever the planner returns first.
    select li.id
      into promoted
    from public.listing_images li
    where li.listing_id = image_listing_id
      and li.deleted_at is null
      and li.id <> target_image_id
    order by li.position asc, li.created_at asc
    limit 1;

    -- Null when that was the last image. Legal on a draft; the deferred trigger
    -- refuses it at approval, which is the right place for it to fail.
    update public.listings
       set cover_image_id = promoted
     where id = image_listing_id;

    if promoted is not null then
      update public.listing_images
         set is_cover = true
       where id = promoted;
    end if;
  else
    promoted := parent_cover;
  end if;

  return query select target_image_id, promoted;
end;
$$;

comment on function public.remove_listing_image(uuid) is
  'Soft-deletes one listing image and promotes a replacement cover in the same statement. SECURITY DEFINER because listing_images.deleted_at is deliberately not granted to agents — see 0020. Refuses anything that is not a draft or rejected listing owned by the caller.';

-- Narrow the escalation to exactly who needs it. `public` includes `anon`.
revoke all on function public.remove_listing_image(uuid) from public;
grant execute on function public.remove_listing_image(uuid) to authenticated;
