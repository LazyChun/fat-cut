import React, { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { editorStore } from "reducers";
import { findClip, timelineDuration } from "utils";
import Track from "./components/Track/Track";
import FilterTrack from "./components/FilterTrack/FilterTrack";
import styles from "./TimelineTracks.less";

interface TimelineTracksProps {
  tracks: Cut.Track[];
  pixelsPerSecond: number;
  labelWidth: number;
  selectedClipId?: string;
  contentWidth: number;
  onSelectClip: (clipId: string, trackId: string) => void;
  onSelectTrack: (trackId: string) => void;
  filterClips: Cut.FilterClip[];
  selectedFilterClipId?: string;
}

const TYPE_COLORS: Record<Cut.ClipType, string> = {
  video: "#1677ff",
  audio: "#52c41a",
  image: "#722ed1",
  text: "#fa8c16",
  sticker: "#eb2f96",
  subtitle: "#13c2c2",
};

const TimelineTracks: React.FC<TimelineTracksProps> = ({
  tracks,
  pixelsPerSecond,
  labelWidth,
  selectedClipId,
  contentWidth,
  onSelectClip,
  onSelectTrack,
  filterClips,
  selectedFilterClipId,
}) => {
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const sorted = [...tracks].sort((a, b) => a.sortOrder - b.sortOrder);
  const activeClip = activeClipId
    ? findClip(tracks, activeClipId)?.clip
    : undefined;

  const handleDragStart = (e: DragStartEvent) => {
    setActiveClipId(e.active.id as string);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over, delta } = e;
    setActiveClipId(null);
    if (!over) return;
    const found = findClip(tracks, active.id as string);
    if (!found) return;
    const { clip } = found;
    const deltaSeconds = delta.x / pixelsPerSecond;
    editorStore.moveClip(
      clip.id,
      over.id as string,
      clip.timelineIn + deltaSeconds,
    );
  };

  const handleDragCancel = () => setActiveClipId(null);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={styles.tracks}>
        {sorted.map((track) => (
          <Track
            key={track.id}
            track={track}
            pixelsPerSecond={pixelsPerSecond}
            labelWidth={labelWidth}
            selectedClipId={selectedClipId}
            contentWidth={contentWidth}
            onSelectClip={onSelectClip}
            onSelectTrack={onSelectTrack}
          />
        ))}
        <FilterTrack
          filterClips={filterClips}
          pixelsPerSecond={pixelsPerSecond}
          labelWidth={labelWidth}
          selectedFilterClipId={selectedFilterClipId}
          contentWidth={contentWidth}
        />
      </div>
      <DragOverlay dropAnimation={null}>
        {activeClip ? (
          <div
            style={{
              width: Math.max(
                8,
                timelineDuration(activeClip) * pixelsPerSecond,
              ),
              height: 32,
              background: `${TYPE_COLORS[activeClip.type] ?? "#1677ff"}44`,
              border: `1px solid ${
                TYPE_COLORS[activeClip.type] ?? "#1677ff"
              }`,
              borderRadius: 4,
              padding: "0 8px",
              fontSize: 11,
              color: TYPE_COLORS[activeClip.type] ?? "#1677ff",
              opacity: 0.85,
              display: "flex",
              alignItems: "center",
              boxSizing: "border-box",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {activeClip.assetRef?.fileName ??
              activeClip.text?.content ??
              activeClip.sticker?.content ??
              activeClip.type}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default TimelineTracks;
