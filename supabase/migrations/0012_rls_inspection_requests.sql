-- RLS group 3: inspection_requests.
--
-- REB-ARCH-004: seekers read their own; agents read those for their own
-- listings. Nobody else, including other agents.

grant select on public.inspection_requests to authenticated;

-- Both parties to the request, and only them.
create policy "parties_read_own_inspection_requests"
on public.inspection_requests
for select
to authenticated
using (
  deleted_at is null
  and (
    requester_user_id = public.current_app_user_id()
    or agent_profile_id = public.current_agent_profile_id()
  )
);

-- Only the owning agent may respond, and only these columns are grantable.
--
-- The column list is the security boundary here, not the policy predicate.
-- RLS evaluates rows, not columns, so a requester holding UPDATE on `status`
-- could accept their own inspection request. They are granted nothing, so the
-- accept path is unreachable for them regardless of any row they can see.
--
-- REB-ARCH-004: "Cannot modify requester information." requester_user_id,
-- listing_id and agent_profile_id are all deliberately absent.
grant update (status, responded_at, updated_at) on public.inspection_requests
  to authenticated;

create policy "owning_agent_responds_to_inspection_requests"
on public.inspection_requests
for update
to authenticated
using (
  deleted_at is null
  and agent_profile_id = public.current_agent_profile_id()
)
with check (
  deleted_at is null
  and agent_profile_id = public.current_agent_profile_id()
);

-- No INSERT policy, deliberately.
--
-- requestInspection writes three rows with no transaction: the request, the
-- chat, and the backlink from request to chat. The chat is created on behalf
-- of both parties, so the seeker's own credentials are the wrong authority
-- for it, and a half-applied sequence under RLS would strand a request with
-- no conversation. Creation stays a service-role escalation; reads and the
-- agent's response are enforced here.
