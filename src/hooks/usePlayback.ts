import { useEffect, useRef } from "react";
import { playbackStore } from "reducers";

export const usePlayback = () => {
  const { isPlaying } = playbackStore.getState();
  const rafRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = undefined;
      }
      lastTimeRef.current = undefined;
      return;
    }

    const loop = (timestamp: number) => {
      if (lastTimeRef.current === undefined) {
        lastTimeRef.current = timestamp;
      }
      const dt = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;
      if (dt > 0 && dt < 1) {
        playbackStore.tick(dt);
      }
      if (playbackStore.getState().isPlaying) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = undefined;
      }
      lastTimeRef.current = undefined;
    };
  }, [isPlaying]);
};
