import React, { useCallback, useState, useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Dropdown, type MenuProps } from "antd";
import { timelineDuration, getClipKeyframeTimelineTimes } from "utils";
import { editorStore, playbackStore } from "reducers";
import { useI18n } from "hooks";
import styles from "./Clip.less";

interface ClipProps {
  clip: Cut.Clip;
  pixelsPerSecond: number;
  selected: boolean;
  onSelect: (clipId: string, trackId: string) => void;
}

const TYPE_COLORS: Record<Cut.ClipType, string> = {
  video: "#1677ff",
  audio: "#52c41a",
  image: "#722ed1",
  text: "#fa8c16",
  sticker: "#eb2f96",
  subtitle: "#13c2c2",
};

const Clip: React.FC<ClipProps> = ({
  clip,
  pixelsPerSecond,
  selected,
  onSelect,
}) => {
  const { text } = useI18n();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: clip.id,
  });
  const [trim, setTrim] = useState<{
    edge: "left" | "right";
    delta: number;
  } | null>(null);

  const handleDelete = useCallback(() => {
    editorStore.deleteClip(clip.id);
  }, [clip.id]);

  const menuItems: MenuProps["items"] = [
    {
      key: "delete",
      label: text("cut.clip.delete"),
      danger: true,
      onClick: handleDelete,
    },
  ];

  const baseLeft = clip.timelineIn * pixelsPerSecond;
  const baseWidth = Math.max(8, timelineDuration(clip) * pixelsPerSecond);
  const color = TYPE_COLORS[clip.type] ?? "#1677ff";
  const name =
    clip.assetRef?.fileName ??
    clip.text?.content ??
    clip.sticker?.content ??
    clip.type;

  let displayLeft = baseLeft;
  let displayWidth = baseWidth;
  if (trim) {
    const deltaPx = trim.delta * pixelsPerSecond;
    if (trim.edge === "left") {
      const maxDeltaPx = baseWidth - 8;
      const clampedDeltaPx = Math.max(-baseLeft, Math.min(deltaPx, maxDeltaPx));
      displayLeft = baseLeft + clampedDeltaPx;
      displayWidth = baseWidth - clampedDeltaPx;
    } else {
      displayWidth = Math.max(8, baseWidth + deltaPx);
    }
  }

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, edge: "left" | "right") => {
      e.stopPropagation();
      e.preventDefault();
      const startClientX = e.clientX;
      setTrim({ edge, delta: 0 });
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - startClientX;
        const ds = dx / pixelsPerSecond;
        setTrim({ edge, delta: ds });
      };
      const up = (ev: PointerEvent) => {
        const dx = ev.clientX - startClientX;
        const ds = dx / pixelsPerSecond;
        editorStore.trimClip(clip.id, edge, ds);
        setTrim(null);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [clip.id, pixelsPerSecond],
  );

  const keyframeTimes = useMemo(() => {
    return getClipKeyframeTimelineTimes(clip);
  }, [clip.keyframes, clip.timelineIn]);

  return (
    <Dropdown menu={{ items: menuItems }} trigger={["contextMenu"]}>
      <div
        ref={setNodeRef}
        className={`${styles.clip}${selected ? ` ${styles.selected}` : ""}${isDragging ? ` ${styles.dragging}` : ""}`}
        style={{
          left: displayLeft,
          width: displayWidth,
          background: `${color}22`,
          borderColor: color,
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect(clip.id, clip.trackId);
        }}
        onContextMenu={(e) => {
          e.stopPropagation();
          onSelect(clip.id, clip.trackId);
        }}
        {...listeners}
        {...attributes}
      >
        <div className={styles.label} style={{ color }}>
          {name}
        </div>
        {clip.effects.length > 0 && (
          <div className={styles.effectBadge} title={`${clip.effects.length}`}>
            {clip.effects.length}
          </div>
        )}
        {keyframeTimes.map((t) => {
          // 如果当前处于 trim 状态，我们仍按照原始的时间比例显示
          const offsetPx = (t - clip.timelineIn) * pixelsPerSecond;
          // 如果 offsetPx 超出了当前的显示宽度（可能由于 trim 拖拽），可以选择隐藏，这里为了简单直接定位
          return (
            <div
              key={t}
              className={styles.keyframeMarker}
              style={{ left: offsetPx }}
              title={text("cut.keyframe.timelineHint")}
              onMouseDown={(e) => {
                e.stopPropagation();
                onSelect(clip.id, clip.trackId);
              }}
              onClick={(e) => {
                e.stopPropagation();
                playbackStore.seek(t);
              }}
            >
              ◆
            </div>
          );
        })}
        <div
          className={styles.handle}
          data-edge="left"
          onPointerDown={(e) => handlePointerDown(e, "left")}
        />
        <div
          className={styles.handle}
          data-edge="right"
          onPointerDown={(e) => handlePointerDown(e, "right")}
        />
      </div>
    </Dropdown>
  );
};

export default Clip;
