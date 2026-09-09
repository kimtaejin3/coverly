"use client";

import { Check, CircleNotch, Pause, Play } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SamplePlayerProvider, useSamplePlayer } from "@/components/coverly/sample-player";
import { VoiceAvatar } from "@/components/coverly/voice-avatar";
import type { Voice } from "@/lib/types";
import { cn } from "@/lib/utils";

interface VoiceCardProps {
  voice: Voice;
  selected?: boolean;
  onSelect?: (voice: Voice) => void;
  /** Slot for the page-level CTA; the catalog links to /create, the wizard selects in place. */
  action?: React.ReactNode;
}

export function VoiceCard(props: VoiceCardProps) {
  return (
    <SamplePlayerProvider>
      <VoiceCardInner {...props} />
    </SamplePlayerProvider>
  );
}

function VoiceCardInner({ voice, selected, onSelect, action }: VoiceCardProps) {
  const selectable = Boolean(onSelect);
  const { playingId, loadingId, toggle } = useSamplePlayer();

  return (
    <article
      onClick={selectable ? () => onSelect?.(voice) : undefined}
      aria-pressed={selectable ? selected : undefined}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={
        selectable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect?.(voice);
              }
            }
          : undefined
      }
      className={cn(
        // No border by default: the card earns separation from its own surface, not an outline
        // drawn around everything. The ring appears only when the card is actually chosen.
        "group relative overflow-hidden rounded-2xl bg-card p-5 transition-[transform,background-color] duration-200",
        selectable && "cursor-pointer hover:bg-accent active:scale-[0.99]",
        selected && "ring-2 ring-primary",
      )}
    >
      <div className="flex items-start gap-4">
        <VoiceAvatar voiceId={voice.id} name={voice.name} className="size-12 rounded-[0.9rem]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-lg font-medium">{voice.name}</h3>
            {selected ? (
              <Check className="size-4 shrink-0 text-primary" weight="bold" aria-label="선택됨" />
            ) : null}
          </div>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{voice.description}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        {voice.tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="rounded-md font-normal">
            {tag}
          </Badge>
        ))}
        {voice.rangeLabel ? (
          <span className="tabular ml-auto font-mono text-xs text-muted-foreground">
            {voice.rangeLabel}
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          disabled={!voice.sampleUrl}
          onClick={(event) => {
            event.stopPropagation();
            toggle(voice.id, voice.sampleUrl);
          }}
        >
          {loadingId === voice.id ? (
            <CircleNotch className="size-3.5 animate-spin" aria-hidden />
          ) : playingId === voice.id ? (
            <Pause className="size-3.5" weight="fill" aria-hidden />
          ) : (
            <Play className="size-3.5" weight="fill" aria-hidden />
          )}
          {playingId === voice.id ? "정지" : "샘플 듣기"}
        </Button>
        {action}
      </div>
    </article>
  );
}
