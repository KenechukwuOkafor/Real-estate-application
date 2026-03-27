import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

import { AppShellHeader } from "@/components/app-shell-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ruvo",
  description: "Trust-first real estate marketplace for verified listings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <AppShellHeader />
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
