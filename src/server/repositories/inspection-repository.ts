import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { blocksNewRequest } from "@/features/inspections/expiry";
import { mapDatabaseSentinel } from "@/server/repositories/sentinels";
import type { Database } from "@/types/database";

type DbClient = SupabaseClient<Database>;

type InspectableListingRow = Pick<
  Database["public"]["Tables"]["listings"]["Row"],
  "agent_profile_id" | "deleted_at" | "id" | "status" | "title"
> & {
  agent_profiles: Pick<Database["public"]["Tables"]["agent_profiles"]["Row"], "user_id"> | null;
};

type InspectionRequestRow = Database["public"]["Tables"]["inspection_requests"]["Row"];
type ChatRow = Database["public"]["Tables"]["chats"]["Row"];
type InspectionRequestWithListingRow = InspectionRequestRow & {
  listings: Pick<Database["public"]["Tables"]["listings"]["Row"], "id" | "title"> | null;
};

export async function getInspectableListingById(
  client: DbClient,
  listingId: string,
) {
  const { data, error } = await client
    .from("listings")
    .select(
      `
        id,
        title,
        status,
        deleted_at,
        agent_profile_id,
        agent_profiles (
          user_id
        )
      `,
    )
    .eq("id", listingId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as unknown as InspectableListingRow | null;
}

export async function findActiveInspectionRequest(
  client: DbClient,
  listingId: string,
  requesterUserId: string,
) {
  /**
   * Candidates first, then the deadline in TypeScript.
   *
   * The expiry rule could be pushed into the query as
   * `or(status.eq.accepted,and(status.eq.requested,expires_at.gt.now))`, and it
   * is deliberately not: the rule about what counts as still-open lives in one
   * module that the inbox and the respond path also read, and a second copy
   * expressed in PostgREST filter syntax is a copy that will drift.
   *
   * The row count here is bounded by one seeker and one listing, so reading a
   * handful and filtering costs nothing.
   */
  const { data, error } = await client
    .from("inspection_requests")
    .select("*")
    .eq("listing_id", listingId)
    .eq("requester_user_id", requesterUserId)
    .in("status", ["requested", "accepted"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const candidates = (data ?? []) as InspectionRequestRow[];

  // An EXPIRED request blocks nothing. Previously it blocked forever: a request
  // an agent simply never answered locked that seeker out of ever asking about
  // that listing again, as a consequence of the agent doing nothing.
  return candidates.find((candidate) => blocksNewRequest(candidate)) ?? null;
}

export type AgentInspectionRequestRow = InspectionRequestRow & {
  /**
   * Named through inspection_requests.chat_id specifically.
   *
   * There are TWO foreign keys between these tables — the request's chat_id and
   * the chat's inspection_request_id — so an unqualified `chats` embed is
   * ambiguous and PostgREST refuses it (PGRST201). Both reach the same row;
   * this one is the direction the request itself records.
   */
  chats: { id: string; last_message_at: string | null } | null;
  listings: { id: string; public_uuid: string; slug: string; title: string } | null;
};

/**
 * Every inspection request addressed to this agent, newest first.
 *
 * Includes expired and answered ones. An inbox that hid them would answer "did
 * anyone ask about this listing" with silence, and the whole reason this
 * surface exists is that an agent currently finds out by noticing a new row in
 * /chats.
 */
export async function listAgentInspectionRequests(
  client: DbClient,
  agentProfileId: string,
) {
  const { data, error } = await client
    .from("inspection_requests")
    .select(
      `
        *,
        listings ( id, title, slug, public_uuid ),
        chats!inspection_requests_chat_id_fkey ( id, last_message_at )
      `,
    )
    .eq("agent_profile_id", agentProfileId)
    .is("deleted_at", null)
    .order("requested_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as AgentInspectionRequestRow[];
}

export type SeekerInspectionRequestRow = InspectionRequestRow & {
  /** Same two-foreign-key ambiguity as the agent row above. */
  chats: { id: string; last_message_at: string | null } | null;
  /**
   * Wider than the agent's embed, because the seeker's questions are
   * different. The agent already knows which property this is; the seeker
   * needs to know who they asked (`agent_profiles.display_name`) and, when a
   * request goes unanswered, what else is like the flat they wanted — which is
   * what `area` and `property_type` are here for.
   */
  listings:
    | {
        area: string;
        id: string;
        property_type: string;
        public_uuid: string;
        slug: string;
        title: string;
        agent_profiles: { display_name: string } | null;
      }
    | null;
};

/**
 * Every inspection request this seeker has sent, newest first.
 *
 * The mirror of listAgentInspectionRequests, and it includes expired and
 * answered ones for the same reason: a seeker's real answer to "did that agent
 * ever reply" lives in the requests that went nowhere. Today they learn an
 * agent accepted by noticing a new conversation, and learn one expired by
 * never hearing anything at all.
 *
 * parties_read_own_inspection_requests already covers this direction —
 * `requester_user_id = current_app_user_id()` — so no policy work was needed,
 * only a query nobody had written.
 */
export async function listSeekerInspectionRequests(
  client: DbClient,
  requesterUserId: string,
) {
  const { data, error } = await client
    .from("inspection_requests")
    .select(
      `
        *,
        listings (
          id,
          title,
          slug,
          public_uuid,
          area,
          property_type,
          agent_profiles ( display_name )
        ),
        chats!inspection_requests_chat_id_fkey ( id, last_message_at )
      `,
    )
    .eq("requester_user_id", requesterUserId)
    .is("deleted_at", null)
    .order("requested_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as SeekerInspectionRequestRow[];
}

/**
 * Unread counts per chat, for the chats given.
 *
 * One grouped read rather than a count per row: an inbox with twenty accepted
 * requests would otherwise issue twenty queries, and the N+1 is the kind that
 * only shows up once an agent is busy enough to care.
 */
export async function countUnreadMessagesByChat(
  client: DbClient,
  chatIds: string[],
  viewerUserId: string,
) {
  const counts = new Map<string, number>();

  if (chatIds.length === 0) {
    return counts;
  }

  const { data, error } = await client
    .from("messages")
    .select("chat_id")
    .in("chat_id", chatIds)
    // Not mine. A message I sent is not one I have failed to read.
    .neq("sender_user_id", viewerUserId)
    .is("read_at", null)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  for (const row of data ?? []) {
    counts.set(row.chat_id, (counts.get(row.chat_id) ?? 0) + 1);
  }

  return counts;
}

/**
 * Mark everything the other party said in this chat as read.
 *
 * The policy from 0024 restricts this to messages the caller did not send, so
 * the filter here is belt and braces — but it also keeps the write small, which
 * matters because this runs on every chat open.
 */
export async function markChatMessagesRead(
  client: DbClient,
  chatId: string,
  viewerUserId: string,
) {
  const { error } = await client
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("chat_id", chatId)
    .neq("sender_user_id", viewerUserId)
    .is("read_at", null);

  if (error) {
    throw error;
  }
}

/**
 * Names for the seekers who contacted this agent.
 *
 * NOT an embed on public.users. That table is readable only by yourself or an
 * admin, so `users ( full_name )` joined into the query above returns null for
 * every row and the inbox renders "A seeker" for everyone — silently, because a
 * denied embed is not an error. Migration 0025 discloses the name and only the
 * name; see the reasoning there for why this is not a policy.
 */
export async function findCounterpartyNames(
  client: DbClient,
  userIds: string[],
) {
  const names = new Map<string, string>();

  if (userIds.length === 0) {
    return names;
  }

  const { data, error } = await client.rpc("counterparty_display_names", {
    user_ids: Array.from(new Set(userIds)),
  });

  if (error) {
    throw error;
  }

  for (const row of data ?? []) {
    if (row.full_name) {
      names.set(row.user_id, row.full_name);
    }
  }

  return names;
}

/**
 * Everything with a clock still running against this agent.
 *
 * Fetches the open candidates and applies the deadlines in TypeScript, for the
 * same reason findActiveInspectionRequest does: the rule about what counts as
 * still-open lives in one module, and a `.gt("expires_at", now)` here would be a
 * second copy of it written in PostgREST filter syntax.
 *
 * Both statuses, since 0030: a request awaiting an answer and an accepted
 * inspection awaiting its completion mark are both work sitting on this agent,
 * and each runs against a different column. Which is which is the expiry
 * module's business, not this query's.
 *
 * Only three columns, because this runs in the layout on every portal page and
 * nothing here needs the rest of the row.
 */
export async function listOpenInspectionRequestDeadlines(
  client: DbClient,
  agentProfileId: string,
) {
  const { data, error } = await client
    .from("inspection_requests")
    .select("completion_deadline, expires_at, status")
    .in("status", ["requested", "accepted"])
    .eq("agent_profile_id", agentProfileId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * Unread messages addressed to this user, across every conversation.
 *
 * No chat filter: RLS confines `messages` to conversations the caller is party
 * to, so the scope is already exactly right and adding an `.in("chat_id", ...)`
 * would mean fetching the chat list first to say something the database is
 * saying anyway.
 *
 * head + exact asks Postgres to count and return no rows at all.
 */
export async function countUnreadMessagesForUser(
  client: DbClient,
  viewerUserId: string,
) {
  const { count, error } = await client
    .from("messages")
    .select("id", { count: "exact", head: true })
    .neq("sender_user_id", viewerUserId)
    .is("read_at", null)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function createInspectionRequest(
  client: DbClient,
  input: {
    agentProfileId: string;
    expiresAt: string;
    listingId: string;
    message?: string | null;
    requesterUserId: string;
  },
) {
  const { data, error } = await client
    .from("inspection_requests")
    .insert({
      agent_profile_id: input.agentProfileId,
      expires_at: input.expiresAt,
      listing_id: input.listingId,
      message: input.message ?? null,
      requester_user_id: input.requesterUserId,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as InspectionRequestRow;
}

export async function createInspectionChat(
  client: DbClient,
  input: {
    agentProfileId: string;
    inspectionRequestId: string;
    listingId: string;
    studentUserId: string;
  },
) {
  const { data, error } = await client
    .from("chats")
    .insert({
      agent_profile_id: input.agentProfileId,
      inspection_request_id: input.inspectionRequestId,
      listing_id: input.listingId,
      student_user_id: input.studentUserId,
      type: "inspection",
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as ChatRow;
}

export async function attachChatToInspectionRequest(
  client: DbClient,
  inspectionRequestId: string,
  chatId: string,
) {
  const { data, error } = await client
    .from("inspection_requests")
    .update({
      chat_id: chatId,
    })
    .eq("id", inspectionRequestId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as InspectionRequestRow;
}

export async function getInspectionRequestById(
  client: DbClient,
  inspectionRequestId: string,
) {
  const { data, error } = await client
    .from("inspection_requests")
    .select(
      `
        *,
        listings (
          id,
          title
        )
      `,
    )
    .eq("id", inspectionRequestId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as unknown as InspectionRequestWithListingRow | null;
}

/**
 * Accept or decline, via the RPC.
 *
 * Was a plain UPDATE until 0030. inspection_requests.status is no longer
 * granted to anyone: the privilege that writes 'accepted' is the privilege that
 * writes 'completed', and an agent who can write their own status can mark a
 * visit complete that never happened, on a request nobody ever accepted. So
 * this goes through public.respond_to_inspection_request, which re-checks
 * ownership, the stored status and the 48-hour deadline itself.
 *
 * Returns the completion deadline the function set, because acceptance is what
 * starts the four-day window and the caller has no other way to learn it.
 */
export async function recordInspectionResponse(
  client: DbClient,
  inspectionRequestId: string,
  decision: "accepted" | "declined",
) {
  const { data, error } = await client
    .rpc("respond_to_inspection_request", {
      decision,
      target_request_id: inspectionRequestId,
    })
    .single();

  if (error) {
    mapDatabaseSentinel(error);
  }

  return data as {
    completion_deadline: string | null;
    inspection_request_id: string;
    responded_at: string;
    status: string;
  };
}

/**
 * Mark an accepted inspection complete, via the RPC.
 *
 * The four-day window is enforced inside the function, not here. A check in
 * TypeScript would be advisory: the whole reason status stopped being granted
 * is that anything above the database can be gone around.
 */
export async function markInspectionRequestComplete(
  client: DbClient,
  inspectionRequestId: string,
) {
  const { data, error } = await client
    .rpc("complete_inspection_request", {
      target_request_id: inspectionRequestId,
    })
    .single();

  if (error) {
    mapDatabaseSentinel(error);
  }

  return data as { completed_at: string; inspection_request_id: string };
}

/**
 * Atomic creation via public.create_inspection_request_with_chat.
 *
 * Replaces three sequential writes that had no transaction between them.
 * Returns the same shape the service previously assembled by hand.
 *
 * No deadline argument since 0031. The agent's 48-hour window is computed
 * inside the function: it is the window the agent is held to, and the caller
 * here is the seeker.
 */
export async function createInspectionRequestWithChat(
  client: DbClient,
  input: { listingId: string; message: string },
) {
  const { data, error } = await client
    .rpc("create_inspection_request_with_chat", {
      request_message: input.message,
      target_listing_id: input.listingId,
    })
    .single();

  if (error) {
    throw error;
  }

  const created = data as { chat_id: string; inspection_request_id: string };

  const [{ data: request }, { data: chat }] = await Promise.all([
    client
      .from("inspection_requests")
      .select("*")
      .eq("id", created.inspection_request_id)
      .single(),
    client.from("chats").select("*").eq("id", created.chat_id).single(),
  ]);

  return {
    chat: chat as ChatRow,
    inspectionRequest: request as InspectionRequestRow,
  };
}
