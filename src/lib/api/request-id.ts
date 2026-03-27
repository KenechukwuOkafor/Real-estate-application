import { headers } from "next/headers";

export async function getRequestId() {
  const headerStore = await headers();

  return headerStore.get("x-request-id") ?? crypto.randomUUID();
}
