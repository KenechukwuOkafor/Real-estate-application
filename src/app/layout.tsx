import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";

import { AppShellHeader } from "@/components/app-shell-header";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

/**
 * The default description for every route that does not set its own, which is
 * what link previews and search results show when a listing is forwarded.
 *
 * Every clause here must describe behaviour that exists. This block kept three
 * claims the homepage copy had already corrected: administrators review
 * listings, not agents; nothing is scheduled, because inspection_requests has
 * no scheduled-time column at all; and an agent is reviewed rather than
 * identity-verified.
 */
export const metadata: Metadata = {
  title: "Ruvo — Verified rentals in Nsukka",
  description:
    "Browse rentals in Nsukka. Every listing is reviewed before publishing, priced upfront, and open for an inspection request in-app.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable}`}>
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <AppShellHeader />
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
