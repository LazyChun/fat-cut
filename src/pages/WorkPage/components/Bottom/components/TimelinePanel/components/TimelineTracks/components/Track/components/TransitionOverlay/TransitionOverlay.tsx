import React from "react";
import { Dropdown, Tooltip, type MenuProps } from "antd";
import { getTransitionDefinition, timelineOut } from "utils";
import { useI18n } from "hooks";
import styles from "./TransitionOverlay.less";

interface TransitionOverlayProps {
  prevClip: Cut.Clip;
  nextClip: Cut.Clip;
  pixelsPerSecond: number;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

const TransitionOverlay: React.FC<TransitionOverlayProps> = ({
  prevClip,
  nextClip,
  pixelsPerSecond,
  selected,
  onSelect,
  onDelete,
}) => {
  const { text } = useI18n();
  const transition = prevClip.transitionOut!;

  const boundaryX = timelineOut(prevClip) * pixelsPerSecond;
  const widthPx = Math.max(
    28,
    transition.duration * pixelsPerSecond,
  );
  const left = boundaryX - widthPx / 2;
  // nextClip 用于未来在 overlay 上同时呈现两侧缩略图;目前仅用作占位避免未用警告
  void nextClip;

  const def = getTransitionDefinition(transition.type);
  const tooltipText = def ? text(def.nameKey) : text("cut.tabs.transitions");

  const menuItems: MenuProps["items"] = [
    {
      key: "delete",
      label: text("cut.transitions.delete"),
      danger: true,
      onClick: onDelete,
    },
  ];

  return (
    <Dropdown menu={{ items: menuItems }} trigger={["contextMenu"]}>
      <Tooltip title={tooltipText} mouseEnterDelay={0.4}>
        <div
          className={`${styles.overlay}${selected ? ` ${styles.selected}` : ""}`}
          style={{ left, width: widthPx }}
          onMouseDown={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          onContextMenu={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          <span className={styles.icon}>◆</span>
        </div>
      </Tooltip>
    </Dropdown>
  );
};

export default TransitionOverlay;
