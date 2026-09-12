import React, { useCallback, useMemo } from "react";
import { Tooltip } from "antd";
import { useDroppable } from "@dnd-kit/core";
import { Icon } from "components";
import { useI18n, useSdk } from "hooks";
import { editorStore, useEditorStore } from "reducers";
import {
  hasTransitionPayload,
  readTransitionPayload,
  timelineOut,
} from "utils";
import { Clip } from "./components";
import { TransitionOverlay } from "./components";
import styles from "./Track.less";

interface TrackProps {
  track: Cut.Track;
  pixelsPerSecond: number;
  labelWidth: number;
  selectedClipId?: string;
  contentWidth: number;
  onSelectClip: (clipId: string, trackId: string) => void;
  onSelectTrack: (trackId: string) => void;
}

const SNAP_PX = 32;
const ADJACENCY_TOLERANCE_SEC = 0.01;

const Track: React.FC<TrackProps> = ({
  track,
  pixelsPerSecond,
  labelWidth,
  selectedClipId,
  contentWidth,
  onSelectClip,
  onSelectTrack,
}) => {
  const { text } = useI18n();
  const sdk = useSdk();
  const { selectedTransitionId } = useEditorStore();
  const { setNodeRef, isOver } = useDroppable({
    id: track.id,
    disabled: track.locked,
  });

  const toggle = (patch: Partial<Cut.Track>) => {
    editorStore.updateTrack(track.id, patch);
  };

  // 按 timelineIn 排序,用于转场 overlay 与 drop 命中检测
  const sortedClips = useMemo(
    () =>
      [...track.clips].sort((a, b) => a.timelineIn - b.timelineIn),
    [track.clips],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!hasTransitionPayload(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const payload = readTransitionPayload(e);
      if (!payload) return;
      e.preventDefault();
      const lane = e.currentTarget;
      const rect = lane.getBoundingClientRect();
      const dropX = e.clientX - rect.left + lane.scrollLeft;
      let bestPair: { prev: Cut.Clip; next: Cut.Clip } | null = null;
      let bestDist = Infinity;
      for (let i = 0; i < sortedClips.length - 1; i++) {
        const prev = sortedClips[i];
        const next = sortedClips[i + 1];
        const boundaryX = timelineOut(prev) * pixelsPerSecond;
        const dist = Math.abs(boundaryX - dropX);
        if (dist < bestDist) {
          bestDist = dist;
          bestPair = { prev, next };
        }
      }
      if (!bestPair || bestDist > SNAP_PX) {
        sdk.ui.toast.warn(text("cut.transitions.noAdjacentClip"));
        return;
      }
      const { prev, next } = bestPair;
      if (Math.abs(next.timelineIn - timelineOut(prev)) > ADJACENCY_TOLERANCE_SEC) {
        sdk.ui.toast.warn(text("cut.transitions.noAdjacentClip"));
        return;
      }
      if (prev.type === "audio") {
        sdk.ui.toast.warn(text("cut.transitions.audioNotSupported"));
        return;
      }
      const tid = editorStore.addClipTransition(prev.id, "out", {
        type: payload.transitionTypeId,
      });
      if (tid) {
        sdk.ui.toast.success(text("cut.transitions.added"));
      }
    },
    [sortedClips, pixelsPerSecond, sdk, text],
  );

  return (
    <div
      className={styles.track}
      style={{ height: track.height }}
      onMouseDown={() => onSelectTrack(track.id)}
    >
      <div
        className={styles.label}
        style={{ width: labelWidth }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Icon
          name={track.type === "video" ? "video" : "audio"}
          size={14}
        />
        <span className={styles.name} title={track.name}>
          {track.name}
        </span>
        <div className={styles.actions}>
          <Tooltip title={text("cut.option.muted")}>
            <span
              className={`${styles.actionBtn}${track.muted ? ` ${styles.active}` : ""}`}
              onClick={() => toggle({ muted: !track.muted })}
            >
              <Icon name={track.muted ? "mute" : "sound"} size={12} />
            </span>
          </Tooltip>
          <Tooltip title={text("cut.option.hidden")}>
            <span
              className={`${styles.actionBtn}${track.hidden ? ` ${styles.active}` : ""}`}
              onClick={() => toggle({ hidden: !track.hidden })}
            >
              <Icon name={track.hidden ? "eyeOff" : "eye"} size={12} />
            </span>
          </Tooltip>
          <Tooltip title={text("cut.option.locked")}>
            <span
              className={`${styles.actionBtn}${track.locked ? ` ${styles.active}` : ""}`}
              onClick={() => toggle({ locked: !track.locked })}
            >
              <Icon name={track.locked ? "lock" : "unlock"} size={12} />
            </span>
          </Tooltip>
          <Tooltip title={text("cut.timeline.deleteTrack")}>
            <span
              className={styles.actionBtn}
              onClick={() => editorStore.deleteTrack(track.id)}
            >
              <Icon name="trash" size={12} />
            </span>
          </Tooltip>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`${styles.lane}${isOver ? ` ${styles.over}` : ""}`}
        style={{ width: contentWidth }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelectTrack(track.id);
        }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {track.clips.length === 0 && (
          <span className={styles.emptyHint} />
        )}
        {track.clips.map((clip) => (
          <Clip
            key={clip.id}
            clip={clip}
            pixelsPerSecond={pixelsPerSecond}
            selected={clip.id === selectedClipId}
            onSelect={onSelectClip}
          />
        ))}
        {sortedClips.map((prev, i) => {
          const next = sortedClips[i + 1];
          if (!next || !prev.transitionOut) return null;
          if (
            Math.abs(next.timelineIn - timelineOut(prev)) >
            ADJACENCY_TOLERANCE_SEC
          ) {
            return null;
          }
          return (
            <TransitionOverlay
              key={`tr-${prev.id}`}
              prevClip={prev}
              nextClip={next}
              pixelsPerSecond={pixelsPerSecond}
              selected={selectedTransitionId === prev.transitionOut!.id}
              onSelect={() => {
                editorStore.setTransitionSelection(
                  prev.transitionOut!.id,
                  prev.id,
                );
                editorStore.setSelection({});
              }}
              onDelete={() => {
                editorStore.removeClipTransition(prev.id, "out");
                editorStore.setTransitionSelection(undefined, undefined);
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export default Track;
