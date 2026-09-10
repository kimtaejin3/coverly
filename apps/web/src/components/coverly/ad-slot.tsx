"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { ADSENSE_CLIENT, adsAllowedOn } from "@/lib/adsense";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * One responsive ad unit. Renders nothing at all when ads are off or the route is not one of the
 * places ads are allowed, so no empty frame is left behind.
 */
export function AdSlot({ slot, className }: { slot: string; className?: string }) {
  const pathname = usePathname();
  const allowed = adsAllowedOn(pathname);
  const pushed = useRef(false);

  useEffect(() => {
    if (!allowed || pushed.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
      // React can run an effect twice in development; a second push on the same <ins> throws.
      pushed.current = true;
    } catch {
      // A blocked or failed ad must never take the page with it.
    }
  }, [allowed]);

  if (!allowed) return null;

  return (
    <aside className={cn("my-8", className)} aria-label="광고">
      <p className="mb-1 text-[0.6875rem] text-muted-foreground">광고</p>
      <ins
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
