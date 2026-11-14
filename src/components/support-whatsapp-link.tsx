import { type SupportContext, supportWhatsappUrl } from "@/lib/support-contact";

type SupportWhatsAppLinkProps = SupportContext & {
  className?: string;
  label?: string;
};

/**
 * "Message us on WhatsApp", with the context already typed.
 *
 * One component so the label, the new-tab behaviour and the prefilled message
 * cannot drift between the places that offer it. Usable from server and client
 * components alike: the number is a NEXT_PUBLIC_ variable, inlined at build.
 */
export function SupportWhatsAppLink({
  className = "text-sm font-medium underline underline-offset-4",
  label = "Message us on WhatsApp",
  ...context
}: SupportWhatsAppLinkProps) {
  return (
    <a
      className={className}
      href={supportWhatsappUrl(context)}
      rel="noopener noreferrer"
      target="_blank"
    >
      {label}
    </a>
  );
}
