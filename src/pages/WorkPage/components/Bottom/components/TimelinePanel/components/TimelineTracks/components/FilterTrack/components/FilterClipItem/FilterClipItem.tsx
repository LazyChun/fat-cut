import React, { useCallback, useState } from "react";
import { Dropdown, type MenuProps } from "antd";
import { editorStore } from "reducers";
import { useI18n } from "hooks";
import { getFilterDefinition } from "utils";
import styles from "./FilterClipItem.less";

interface FilterClipItemProps {
  filterClip: Cut.FilterClip;
  pixelsPerSecond: number;
  selected: boolean;
  onSelect: (filterClipId: string) => void;
}

const FilterClipItem: React.FC<FilterClipItemProps> = ({
  filterClip,
  pixelsPerSecond,
  selected,
  onSelect,
}) => {
  const { text } = useI18n();
  const [drag, setDrag] = useState<{
    type: "move" | "left" | "right";
    delta: number;
  } | null>(null);

  const def = getFilterDefinition(filterClip.type);
  const name = def ? text(def.nameKey) : filterClip.type;

  const baseLeft = filterClip.timelineIn * pixelsPerSecond;
  const baseWidth = Math.max(8, filterClip.duration * pixelsPerSecond);

  let displayLeft = baseLeft;
  let displayWidth = baseWidth;
  if (drag) {
    const deltaPx = drag.delta * pixelsPerSecond;
    if (drag.type === "move") {
      displayLeft = Math.max(0, baseLeft + deltaPx);
    } else if (drag.type === "left") {
      const maxDeltaPx = baseWidth - 8;
      const clampedDeltaPx = Math.max(
        -baseLeft,
        Math.min(deltaPx, maxDeltaPx),
      );
      displayLeft = baseLeft + clampedDeltaPx;
      displayWidth = baseWidth - clampedDeltaPx;
    } else {
      displayWidth = Math.max(8, baseWidth + deltaPx);
    }
  }

  const handleDelete = useCallback(() => {
    editorStore.removeFilterClip(filterClip.id);
  }, [filterClip.id]);

  const menuItems: MenuProps["items"] = [
    {
      key: "delete",
      label: text("cut.filters.delete"),
      danger: true,
      onClick: handleDelete,
    },
  ];

  const handlePointerDown = useCallback(
    (
      e: React.PointerEvent,
      type: "move" | "left" | "right",
    ) => {
      e.stopPropagation();
      e.preventDefault();
      onSelect(filterClip.id);
      const startClientX = e.clientX;
      setDrag({ type, delta: 0 });
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - startClientX;
        const ds = dx / pixelsPerSecond;
        setDrag({ type, delta: ds });
      };
      const up = (ev: PointerEvent) => {
        const dx = ev.clientX - startClientX;
        const ds = dx / pixelsPerSecond;
        if (type === "move") {
          editorStore.moveFilterClip(
            filterClip.id,
            filterClip.timelineIn + ds,
          );
        } else {
          editorStore.trimFilterClip(filterClip.id, type, ds);
        }
        setDrag(null);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [filterClip.id, filterClip.timelineIn, pixelsPerSecond, onSelect],
  );

  return (
    <Dropdown menu={{ items: menuItems }} trigger={["contextMenu"]}>
      <div
        className={`${styles.filterClip}${selected ? ` ${styles.selected}` : ""}`}
        style={{
          left: displayLeft,
          width: displayWidth,
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect(filterClip.id);
        }}
        onContextMenu={(e) => {
          e.stopPropagation();
          onSelect(filterClip.id);
        }}
      >
        <div
          className={styles.handle}
          data-edge="left"
          onPointerDown={(e) => handlePointerDown(e, "left")}
        />
        <div
          className={styles.body}
          onPointerDown={(e) => handlePointerDown(e, "move")}
        >
          <div className={styles.label}>{name}</div>
        </div>
        <div
          className={styles.handle}
          data-edge="right"
          onPointerDown={(e) => handlePointerDown(e, "right")}
        />
      </div>
    </Dropdown>
  );
};

export default FilterClipItem;
