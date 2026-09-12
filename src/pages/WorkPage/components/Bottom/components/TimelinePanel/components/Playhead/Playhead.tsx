import React, { useCallback, useRef } from "react";
import { usePlaybackCurrentTime } from "reducers";
import styles from "./Playhead.less";

interface PlayheadProps {
  pixelsPerSecond: number;
  labelWidth: number;
  onSeek: (time: number) => void;
}

const Playhead: React.FC<PlayheadProps> = ({
  pixelsPerSecond,
  labelWidth,
  onSeek,
}) => {
  const currentTime = usePlaybackCurrentTime();
  const draggingRef = useRef(false);
  const left = labelWidth + currentTime * pixelsPerSecond;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      draggingRef.current = true;
      const seekClientX = (clientX: number, parent: HTMLElement) => {
        const rect = parent.getBoundingClientRect();
        const x = clientX - rect.left - labelWidth;
        const time = Math.max(0, x / pixelsPerSecond);
        onSeek(time);
      };
      const parent = (e.currentTarget as HTMLElement).parentElement;
      if (!parent) return;
      const move = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        seekClientX(ev.clientX, parent);
      };
      const up = () => {
        draggingRef.current = false;
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [labelWidth, pixelsPerSecond, onSeek],
  );

  return (
    <div
      className={styles.playhead}
      style={{ left }}
      onMouseDown={handleMouseDown}
    >
      <div className={styles.head} />
      <div className={styles.line} />
    </div>
  );
};

export default Playhead;
