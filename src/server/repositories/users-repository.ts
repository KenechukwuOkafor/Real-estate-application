import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type DbClient = SupabaseClient<Database>;

export type AppUserRow = Database["public"]["Tables"]["users"]["Row"];
export type AppRoleRow = Database["public"]["Tables"]["user_roles"]["Row"];

export async function getUserByClerkUserId(
  client: DbClient,
  clerkUserId: string,
) {
  const { data, error } = await client
    .from("users")
    .select("*")
    .eq("clerk_user_id", clerkUserId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function upsertUserByClerkIdentity(
  client: DbClient,
  input: Database["public"]["Tables"]["users"]["Insert"],
) {
  const { data, error } = await client
    .from("users")
    .upsert(input, {
      onConflict: "clerk_user_id",
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function listUserRoles(client: DbClient, userId: string) {
  const { data, error } = await client
    .from("user_roles")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function ensureUserRoles(
  client: DbClient,
  userId: string,
  roles: Database["public"]["Enums"]["app_role"][],
) {
  if (roles.length === 0) {
    return [];
  }

  const rows = roles.map((role) => ({
    role,
    user_id: userId,
  }));

  const { data, error } = await client
    .from("user_roles")
    .upsert(rows, {
      onConflict: "user_id,role",
      ignoreDuplicates: true,
    })
    .select("*");

  if (error) {
    throw error;
  }

  return data ?? [];
}
