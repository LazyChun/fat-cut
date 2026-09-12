import React, { useCallback, useMemo, useState } from "react";
import { Input, Tabs, Tooltip } from "antd";
import { useI18n, useSdk } from "hooks";
import { editorStore, playbackStore } from "reducers";
import { EFFECT_CATEGORIES, setEffectPayload, getActiveClip } from "utils";
import type { EffectDefinition } from "utils";
import styles from "./EffectsPanel.less";

const EffectsPanel: React.FC = () => {
  const sdk = useSdk();
  const { text } = useI18n();
  const [keyword, setKeyword] = useState("");

  const handleApply = useCallback(
    (effect: EffectDefinition) => {
      const project = editorStore.getState().project;
      const activeClip = project
        ? getActiveClip(project.tracks, playbackStore.getState().currentTime)
        : undefined;
      if (!activeClip) {
        sdk.ui.toast.warn(text("cut.effects.noActiveClip"));
        return;
      }
      if (activeClip.type === "audio") {
        sdk.ui.toast.warn(text("cut.effects.audioNotSupported"));
        return;
      }
      const eid = editorStore.addClipEffect(activeClip.id, {
        type: effect.id,
      });
      if (eid) {
        sdk.ui.toast.success(text("cut.effects.added"));
      }
    },
    [sdk, text],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, effect: EffectDefinition) => {
      setEffectPayload(e, { effectTypeId: effect.id });
    },
    [],
  );

  const tabItems = useMemo(
    () =>
      EFFECT_CATEGORIES.map((category) => ({
        key: category.id,
        label: text(category.nameKey),
        children: (
          <div className={styles.grid}>
            {category.effects
              .filter(
                (eff) =>
                  !keyword ||
                  text(eff.nameKey)
                    .toLowerCase()
                    .includes(keyword.toLowerCase()),
              )
              .map((eff) => (
                <Tooltip
                  key={eff.id}
                  title={text("cut.text.dragHint")}
                  mouseEnterDelay={0.6}
                >
                  <div
                    className={styles.cell}
                    draggable
                    onDragStart={(e) => handleDragStart(e, eff)}
                    onClick={() => handleApply(eff)}
                    role="button"
                    tabIndex={0}
                  >
                    <div
                      className={styles.thumbnail}
                      style={eff.thumbnailStyle}
                    />
                    <div className={styles.name}>{text(eff.nameKey)}</div>
                  </div>
                </Tooltip>
              ))}
          </div>
        ),
      })),
    [keyword, text, handleApply, handleDragStart],
  );

  return (
    <div className={styles.panel}>
      <div className={styles.hint}>{text("cut.effects.hint")}</div>
      <div className={styles.search}>
        <Input.Search
          size="small"
          allowClear
          placeholder={text("cut.effects.searchPlaceholder")}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>
      <Tabs
        className={styles.tabs}
        defaultActiveKey={EFFECT_CATEGORIES[0].id}
        items={tabItems}
        size="small"
        tabPosition="left"
      />
    </div>
  );
};

export default EffectsPanel;
