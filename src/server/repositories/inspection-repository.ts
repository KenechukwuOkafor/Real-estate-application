import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { blocksNewRequest } from "@/features/inspections/expiry";
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
 * How many requests are still waiting on this agent.
 *
 * Fetches the open candidates and applies the deadline in TypeScript, for the
 * same reason findActiveInspectionRequest does: the rule about what counts as
 * still-open lives in one module, and a `.gt("expires_at", now)` here would be a
 * second copy of it written in PostgREST filter syntax.
 *
 * Only two columns, because this runs in the layout on every portal page and
 * nothing here needs the rest of the row.
 */
export async function listOpenInspectionRequestDeadlines(
  client: DbClient,
  agentProfileId: string,
) {
  const { data, error } = await client
    .from("inspection_requests")
    .select("expires_at, status")
    .eq("agent_profile_id", agentProfileId)
    .eq("status", "requested")
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

export async function updateInspectionRequestStatus(
  client: DbClient,
  inspectionRequestId: string,
  status: Database["public"]["Enums"]["inspection_status"],
  extras?: Partial<Database["public"]["Tables"]["inspection_requests"]["Update"]>,
) {
  const { data, error } = await client
    .from("inspection_requests")
    .update({
      ...extras,
      status,
    })
    .eq("id", inspectionRequestId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as InspectionRequestRow;
}

/**
 * Atomic creation via public.create_inspection_request_with_chat.
 *
 * Replaces three sequential writes that had no transaction between them.
 * Returns the same shape the service previously assembled by hand.
 */
export async function createInspectionRequestWithChat(
  client: DbClient,
  input: { expiresAt: string; listingId: string; message: string },
) {
  const { data, error } = await client
    .rpc("create_inspection_request_with_chat", {
      expires_at: input.expiresAt,
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
