import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type DbClient = SupabaseClient<Database>;

type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];

export async function getCurrentListingEntitlementSubscription(
  client: DbClient,
  agentProfileId: string,
) {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("subscriptions")
    .select("*")
    .eq("agent_profile_id", agentProfileId)
    .in("status", ["active", "grace_period"])
    .lte("starts_at", now)
    .gt("expires_at", now)
    .is("deleted_at", null)
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as SubscriptionRow | null;
}
