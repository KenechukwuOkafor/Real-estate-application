import { SupportWhatsAppLink } from "@/components/support-whatsapp-link";
import { suspensionNotice } from "@/features/agents/suspension-notice";

type SuspensionNoticePanelProps = {
  agent: { displayName: string | null; handle: string | null };
  reason: string | null;
};

/**
 * The suspension, explained. See suspension-notice.ts for why each line is here.
 *
 * Rose because something has happened to the account that the agent needs to
 * know about, but the copy itself never blames them — the reason is the
 * moderator's, quoted, and the rest is what it means and who to ask.
 */
export function SuspensionNoticePanel({ agent, reason }: SuspensionNoticePanelProps) {
  const notice = suspensionNotice(reason);

  return (
    <section className="rounded-card border border-fix-line bg-fix-surface p-6 text-fix-deep">
      <h2 className="text-lg font-semibold">{notice.heading}</h2>

      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-fix-ink/80">
        {notice.reasonLabel}
      </p>
      <p className="mt-1 text-base leading-7">{notice.reason}</p>

      <ul className="mt-4 flex list-disc flex-col gap-1 pl-5 text-sm leading-6">
        {notice.effects.map((effect) => (
          <li key={effect}>{effect}</li>
        ))}
      </ul>

      <p className="mt-3 text-sm leading-6">{notice.continues}</p>
      <p className="mt-3 text-sm leading-6">{notice.nextStep}</p>

      <SupportWhatsAppLink
        agent={agent}
        className="mt-2 inline-block text-sm font-medium text-fix-deep underline underline-offset-4"
        topic="account_suspended"
      />
    </section>
  );
}
