import { AppError } from "@/lib/api/app-error";
type RequiredServerEnvKey =
  | "NEXT_PUBLIC_APP_URL"
  | "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
  | "CLERK_SECRET_KEY"
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY";

function getEnvValue(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new AppError(
      "CONFIG_ENV_VAR_MISSING",
      `Missing required environment variable: ${key}`,
    );
  }

  return value;
}

export function getRequiredServerEnv(key: RequiredServerEnvKey): string {
  return getEnvValue(key);
}

export const appEnv = {
  appUrl: () => getRequiredServerEnv("NEXT_PUBLIC_APP_URL"),
  clerkPublishableKey: () =>
    getRequiredServerEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
  clerkSecretKey: () => getRequiredServerEnv("CLERK_SECRET_KEY"),
  supabaseUrl: () => getRequiredServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => getRequiredServerEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => getRequiredServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
  listingMediaBucket: () =>
    process.env.NEXT_PUBLIC_SUPABASE_LISTING_BUCKET ?? "listing-media",
  paystackSecretKey: () => process.env.PAYSTACK_SECRET_KEY ?? "",
  paystackWebhookSecret: () => process.env.PAYSTACK_WEBHOOK_SECRET ?? "",
  sentryAuthToken: () => process.env.SENTRY_AUTH_TOKEN ?? "",
  sentryDsn: () => process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
};
