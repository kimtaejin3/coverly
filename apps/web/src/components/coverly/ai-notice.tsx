import { Sparkle } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";

/**
 * AI 기본법 (in force 2026-01-22) requires generated audio to be labelled where a person can see
 * it. The file itself carries the same label in its metadata.
 */
export function AiNotice({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-secondary/60 px-2.5 py-1 text-xs text-muted-foreground",
        className,
      )}
    >
      <Sparkle className="size-3.5 text-primary" weight="fill" aria-hidden />
      AI로 생성된 음원입니다
    </p>
  );
}
