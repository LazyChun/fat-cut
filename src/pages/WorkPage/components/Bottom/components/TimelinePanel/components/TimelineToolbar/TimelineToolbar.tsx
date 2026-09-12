import React, { useCallback } from "react";
import { Button, Dropdown, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { Icon } from "components";
import { useI18n, useSdk } from "hooks";
import { editorStore, useEditorStore, playbackStore } from "reducers";
import { findClip, timelineOut, getActiveClip } from "utils";
import styles from "./TimelineToolbar.less";

interface TimelineToolbarProps {
  onOpenAiDrawer: () => void;
  snapEnabled: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

const TimelineToolbar: React.FC<TimelineToolbarProps> = ({
  onOpenAiDrawer,
  snapEnabled,
  onZoomIn,
  onZoomOut,
  onFit,
}) => {
  const { text } = useI18n();
  const sdk = useSdk();
  const { selectedClipId } = useEditorStore();

  const addTrackItems: MenuProps["items"] = [
    {
      key: "video",
      label: text("cut.timeline.addVideoTrack"),
      onClick: () => editorStore.addTrack("video"),
    },
    {
      key: "audio",
      label: text("cut.timeline.addAudioTrack"),
      onClick: () => editorStore.addTrack("audio"),
    },
  ];

  const handleToggleSnap = useCallback(() => {
    editorStore.toggleSnap();
  }, []);

  // 优先使用包含播放头的已选片段；否则回退到当前播放头所在的活跃片段。
  const resolveTargetClip = useCallback((): Cut.Clip | undefined => {
    const project = editorStore.getState().project;
    if (!project) return undefined;
    const currentTime = playbackStore.getState().currentTime;
    if (selectedClipId) {
      const found = findClip(project.tracks, selectedClipId);
      if (found) {
        const { clip } = found;
        if (
          currentTime > clip.timelineIn + 0.001 &&
          currentTime < timelineOut(clip) - 0.001
        ) {
          return clip;
        }
      }
    }
    return getActiveClip(project.tracks, currentTime);
  }, [selectedClipId]);

  const handleSplit = useCallback(() => {
    const target = resolveTargetClip();
    if (!target) {
      sdk.ui.toast.warn(text("cut.clip.noActiveClip"));
      return;
    }
    editorStore.splitClip(target.id, playbackStore.getState().currentTime);
  }, [resolveTargetClip, sdk, text]);

  const handleCutLeft = useCallback(() => {
    const target = resolveTargetClip();
    if (!target) {
      sdk.ui.toast.warn(text("cut.clip.noActiveClip"));
      return;
    }
    editorStore.cutLeft(target.id, playbackStore.getState().currentTime);
  }, [resolveTargetClip, sdk, text]);

  const handleCutRight = useCallback(() => {
    const target = resolveTargetClip();
    if (!target) {
      sdk.ui.toast.warn(text("cut.clip.noActiveClip"));
      return;
    }
    editorStore.cutRight(target.id, playbackStore.getState().currentTime);
  }, [resolveTargetClip, sdk, text]);

  return (
    <div className={styles.toolbar}>
      <div className={styles.group}>
        <Tooltip title={text("cut.timeline.zoomOut")}>
          <Button
            type="text"
            size="small"
            icon={<Icon name="zoomOut" size={16} />}
            onClick={onZoomOut}
          />
        </Tooltip>
        <Tooltip title={text("cut.timeline.zoomIn")}>
          <Button
            type="text"
            size="small"
            icon={<Icon name="zoomIn" size={16} />}
            onClick={onZoomIn}
          />
        </Tooltip>
        <Tooltip title={text("cut.timeline.fit")}>
          <Button
            type="text"
            size="small"
            icon={<Icon name="fit" size={16} />}
            onClick={onFit}
          />
        </Tooltip>
      </div>
      <div className={styles.group}>
        <Tooltip title={text("cut.timeline.snap")}>
          <Button
            type="text"
            size="small"
            className={snapEnabled ? styles.active : undefined}
            icon={<Icon name="magnet" size={16} />}
            onClick={handleToggleSnap}
          />
        </Tooltip>
      </div>
      <div className={styles.group}>
        <Tooltip title={text("cut.clip.split")}>
          <Button
            type="text"
            size="small"
            icon={<Icon name="split" size={16} />}
            onClick={handleSplit}
          />
        </Tooltip>
        <Tooltip title={text("cut.clip.cutLeft")}>
          <Button
            type="text"
            size="small"
            icon={<Icon name="cutLeft" size={16} />}
            onClick={handleCutLeft}
          />
        </Tooltip>
        <Tooltip title={text("cut.clip.cutRight")}>
          <Button
            type="text"
            size="small"
            icon={<Icon name="cutRight" size={16} />}
            onClick={handleCutRight}
          />
        </Tooltip>
      </div>
      <div className={styles.group}>
        <Dropdown menu={{ items: addTrackItems }} trigger={["click"]}>
          <Tooltip title={text("cut.timeline.addTrack")}>
            <Button
              type="text"
              size="small"
              icon={<Icon name="plus" size={16} />}
            />
          </Tooltip>
        </Dropdown>
      </div>
      <div className={styles.aiAction}>
        <Button
          size="small"
          type="primary"
          icon={<Icon name="scissors" size={14} />}
          onClick={onOpenAiDrawer}
        >
          {text("cut.ai.button")}
        </Button>
      </div>
    </div>
  );
};

export default TimelineToolbar;
