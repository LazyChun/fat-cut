import React, { useCallback, useMemo } from "react";
import { Button, Input, InputNumber, Tooltip } from "antd";
import { Icon } from "components";
import { useI18n, useSdk } from "hooks";
import {
  editorStore,
  playbackStore,
  useEditorStore,
  usePlaybackStore,
} from "reducers";
import {
  getSubtitles,
  getTimelineEnd,
  setOverlayPayload,
  timelineDuration,
  timelineOut,
} from "utils";
import styles from "./SubtitlesPanel.less";

interface SubtitlePreset {
  id: string;
  nameKey: string;
  config: Cut.TextConfig;
  previewStyle: React.CSSProperties;
}

const SUBTITLE_PRESETS: SubtitlePreset[] = [
  {
    id: "classic",
    nameKey: "cut.subtitle.presetClassic",
    config: {
      content: "经典字幕样式",
      fontFamily: "Arial, sans-serif",
      fontSize: 28,
      color: "#ffffff",
      bold: false,
      italic: false,
      align: "center",
      strokeWidth: 2,
      strokeColor: "#000000",
      shadow: true,
    },
    previewStyle: {
      fontSize: 15,
      color: "#ffffff",
      WebkitTextStroke: "0.5px #000",
      textShadow: "0 1px 3px rgba(0,0,0,0.6)",
    },
  },
  {
    id: "bold",
    nameKey: "cut.subtitle.presetBold",
    config: {
      content: "粗体大字幕",
      fontFamily: "Arial, sans-serif",
      fontSize: 36,
      color: "#ffffff",
      bold: true,
      italic: false,
      align: "center",
      strokeWidth: 3,
      strokeColor: "#000000",
    },
    previewStyle: {
      fontSize: 17,
      fontWeight: 700,
      color: "#ffffff",
      WebkitTextStroke: "0.8px #000",
    },
  },
  {
    id: "outline",
    nameKey: "cut.subtitle.presetOutline",
    config: {
      content: "描边字幕",
      fontFamily: "Arial, sans-serif",
      fontSize: 30,
      color: "#ffe58f",
      bold: true,
      italic: false,
      align: "center",
      strokeWidth: 2,
      strokeColor: "#000000",
    },
    previewStyle: {
      fontSize: 16,
      fontWeight: 700,
      color: "#ffe58f",
      WebkitTextStroke: "0.6px #000",
    },
  },
  {
    id: "darkbg",
    nameKey: "cut.subtitle.presetDarkBg",
    config: {
      content: "暗底字幕",
      fontFamily: "Arial, sans-serif",
      fontSize: 26,
      color: "#ffffff",
      bold: false,
      italic: false,
      align: "center",
      backgroundColor: "rgba(0,0,0,0.65)",
    },
    previewStyle: {
      fontSize: 14,
      color: "#ffffff",
      background: "rgba(0,0,0,0.65)",
      padding: "2px 8px",
      borderRadius: 3,
    },
  },
  {
    id: "neon",
    nameKey: "cut.subtitle.presetNeon",
    config: {
      content: "霓虹字幕",
      fontFamily: "Arial, sans-serif",
      fontSize: 30,
      color: "#73d13d",
      bold: true,
      italic: false,
      align: "center",
      shadow: true,
    },
    previewStyle: {
      fontSize: 16,
      fontWeight: 700,
      color: "#73d13d",
      textShadow: "0 0 4px #73d13d, 0 0 8px #52c41a",
    },
  },
  {
    id: "karaoke",
    nameKey: "cut.subtitle.presetKaraoke",
    config: {
      content: "卡拉OK字幕",
      fontFamily: "Arial, sans-serif",
      fontSize: 28,
      color: "#ff7a45",
      bold: true,
      italic: false,
      align: "center",
      strokeWidth: 1,
      strokeColor: "#5c0011",
    },
    previewStyle: {
      fontSize: 15,
      fontWeight: 700,
      color: "#ff7a45",
      WebkitTextStroke: "0.4px #5c0011",
    },
  },
];

