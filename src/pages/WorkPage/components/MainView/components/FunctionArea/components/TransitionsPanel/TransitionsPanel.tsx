import React, { useCallback, useMemo, useState } from "react";
import { Input, Tabs, Tooltip } from "antd";
import { useI18n, useSdk } from "hooks";
import { editorStore, playbackStore } from "reducers";
import {
  TRANSITION_CATEGORIES,
  setTransitionPayload,
  getActiveClip,
} from "utils";
import type { TransitionDefinition } from "utils";
import styles from "./TransitionsPanel.less";

const TransitionsPanel: React.FC = () => {
  const sdk = useSdk();
  const { text } = useI18n();
  const [keyword, setKeyword] = useState("");

  const handleApply = useCallback(
    (transition: TransitionDefinition) => {
      const project = editorStore.getState().project;
      const activeClip = project
        ? getActiveClip(project.tracks, playbackStore.getState().currentTime)
        : undefined;
      if (!activeClip) {
        sdk.ui.toast.warn(text("cut.transitions.noActiveClip"));
        return;
      }
      if (activeClip.type === "audio") {
        sdk.ui.toast.warn(text("cut.transitions.audioNotSupported"));
        return;
      }
      const tid = editorStore.addClipTransition(activeClip.id, "out", {
        type: transition.id,
      });
      if (tid) {
        sdk.ui.toast.success(text("cut.transitions.added"));
      }
    },
    [sdk, text],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, transition: TransitionDefinition) => {
      setTransitionPayload(e, {
        transitionTypeId: transition.id,
        edge: "out",
      });
    },
    [],
  );

  const tabItems = useMemo(
    () =>
      TRANSITION_CATEGORIES.map((category) => ({
        key: category.id,
        label: text(category.nameKey),
        children: (
          <div className={styles.grid}>
            {category.transitions
              .filter(
                (t) =>
                  !keyword ||
                  text(t.nameKey).toLowerCase().includes(keyword.toLowerCase()),
              )
              .map((t) => (
                <Tooltip
                  key={t.id}
                  title={text("cut.transitions.dragHint")}
                  mouseEnterDelay={0.6}
                >
                  <div
                    className={styles.cell}
                    draggable
                    onDragStart={(e) => handleDragStart(e, t)}
                    onClick={() => handleApply(t)}
                    role="button"
                    tabIndex={0}
                  >
                    <div
                      className={styles.thumbnail}
                      style={t.thumbnailStyle as React.CSSProperties}
                    />
                    <div className={styles.name}>{text(t.nameKey)}</div>
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
      <div className={styles.hint}>{text("cut.transitions.hint")}</div>
      <div className={styles.search}>
        <Input.Search
          size="small"
          allowClear
          placeholder={text("cut.transitions.searchPlaceholder")}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>
      <Tabs
        className={styles.tabs}
        defaultActiveKey={TRANSITION_CATEGORIES[0].id}
        items={tabItems}
        size="small"
        tabPosition="left"
      />
    </div>
  );
};

export default TransitionsPanel;
