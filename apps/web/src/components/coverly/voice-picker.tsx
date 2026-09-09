"use client";

import { Check, CircleNotch, Pause, Play } from "@phosphor-icons/react";

import { SamplePlayerProvider, useSamplePlayer } from "@/components/coverly/sample-player";
import { VoiceAvatar } from "@/components/coverly/voice-avatar";
import type { Voice } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Sidebar-sized voice list. The marketing-sized VoiceCard is too tall to scan here, and the
 * control panel needs the whole catalogue visible at once rather than four highlights.
 *
 * Select and preview are siblings, never nested: a button inside a button is invalid HTML, and
 * the browser silently reparents it, which breaks hydration.
 */
export function VoicePicker({
  voices,
  selectedId,
  onSelect,
}: {
  voices: Voice[];
  selectedId: string | null;
  onSelect: (voice: Voice) => void;
}) {
  return (
    <SamplePlayerProvider>
      <VoiceList voices={voices} selectedId={selectedId} onSelect={onSelect} />
    </SamplePlayerProvider>
  );
}

function VoiceList({
  voices,
  selectedId,
  onSelect,
}: {
  voices: Voice[];
  selectedId: string | null;
  onSelect: (voice: Voice) => void;
}) {
  const { playingId, loadingId, toggle } = useSamplePlayer();

  return (
    <ul className="space-y-1">
      {voices.map((voice) => {
        const selected = voice.id === selectedId;
        return (
          <li
            key={voice.id}
            className={cn(
              "flex items-center gap-1 rounded-xl pr-1.5 transition-colors",
              selected ? "bg-primary/12" : "hover:bg-secondary/70",
            )}
          >
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(voice)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2.5 text-left"
            >
              <VoiceAvatar
                voiceId={voice.id}
                name={voice.name}
                className={cn(
                  "size-9 rounded-[0.7rem] transition-opacity",
                  selected ? "opacity-100" : "opacity-85",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{voice.name}</span>
                  {selected ? (
                    <Check
                      className="size-3.5 shrink-0 text-primary"
                      weight="bold"
                      aria-label="선택됨"
                    />
                  ) : null}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {voice.tags.join(" · ")}
                </span>
              </span>
            </button>

            <button
              type="button"
              disabled={!voice.sampleUrl}
              aria-label={
                playingId === voice.id ? `${voice.name} 샘플 정지` : `${voice.name} 샘플 듣기`
              }
              onClick={() => toggle(voice.id, voice.sampleUrl)}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
            >
              {loadingId === voice.id ? (
                <CircleNotch className="size-3.5 animate-spin" aria-hidden />
              ) : playingId === voice.id ? (
                <Pause className="size-3.5" weight="fill" aria-hidden />
              ) : (
                <Play className="size-3.5" weight="fill" aria-hidden />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
