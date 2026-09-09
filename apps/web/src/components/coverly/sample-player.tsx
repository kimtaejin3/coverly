"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

/**
 * One audio element for the whole catalogue, so starting a sample stops the one already playing.
 * Six independent players would let a user stack six voices on top of each other.
 */
interface SamplePlayerValue {
  playingId: string | null;
  loadingId: string | null;
  toggle: (id: string, url: string) => void;
}

const SamplePlayerContext = createContext<SamplePlayerValue>({
  playingId: null,
  loadingId: null,
  toggle: () => {},
});

export function SamplePlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Fetched once per voice and reused; samples are ~190 KB, so this is cheaper than refetching.
  const blobUrls = useRef(new Map<string, string>());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const toggle = useCallback(
    async (id: string, url: string) => {
      if (!url) return;
      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        audio.addEventListener("ended", () => setPlayingId(null));
        audioRef.current = audio;
      }

      if (playingId === id) {
        audio.pause();
        setPlayingId(null);
        return;
      }

      audio.pause();
      setPlayingId(null);

      // Pointing the element straight at the storage URL leaves it stuck at readyState 0: the
      // media element's range requests never settle against that endpoint. Fetching the bytes
      // ourselves and playing from a blob avoids ranges entirely, and the file is small.
      let src = blobUrls.current.get(id);
      if (!src) {
        setLoadingId(id);
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(String(response.status));
          src = URL.createObjectURL(await response.blob());
          blobUrls.current.set(id, src);
        } catch {
          setLoadingId(null);
          return;
        }
        setLoadingId(null);
      }

      audio.src = src;
      audio.currentTime = 0;
      void audio.play().then(
        () => setPlayingId(id),
        () => setPlayingId(null),
      );
    },
    [playingId],
  );

  return (
    <SamplePlayerContext.Provider value={{ playingId, loadingId, toggle }}>
      {children}
    </SamplePlayerContext.Provider>
  );
}

export function useSamplePlayer() {
  return useContext(SamplePlayerContext);
}
