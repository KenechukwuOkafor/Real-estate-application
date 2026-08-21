import {
  PortalNav,
  type PortalNavCounts,
} from "@/features/agents/components/portal-nav";

/**
 * The chrome every portal screen sits inside.
 *
 * `data-portal-shell` is read by one rule in globals.css that hides the
 * marketing header while this is on the page. The header carries its own avatar
 * menu, and the portal already has Account — two entry points to the same set of
 * actions is the clutter this removes. Doing it in CSS rather than by teaching
 * the header which routes are portal routes keeps the knowledge in one place:
 * the shell is present, so the header is not.
 *
 * The mobile bottom bar is fixed, so it sits above the page rather than in the
 * flow. pb-24 reserves the space it would otherwise cover — without it the last
 * item on every list is unreachable, which is the classic bottom-nav bug.
 */
export function AgentPortalShell({
  children,
  counts,
}: {
  children: React.ReactNode;
  counts: PortalNavCounts;
}) {
  return (
    <div
      className="flex min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)]"
      data-portal-shell
    >
      <PortalNav counts={counts} />
      <div className="min-w-0 flex-1 pb-24 md:pb-0">{children}</div>
    </div>
  );
}
