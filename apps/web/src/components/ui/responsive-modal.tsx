"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * One overlay that lands the right way round on both sizes.
 *
 * A centred dialog on a phone fights the thumb: it sits in the middle of the screen with its
 * controls where nobody's hand is, and a soft keyboard shoves it off the top. A sheet rising from
 * the bottom edge puts the buttons under the thumb and grows downward when the keyboard appears.
 * On a desktop the same sheet would be a full-width band across the bottom of a wide screen, which
 * is why this is a switch rather than a single choice.
 */
function useIsMobile(breakpoint = 640): boolean {
  // False first so the server and the first client paint agree; the effect corrects it before
  // anything is open, so there is no flash to see.
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const sync = () => setMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [breakpoint]);
  return mobile;
}

export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Pinned to the bottom edge, outside the scrolling area. */
  footer?: ReactNode;
  className?: string;
}) {
  const mobile = useIsMobile();

  const body = (
    <>
      {/* The body scrolls, the header and footer do not: on a phone a long list must not push the
          primary action off the bottom of the sheet.
          min-h-0 is load-bearing. A flex item defaults to min-height:auto, which refuses to shrink
          below its content -- a hundred songs would push the sheet straight through max-h and take
          the close button off the screen with it. Same trap as the grid children that cut the
          mobile layout off horizontally, one axis over. */}
      <div className="scroll-subtle -mx-4 min-h-0 flex-1 overflow-y-auto px-4">{children}</div>
      {footer ? (
        <div className="-mx-4 border-t border-border/60 bg-popover px-4 pt-3">{footer}</div>
      ) : null}
    </>
  );

  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            // Never taller than the viewport minus a thumb's worth of the page behind it, so it
            // always reads as a sheet over something rather than a new screen.
            "flex max-h-[88dvh] flex-col gap-3 rounded-t-2xl p-4 " +
              "pb-[max(1rem,env(safe-area-inset-bottom))]",
            className,
          )}
        >
          <SheetHeader className="p-0">
            <SheetTitle className="text-base">{title}</SheetTitle>
            {description ? (
              <SheetDescription className="text-xs leading-relaxed">{description}</SheetDescription>
            ) : null}
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("flex max-h-[85dvh] flex-col gap-3 sm:max-w-md", className)}
      >
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-xs leading-relaxed">{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
