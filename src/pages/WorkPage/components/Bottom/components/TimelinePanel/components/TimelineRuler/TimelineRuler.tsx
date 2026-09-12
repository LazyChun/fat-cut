import React, { useCallback, useRef } from "react";
import { KEYFRAME_EPSILON, formatTime } from "utils";
import styles from "./TimelineRuler.less";

interface TimelineRulerProps {
  duration: number;
  pixelsPerSecond: number;
  labelWidth: number;
  onSeek: (time: number) => void;
  keyframeTimes?: number[];
  currentTime?: number;
}

const computeInterval = (pps: number): number => {
  if (pps >= 100) return 1;
  if (pps >= 50) return 5;
  if (pps >= 20) return 10;
  if (pps >= 10) return 30;
  return 60;
};

const TimelineRuler: React.FC<TimelineRulerProps> = ({
  duration,
  pixelsPerSecond,
  labelWidth,
  onSeek,
  keyframeTimes = [],
  currentTime,
}) => {
  const draggingRef = useRef(false);

  const interval = computeInterval(pixelsPerSecond);
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += interval) {
    ticks.push(t);
  }

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      draggingRef.current = true;
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const seekClientX = (clientX: number) => {
        const x = clientX - rect.left - labelWidth;
        const time = Math.max(0, x / pixelsPerSecond);
        onSeek(time);
      };
      seekClientX(e.clientX);
      const move = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        seekClientX(ev.clientX);
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
      className={styles.ruler}
      onMouseDown={handleMouseDown}
    >
      <div
        className={styles.corner}
        style={{ width: labelWidth }}
      />
      <div className={styles.ticksArea}>
        {keyframeTimes.map((time) => {
          const active =
            currentTime !== undefined &&
            Math.abs(currentTime - time) <= KEYFRAME_EPSILON;
          return (
            <div
              key={`kf-${time}`}
              className={`${styles.keyframeMarker}${active ? ` ${styles.activeKeyframe}` : ""}`}
              style={{ left: time * pixelsPerSecond }}
            />
          );
        })}
        {ticks.map((t) => (
          <div
            key={t}
            className={styles.tick}
            style={{ left: t * pixelsPerSecond }}
          >
            <span className={styles.tickLabel}>{formatTime(t)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TimelineRuler;
