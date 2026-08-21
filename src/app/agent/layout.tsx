import { redirect } from "next/navigation";

import { AgentPortalShell } from "@/features/agents/components/agent-portal-shell";
import { getAgentPortalCounts } from "@/server/services/inspection-service";
import { getCurrentAppUser } from "@/server/services/user-sync-service";

export const dynamic = "force-dynamic";

/**
 * The agent portal.
 *
 * The role check moves here from the five pages that each did it themselves.
 * Five copies of a guard is five chances for the sixth page to forget it, and a
 * layout is the one place Next.js guarantees runs before any of them.
 *
 * The pages keep their own checks where those answer a different question —
 * "you have no agent profile yet" is not the same refusal as "you are not an
 * agent" — but none of them now carries the bare role test alone.
 */
export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentAppUser();

  if (!user || !user.roles.includes("agent")) {
    redirect("/dashboard");
  }

  return (
    <AgentPortalShell counts={await getAgentPortalCounts()}>
      {children}
    </AgentPortalShell>
  );
}
