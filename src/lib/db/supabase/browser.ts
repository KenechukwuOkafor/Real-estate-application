"use client";

import { createBrowserClient } from "@supabase/ssr";

import { appEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    appEnv.supabaseUrl(),
    appEnv.supabaseAnonKey(),
  );
}
