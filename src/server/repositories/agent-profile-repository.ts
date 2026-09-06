/**
 * The public agent profile, read as the caller.
 *
 * Every select list here is the anon grant from 0040 spelled out. Adding a
 * column without granting it fails the query outright with 42501 rather than
 * returning a null, which is the intended shape — the select list and the
 * grant are meant to be read together.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type DbClient = SupabaseClient<Database>;

/**
 * What anon may read, verbatim.
 *
 * deleted_at is NOT here and must not be added as a filter either. The row
 * policy already excludes deleted profiles, and Postgres refuses a WHERE on a
 * column the caller cannot SELECT — so a defensive `.is("deleted_at", null)`
 * would fail the whole query rather than being harmlessly redundant. It is the
 * kind of line that looks like extra safety and is actually an outage.
 */
const PUBLIC_AGENT_COLUMNS =
  "id, handle, display_name, bio, avatar_path, verification_status, verified_at";

export type PublicAgentProfileRow = Pick<
  Database["public"]["Tables"]["agent_profiles"]["Row"],
  | "avatar_path"
  | "bio"
  | "display_name"
  | "handle"
  | "id"
  | "verification_status"
  | "verified_at"
>;

/**
 * By handle, which is the only thing the URL carries.
 *
 * Returns null for a handle nobody holds AND for an unverified agent seen by
 * anyone but themselves — the row policy makes those indistinguishable from
 * outside, which is the correct behaviour: whether a given handle belongs to
 * an unverified agent is not a public fact.
 */
export async function getAgentProfileByHandle(client: DbClient, handle: string) {
  const { data, error } = await client
    .from("agent_profiles")
    .select(PUBLIC_AGENT_COLUMNS)
    .eq("handle", handle)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as PublicAgentProfileRow | null) ?? null;
}

/**
 * Answered and answerable, counted by the database.
 *
 * Counts rather than rows: see 0041. The caller is often anon, and rows would
 * hand them an agent's demand timeline out of a page that renders "9 of 10".
 */
export async function getAgentResponseRate(client: DbClient, agentProfileId: string) {
  const { data, error } = await client.rpc("agent_response_rate", {
    target_agent_profile_id: agentProfileId,
  });

  if (error) {
    throw error;
  }

  const row = data?.[0];

  return { answerable: row?.answerable ?? 0, answered: row?.answered ?? 0 };
}

/**
 * A profile view.
 *
 * viewer_user_id is absent by design: it defaults to current_app_user_id() and
 * no role holds INSERT on it, so attribution travels with the connection
 * rather than in this payload. Which client the caller opened IS the
 * attribution. See 0042, and 0028 for the defect that established the shape.
 */
export async function createAgentProfileView(
  client: DbClient,
  input: {
    agentProfileId: string;
    ipHash: string | null;
    referrer: string | null;
    sessionId: string | null;
    userAgent: string | null;
  },
) {
  const { error } = await client.from("agent_profile_views").insert({
    agent_profile_id: input.agentProfileId,
    ip_hash: input.ipHash,
    referrer: input.referrer,
    session_id: input.sessionId,
    user_agent: input.userAgent,
  });

  if (error) {
    throw error;
  }
}
