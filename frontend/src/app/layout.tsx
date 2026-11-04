import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: {
    default: "GENESIS GUARDIAN · Autonomous emergency lifeform",
    template: "%s · GENESIS GUARDIAN",
  },
  description:
    "GENESIS GUARDIAN — autonomous emergency lifeform for GenLayer. AI-consensus threat assessment, corroborated evidence and two-phase emergency authority on-chain.",
  applicationName: "GENESIS GUARDIAN",
};

export const viewport: Viewport = {
  themeColor: "#0B0A0F",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-ink text-text antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