const SubtitlesPanel: React.FC = () => {
  const sdk = useSdk();
  const { text } = useI18n();
  const { project, selectedClipId } = useEditorStore();
  const { currentTime } = usePlaybackStore();

  const subtitles = useMemo(() => {
    if (!project) return [];
    return getSubtitles(project.tracks);
  }, [project]);

  const refreshDuration = useCallback(() => {
    const currentProject = editorStore.getState().project;
    if (currentProject) {
      playbackStore.setDuration(getTimelineEnd(currentProject.tracks));
    }
  }, []);

  const handleAddByPreset = useCallback(
    (preset: SubtitlePreset) => {
      const clipId = editorStore.addSubtitleClip(preset.config);
      if (clipId) {
        refreshDuration();
        sdk.ui.toast.success(text("cut.subtitle.added"));
      } else {
        sdk.ui.toast.warn(text("cut.timeline.empty"));
      }
    },
    [sdk, text, refreshDuration],
  );

  const handleAddBlank = useCallback(() => {
    const blank: Cut.TextConfig = {
      content: text("cut.subtitle.defaultContent"),
      fontFamily: "Arial, sans-serif",
      fontSize: 28,
      color: "#ffffff",
      bold: false,
      italic: false,
      align: "center",
      strokeWidth: 2,
      strokeColor: "#000000",
      shadow: true,
    };
    handleAddByPreset({ id: "blank", nameKey: "", config: blank, previewStyle: {} });
  }, [handleAddByPreset, text]);

  const handleDragStart = useCallback(
    (e: React.DragEvent, preset: SubtitlePreset) => {
      setOverlayPayload(e, { kind: "subtitle", preset: { ...preset.config } });
    },
    [],
  );

  const handleSelectAndSeek = useCallback((clip: Cut.Clip) => {
    editorStore.setSelection({ clipId: clip.id, trackId: clip.trackId });
    playbackStore.seek(clip.timelineIn);
  }, []);

  const handleContentChange = useCallback(
    (clip: Cut.Clip, content: string) => {
      if (!clip.text) return;
      editorStore.updateClip(clip.id, {
        text: { ...clip.text, content },
      });
    },
    [],
  );

  // 字幕的时长由 sourceOut - sourceIn 决定（speed=1）。
  // 调整起始时间只改 timelineIn；调整结束时间通过改 sourceOut 来改时长。
  const handleStartChange = useCallback((clip: Cut.Clip, start: number) => {
    const next = Math.max(0, start);
    editorStore.updateClip(clip.id, { timelineIn: next });
  }, []);

  const handleEndChange = useCallback((clip: Cut.Clip, end: number) => {
    const dur = timelineDuration(clip);
    const minDur = 0.1;
    const nextDuration = Math.max(minDur, end - clip.timelineIn);
    const delta = nextDuration - dur;
    editorStore.updateClip(clip.id, {
      sourceOut: clip.sourceOut + delta,
    });
  }, []);

  const handleDelete = useCallback(
    (clipId: string) => {
      editorStore.deleteClip(clipId);
      refreshDuration();
    },
    [refreshDuration],
  );

  return (
    <div className={styles.panel}>
      <div className={styles.hint}>{text("cut.subtitle.hint")}</div>
      <div className={styles.toolbar}>
        <Button
          size="small"
          type="primary"
          icon={<Icon name="plus" size={14} />}
          onClick={handleAddBlank}
        >
          {text("cut.subtitle.add")}
        </Button>
      </div>
      <div className={styles.sectionTitle}>
        {text("cut.subtitle.styles")}
      </div>
      <div className={styles.presets}>
        {SUBTITLE_PRESETS.map((preset) => (
          <Tooltip
            key={preset.id}
            title={text("cut.subtitle.dragHint")}
            mouseEnterDelay={0.6}
          >
            <div
              className={styles.preset}
              draggable
              onDragStart={(e) => handleDragStart(e, preset)}
              onClick={() => handleAddByPreset(preset)}
              role="button"
              tabIndex={0}
            >
              <div className={styles.presetPreview}>
                <span style={preset.previewStyle}>
                  {text(preset.nameKey)}
                </span>
              </div>
              <div className={styles.presetName}>
                {text(preset.nameKey)}
              </div>
            </div>
          </Tooltip>
        ))}
      </div>
      <div className={styles.sectionTitle}>
        {text("cut.subtitle.list")}
      </div>
      <div className={styles.list}>
        {subtitles.length === 0 ? (
          <div className={styles.empty}>{text("cut.subtitle.empty")}</div>
        ) : (
          subtitles.map((clip, index) => {
            const isActive = clip.id === selectedClipId;
            const isCurrent =
              currentTime >= clip.timelineIn &&
              currentTime < timelineOut(clip);
            return (
              <div
                key={clip.id}
                className={`${styles.item}${isActive ? ` ${styles.itemActive}` : ""}`}
                onClick={() => handleSelectAndSeek(clip)}
              >
                <div className={styles.itemHead}>
                  <span className={styles.index}>{index + 1}</span>
                  <div className={styles.times}>
                    <InputNumber
                      className={styles.timeInput}
                      size="small"
                      min={0}
                      step={0.1}
                      value={Number(clip.timelineIn.toFixed(2))}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(v) =>
                        v != null && handleStartChange(clip, v)
                      }
                    />
                    <span className={styles.arrow}>→</span>
                    <InputNumber
                      className={styles.timeInput}
                      size="small"
                      min={0}
                      step={0.1}
                      value={Number(timelineOut(clip).toFixed(2))}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(v) =>
                        v != null && handleEndChange(clip, v)
                      }
                    />
                    <span className={styles.duration}>
                      {isCurrent ? text("cut.subtitle.playing") : ""}
                      {timelineDuration(clip).toFixed(1)}
                      {text("cut.common.seconds")}
                    </span>
                  </div>
                  <Button
                    className={styles.deleteBtn}
                    size="small"
                    type="text"
                    danger
                    icon={<Icon name="trash" size={14} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(clip.id);
                    }}
                  />
                </div>
                <Input
                  className={styles.contentInput}
                  size="small"
                  value={clip.text?.content ?? ""}
                  placeholder={text("cut.subtitle.contentPlaceholder")}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => handleContentChange(clip, e.target.value)}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SubtitlesPanel;
