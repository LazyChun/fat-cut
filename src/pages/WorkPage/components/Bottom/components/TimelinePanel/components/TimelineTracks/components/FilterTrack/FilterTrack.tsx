import React, { useCallback } from "react";
import { Icon } from "components";
import { useI18n, useSdk } from "hooks";
import { editorStore } from "reducers";
import {
  hasFilterPayload,
  readFilterPayload,
} from "utils";
import { FilterClipItem } from "./components";
import styles from "./FilterTrack.less";

interface FilterTrackProps {
  filterClips: Cut.FilterClip[];
  pixelsPerSecond: number;
  labelWidth: number;
  selectedFilterClipId?: string;
  contentWidth: number;
}

const FilterTrack: React.FC<FilterTrackProps> = ({
  filterClips,
  pixelsPerSecond,
  labelWidth,
  selectedFilterClipId,
  contentWidth,
}) => {
  const { text } = useI18n();
  const sdk = useSdk();

  const handleSelect = (filterClipId: string) => {
    editorStore.setFilterClipSelection(filterClipId);
  };

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFilterPayload(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const payload = readFilterPayload(e);
      if (!payload) return;
      e.preventDefault();
      const lane = e.currentTarget;
      const rect = lane.getBoundingClientRect();
      const dropX = e.clientX - rect.left + lane.scrollLeft;
      const timelineIn = Math.max(0, dropX / pixelsPerSecond);
      const fid = editorStore.addFilterClip(payload.filterTypeId, {
        timelineIn,
      });
      if (fid) {
        sdk.ui.toast.success(text("cut.filters.added"));
      }
    },
    [pixelsPerSecond, sdk, text],
  );

  return (
    <div
      className={styles.track}
      onMouseDown={() => editorStore.setFilterClipSelection(undefined)}
    >
      <div
        className={styles.label}
        style={{ width: labelWidth }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Icon name="filter" size={14} />
        <span className={styles.name}>{text("cut.filters.track")}</span>
      </div>
      <div
        className={styles.lane}
        style={{ width: contentWidth }}
        onMouseDown={(e) => e.stopPropagation()}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {filterClips.length === 0 && <span className={styles.emptyHint} />}
        {filterClips.map((fc) => (
          <FilterClipItem
            key={fc.id}
            filterClip={fc}
            pixelsPerSecond={pixelsPerSecond}
            selected={fc.id === selectedFilterClipId}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
};

export default FilterTrack;
