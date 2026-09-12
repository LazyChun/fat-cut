import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  useEditorStore,
  usePlaybackCurrentTime,
  usePlaybackDuration,
  editorStore,
  playbackStore,
} from "reducers";
import { useI18n, useSdk } from "hooks";
import {
  findClip,
  getClipKeyframeTimelineTimes,
  getTimelineEnd,
  timelineOut,
} from "utils";
import {
  TimelineToolbar,
  TimelineRuler,
  TimelineTracks,
  Playhead,
} from "./components";
import styles from "./TimelinePanel.less";

const LABEL_WIDTH = 120;

interface TimelinePanelProps {
  onOpenAiDrawer: () => void;
}

const TimelinePanel: React.FC<TimelinePanelProps> = ({ onOpenAiDrawer }) => {
  const {
    project,
    pixelsPerSecond,
    snapEnabled,
    selectedClipId,
    selectedTransitionId,
    selectedTransitionClipId,
    selectedFilterClipId,
  } = useEditorStore();
  const currentTime = usePlaybackCurrentTime();
  const duration = usePlaybackDuration();
  const { text } = useI18n();
  const sdk = useSdk();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollMounted, setScrollMounted] = useState(false);

  const setScrollRef = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
    setScrollMounted(!!el);
  }, []);

  useEffect(() => {
    if (!project) return;
    playbackStore.setDuration(getTimelineEnd(project.tracks));
  }, [project?.id, project?.tracks]);

  useEffect(() => {
    const isEditableTarget = (el: EventTarget | null): boolean => {
      const target = el as HTMLElement | null;
      if (!target) return false;
      const tag = target.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      );
    };

    const resolveTargetClip = (): Cut.Clip | undefined => {
      const currentProject = editorStore.getState().project;
      if (!currentProject) return undefined;
      const t = playbackStore.getState().currentTime;
      if (selectedClipId) {
        const found = findClip(currentProject.tracks, selectedClipId);
        if (found) {
          const { clip } = found;
          if (t > clip.timelineIn + 0.001 && t < timelineOut(clip) - 0.001) {
            return clip;
          }
        }
      }
      const visibleTracks = currentProject.tracks.filter(
        (track) => !track.hidden,
      );
      const activeClipInTrack = (track: Cut.Track): Cut.Clip | undefined =>
        track.clips.find(
          (clip) =>
            t >= clip.timelineIn + 0.001 && t < timelineOut(clip) - 0.001,
        );

      const activeVideoClip = visibleTracks
        .filter((track) => track.type === "video")
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(activeClipInTrack)
        .find(Boolean);
      if (activeVideoClip) {
        return activeVideoClip;
      }

      const activeAudioClip = visibleTracks
        .filter((track) => track.type === "audio")
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(activeClipInTrack)
        .find(Boolean);
      return activeAudioClip;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      // Delete / Backspace: 优先删除选中的转场,其次删除选中的片段
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedTransitionId && selectedTransitionClipId) {
          e.preventDefault();
          editorStore.removeClipTransition(selectedTransitionClipId, "out");
          editorStore.setTransitionSelection(undefined, undefined);
          return;
        }
        if (!selectedClipId) return;
        e.preventDefault();
        editorStore.deleteClip(selectedClipId);
        return;
      }

      const hasModifier = e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;

      // Ctrl+B / Cmd+B: 在播放头处分割
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey &&
        (e.key === "b" || e.key === "B")
      ) {
        e.preventDefault();
        const target = resolveTargetClip();
        if (!target) {
          sdk.ui.toast.warn(text("cut.clip.noActiveClip"));
          return;
        }
        editorStore.splitClip(target.id, playbackStore.getState().currentTime);
        return;
      }

      // 无修饰键时：Q=向左剪切，E=向右剪切
      if (!hasModifier) {
        if (e.key === "q" || e.key === "Q") {
          e.preventDefault();
          const target = resolveTargetClip();
          if (!target) {
            sdk.ui.toast.warn(text("cut.clip.noActiveClip"));
            return;
          }
          editorStore.cutLeft(target.id, playbackStore.getState().currentTime);
          return;
        }
        if (e.key === "e" || e.key === "E") {
          e.preventDefault();
          const target = resolveTargetClip();
          if (!target) {
            sdk.ui.toast.warn(text("cut.clip.noActiveClip"));
            return;
          }
          editorStore.cutRight(target.id, playbackStore.getState().currentTime);
          return;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedClipId,
    selectedTransitionId,
    selectedTransitionClipId,
    sdk,
    text,
  ]);

  const handleZoomIn = useCallback(() => {
    editorStore.setZoom(pixelsPerSecond * 1.2);
  }, [pixelsPerSecond]);

  const handleZoomOut = useCallback(() => {
    editorStore.setZoom(pixelsPerSecond / 1.2);
  }, [pixelsPerSecond]);

  const handleFit = useCallback(() => {
    const cw = containerRef.current?.clientWidth ?? 800;
    editorStore.setZoom(
      Math.max(1, (cw - LABEL_WIDTH) / Math.max(1, duration)),
    );
  }, [duration]);

  const handleSeek = useCallback((t: number) => {
    playbackStore.seek(t);
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const el = containerRef.current;
      if (!el) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left + el.scrollLeft;
      const timeAtCursor = Math.max(
        0,
        (cursorX - LABEL_WIDTH) / pixelsPerSecond,
      );
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const nextPps = Math.max(1, Math.min(500, pixelsPerSecond * factor));
      editorStore.setZoom(nextPps);
      // 保持光标处的时间点不变，调整 scrollLeft
      const nextCursorX = timeAtCursor * nextPps + LABEL_WIDTH;
      el.scrollLeft = Math.max(0, nextCursorX - (e.clientX - rect.left));
    },
    [pixelsPerSecond],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel, scrollMounted]);

  const handleSelectClip = useCallback((clipId: string, trackId: string) => {
    editorStore.setSelection({ clipId, trackId });
  }, []);

  const handleSelectTrack = useCallback((trackId: string) => {
    editorStore.setSelection({ trackId });
  }, []);

  const tracks = project?.tracks ?? [];
  const filterClips = project?.filterClips ?? [];
  const selectedClip =
    project && selectedClipId ? findClip(project.tracks, selectedClipId)?.clip : undefined;
  const selectedClipKeyframeTimes = selectedClip
    ? getClipKeyframeTimelineTimes(selectedClip)
    : [];
  const showEmpty = !project || tracks.length === 0;
  const contentWidth = duration * pixelsPerSecond;
  const trackAreaWidth = LABEL_WIDTH + contentWidth;

  return (
    <div className={styles.container}>
      <TimelineToolbar
        onOpenAiDrawer={onOpenAiDrawer}
        snapEnabled={snapEnabled}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFit={handleFit}
      />
      {showEmpty ? (
        <div className={styles.empty}>{text("cut.timeline.empty")}</div>
      ) : (
        <div className={styles.scrollArea} ref={setScrollRef}>
          <div className={styles.trackArea} style={{ width: trackAreaWidth }}>
            <TimelineRuler
              duration={duration}
              pixelsPerSecond={pixelsPerSecond}
              labelWidth={LABEL_WIDTH}
              onSeek={handleSeek}
              keyframeTimes={selectedClipKeyframeTimes}
              currentTime={currentTime}
            />
            <TimelineTracks
              tracks={tracks}
              pixelsPerSecond={pixelsPerSecond}
              labelWidth={LABEL_WIDTH}
              selectedClipId={selectedClipId}
              contentWidth={contentWidth}
              onSelectClip={handleSelectClip}
              onSelectTrack={handleSelectTrack}
              filterClips={filterClips}
              selectedFilterClipId={selectedFilterClipId}
            />
            <Playhead
              pixelsPerSecond={pixelsPerSecond}
              labelWidth={LABEL_WIDTH}
              onSeek={handleSeek}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default TimelinePanel;
