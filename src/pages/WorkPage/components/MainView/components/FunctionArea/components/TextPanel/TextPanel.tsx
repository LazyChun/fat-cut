import React, { useCallback } from "react";
import { Tooltip } from "antd";
import { useI18n, useSdk } from "hooks";
import { editorStore, playbackStore } from "reducers";
import { getTimelineEnd, setOverlayPayload } from "utils";
import styles from "./TextPanel.less";

interface TextPreset {
  id: string;
  nameKey: string;
  config: Cut.TextConfig;
  previewStyle: React.CSSProperties;
}

const TEXT_PRESETS: TextPreset[] = [
  {
    id: "title",
    nameKey: "cut.text.presetTitle",
    config: {
      content: "标题文字",
      fontFamily: "Arial, sans-serif",
      fontSize: 48,
      color: "#ffffff",
      bold: true,
      italic: false,
      align: "center",
      shadow: true,
    },
    previewStyle: {
      fontSize: 22,
      fontWeight: 700,
      color: "#ffffff",
      textShadow: "0 1px 4px rgba(0,0,0,0.6)",
    },
  },
  {
    id: "subtitle",
    nameKey: "cut.text.presetSubtitle",
    config: {
      content: "副标题",
      fontFamily: "Arial, sans-serif",
      fontSize: 32,
      color: "#ffffff",
      bold: false,
      italic: false,
      align: "center",
      shadow: true,
    },
    previewStyle: {
      fontSize: 16,
      color: "#ffffff",
      textShadow: "0 1px 3px rgba(0,0,0,0.6)",
    },
  },
  {
    id: "body",
    nameKey: "cut.text.presetBody",
    config: {
      content: "正文内容",
      fontFamily: "Arial, sans-serif",
      fontSize: 24,
      color: "#ffffff",
      bold: false,
      italic: false,
      align: "center",
    },
    previewStyle: {
      fontSize: 14,
      color: "#ffffff",
    },
  },
  {
    id: "caption",
    nameKey: "cut.text.presetCaption",
    config: {
      content: "字幕说明",
      fontFamily: "Arial, sans-serif",
      fontSize: 18,
      color: "#ffe58f",
      bold: false,
      italic: false,
      align: "center",
      strokeWidth: 1,
      strokeColor: "#000000",
    },
    previewStyle: {
      fontSize: 12,
      color: "#ffe58f",
      WebkitTextStroke: "0.5px #000",
    },
  },
  {
    id: "italic",
    nameKey: "cut.text.presetItalic",
    config: {
      content: "斜体文字",
      fontFamily: "Georgia, serif",
      fontSize: 26,
      color: "#ffffff",
      bold: false,
      italic: true,
      align: "center",
    },
    previewStyle: {
      fontSize: 15,
      color: "#ffffff",
      fontStyle: "italic",
      fontFamily: "Georgia, serif",
    },
  },
  {
    id: "neon",
    nameKey: "cut.text.presetNeon",
    config: {
      content: "霓虹文字",
      fontFamily: "Arial, sans-serif",
      fontSize: 36,
      color: "#73d13d",
      bold: true,
      italic: false,
      align: "center",
      shadow: true,
    },
    previewStyle: {
      fontSize: 18,
      fontWeight: 700,
      color: "#73d13d",
      textShadow:
        "0 0 4px #73d13d, 0 0 8px #73d13d, 0 0 12px #52c41a",
    },
  },
  {
    id: "outline",
    nameKey: "cut.text.presetOutline",
    config: {
      content: "描边文字",
      fontFamily: "Arial, sans-serif",
      fontSize: 32,
      color: "#ffffff",
      bold: true,
      italic: false,
      align: "center",
      strokeWidth: 2,
      strokeColor: "#000000",
    },
    previewStyle: {
      fontSize: 17,
      fontWeight: 700,
      color: "#ffffff",
      WebkitTextStroke: "1px #000",
    },
  },
  {
    id: "banner",
    nameKey: "cut.text.presetBanner",
    config: {
      content: "横幅文字",
      fontFamily: "Arial, sans-serif",
      fontSize: 28,
      color: "#ffffff",
      bold: true,
      italic: false,
      align: "center",
      backgroundColor: "#1677ff",
    },
    previewStyle: {
      fontSize: 14,
      fontWeight: 700,
      color: "#ffffff",
      background: "#1677ff",
      padding: "2px 8px",
      borderRadius: 3,
    },
  },
];

const TextPanel: React.FC = () => {
  const sdk = useSdk();
  const { text } = useI18n();

  const handleAdd = useCallback(
    (preset: TextPreset) => {
      const clipId = editorStore.addOverlayClip({
        type: "text",
        text: { ...preset.config },
      });
      if (clipId) {
        const project = editorStore.getState().project;
        if (project) {
          playbackStore.setDuration(getTimelineEnd(project.tracks));
        }
        sdk.ui.toast.success(text("cut.text.added"));
      } else {
        sdk.ui.toast.warn(text("cut.timeline.empty"));
      }
    },
    [sdk, text],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, preset: TextPreset) => {
      setOverlayPayload(e, {
        kind: "text",
        preset: { ...preset.config },
      });
    },
    [],
  );

  return (
    <div className={styles.panel}>
      <div className={styles.hint}>{text("cut.text.hint")}</div>
      <div className={styles.grid}>
        {TEXT_PRESETS.map((preset) => (
          <Tooltip
            key={preset.id}
            title={text("cut.text.dragHint")}
            mouseEnterDelay={0.6}
          >
            <div
              className={styles.card}
              draggable
              onDragStart={(e) => handleDragStart(e, preset)}
              onClick={() => handleAdd(preset)}
              role="button"
              tabIndex={0}
            >
              <div className={styles.preview}>
                <span style={preset.previewStyle}>
                  {text(preset.nameKey)}
                </span>
              </div>
              <div className={styles.name}>{text(preset.nameKey)}</div>
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  );
};

export default TextPanel;
