"use client";

import { usePathname } from "next/navigation";
import { SiteBackground } from "@/components/SiteBackground";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

/**
 * The landing page supplies its own overlay header through the hero's
 * `headerSlot`, so the sticky header only renders on inner routes.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  return (
    <div className="flex min-h-screen flex-col">
      <SiteBackground />
      {!isLanding && <SiteHeader />}
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
