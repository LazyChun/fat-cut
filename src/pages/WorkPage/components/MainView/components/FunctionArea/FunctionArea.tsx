import React, { useMemo } from "react";
import { Tabs } from "antd";
import type { AssetItem } from "fat-notes-sdk";
import { useI18n } from "hooks";
import {
  MaterialsPanel,
  PlaceholderPanel,
  TextPanel,
  StickersPanel,
  EffectsPanel,
  TransitionsPanel,
  FiltersPanel,
  SubtitlesPanel,
} from "./components";
import styles from "./FunctionArea.less";

interface FunctionAreaProps {
  assets: AssetItem[];
  onAssetsChange: (assets: AssetItem[]) => void;
}

const FunctionArea: React.FC<FunctionAreaProps> = ({
  assets,
  onAssetsChange,
}) => {
  const { text } = useI18n();

  const items = useMemo(
    () => [
      {
        key: "materials",
        label: text("cut.tabs.materials"),
        children: (
          <MaterialsPanel assets={assets} onAssetsChange={onAssetsChange} />
        ),
      },
      {
        key: "text",
        label: text("cut.tabs.text"),
        children: <TextPanel />,
      },
      {
        key: "stickers",
        label: text("cut.tabs.stickers"),
        children: <StickersPanel />,
      },
      {
        key: "effects",
        label: text("cut.tabs.effects"),
        children: <EffectsPanel />,
      },
      {
        key: "transitions",
        label: text("cut.tabs.transitions"),
        children: <TransitionsPanel />,
      },
      {
        key: "subtitles",
        label: text("cut.tabs.subtitles"),
        children: <SubtitlesPanel />,
      },
      {
        key: "filters",
        label: text("cut.tabs.filters"),
        children: <FiltersPanel />,
      },
    ],
    [assets, onAssetsChange, text],
  );

  return (
    <div className={styles.container}>
      <Tabs
        className={styles.tabs}
        defaultActiveKey="materials"
        items={items}
        size="small"
        tabPlacement="top"
      />
    </div>
  );
};

export default FunctionArea;
