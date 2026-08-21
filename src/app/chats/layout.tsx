import { AgentPortalShell } from "@/features/agents/components/agent-portal-shell";
import { getAgentPortalCounts } from "@/server/services/inspection-service";
import { getCurrentAppUser } from "@/server/services/user-sync-service";

export const dynamic = "force-dynamic";

/**
 * Conversations, wrapped in the portal only when an agent is reading them.
 *
 * /chats is shared: a seeker uses the same route and should keep the ordinary
 * site header. But Chats is one of the portal's five tabs, and a tab that drops
 * an agent out of the shell — losing the bar, losing their place — makes the
 * navigation feel like it stopped working. So the shell follows them in.
 *
 * A seeker gets `children` untouched, which is exactly what this route rendered
 * before this file existed.
 */
export default async function ChatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentAppUser();

  if (!user?.roles.includes("agent")) {
    return <>{children}</>;
  }

  return (
    <AgentPortalShell counts={await getAgentPortalCounts()}>
      {children}
    </AgentPortalShell>
  );
}
