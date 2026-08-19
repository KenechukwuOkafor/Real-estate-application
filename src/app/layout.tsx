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

export const metadata: Metadata = {
  title: "Ruvo — Verified Rentals in Nsukka",
  description:
    "Browse verified rental listings in Nsukka with clear pricing, agent-reviewed properties, and in-app inspection scheduling.",
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
