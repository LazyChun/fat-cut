import React, { useEffect, useMemo, useRef } from "react";
import { InputNumber, Slider } from "antd";
import { FatForm } from "components";
import {
  useEditorStore,
  editorStore,
  playbackStore,
  usePlaybackCurrentTime,
} from "reducers";
import {
  findAdjacentClipKeyframeTime,
  findClip,
  getClipKeyframeAtTime,
  hasClipKeyframesForProperty,
  resolveClipNumericValue,
  timelineDuration,
  timelineOut,
} from "utils";
import { useI18n } from "hooks";
import {
  TextProperties,
  StickerProperties,
  EffectProperties,
} from "./components";
import styles from "./ClipProperties.less";

interface ClipFormValues {
  sourceIn: number;
  sourceOut: number;
  timelineIn: number;
  volume: number;
  opacity: number;
  speed: number;
  transformX: number;
  transformY: number;
  transformScale: number;
  transformScaleX?: number;
  transformScaleY?: number;
  transformRotation: number;
}

interface KeyframeFieldConfig {
  property: Cut.ClipKeyframeProperty;
  labelId: string;
}

const KEYFRAME_FIELD_CONFIGS: KeyframeFieldConfig[] = [
  {
    property: "opacity",
    labelId: "cut.option.opacity",
  },
  {
    property: "transform.x",
    labelId: "cut.option.x",
  },
  {
    property: "transform.y",
    labelId: "cut.option.y",
  },
  {
    property: "transform.scale",
    labelId: "cut.option.scale",
  },
  {
    property: "transform.scaleX",
    labelId: "cut.option.scaleX",
  },
  {
    property: "transform.scaleY",
    labelId: "cut.option.scaleY",
  },
  {
    property: "transform.rotation",
    labelId: "cut.option.rotation",
  },
];

const ClipProperties: React.FC = () => {
  const { project, selectedClipId } = useEditorStore();
  const currentTime = usePlaybackCurrentTime();
  const { text } = useI18n();
  const [form] = FatForm.useForm<ClipFormValues>();
  const syncingFormRef = useRef(false);

  const found =
    project && selectedClipId
      ? findClip(project.tracks, selectedClipId)
      : undefined;
  const clip = found?.clip;
  const withinClip =
    !!clip &&
    currentTime >= clip.timelineIn &&
    currentTime <= timelineOut(clip) + 0.001;
  const currentClipTime = clip ? Math.max(0, currentTime - clip.timelineIn) : 0;

  const keyframeStates = useMemo(() => {
    if (!clip) {
      return {} as Record<Cut.ClipKeyframeProperty, boolean>;
    }
    return KEYFRAME_FIELD_CONFIGS.reduce(
      (acc, item) => {
        acc[item.property] = !!getClipKeyframeAtTime(
          clip,
          item.property,
          currentTime,
        );
        return acc;
      },
      {} as Record<Cut.ClipKeyframeProperty, boolean>,
    );
  }, [clip, currentTime]);

  const hasAnyKeyframes = useMemo(() => {
    return (
      clip?.keyframes?.some((track) => track.keyframes.length > 0) ?? false
    );
  }, [clip?.keyframes]);

  const previousKeyframeTime = clip
    ? findAdjacentClipKeyframeTime(clip, currentTime, "prev")
    : undefined;
  const nextKeyframeTime = clip
    ? findAdjacentClipKeyframeTime(clip, currentTime, "next")
    : undefined;

  useEffect(() => {
    if (!clip) return;
    syncingFormRef.current = true;
    form.setFieldsValue({
      sourceIn: clip.sourceIn,
      sourceOut: clip.sourceOut,
      timelineIn: clip.timelineIn,
      volume: clip.volume,
      opacity: resolveClipNumericValue(clip, "opacity", currentTime),
      speed: clip.speed,
      transformX: resolveClipNumericValue(clip, "transform.x", currentTime),
      transformY: resolveClipNumericValue(clip, "transform.y", currentTime),
      transformScale: resolveClipNumericValue(
        clip,
        "transform.scale",
        currentTime,
      ),
      transformScaleX: hasClipKeyframesForProperty(clip, "transform.scaleX")
        ? resolveClipNumericValue(clip, "transform.scaleX", currentTime)
        : clip.transform.scaleX,
      transformScaleY: hasClipKeyframesForProperty(clip, "transform.scaleY")
        ? resolveClipNumericValue(clip, "transform.scaleY", currentTime)
        : clip.transform.scaleY,
      transformRotation: resolveClipNumericValue(
        clip,
        "transform.rotation",
        currentTime,
      ),
    });
    queueMicrotask(() => {
      syncingFormRef.current = false;
    });
  }, [clip, currentTime, form]);

  if (!clip) return null;

  const handleValuesChange = (
    _changed: Partial<ClipFormValues>,
    all: ClipFormValues,
  ) => {
    if (syncingFormRef.current) {
      return;
    }
    const basePatch: Partial<Cut.Clip> = {};
    const motionPatch: Partial<{
      x: number;
      y: number;
      scale: number;
      scaleX: number | undefined;
      scaleY: number | undefined;
      rotation: number;
      opacity: number;
    }> = {};

    if ("sourceIn" in _changed) basePatch.sourceIn = all.sourceIn;
    if ("sourceOut" in _changed) basePatch.sourceOut = all.sourceOut;
    if ("timelineIn" in _changed) basePatch.timelineIn = all.timelineIn;
    if ("volume" in _changed) basePatch.volume = all.volume;
    if ("speed" in _changed) basePatch.speed = all.speed;
    if ("opacity" in _changed) motionPatch.opacity = all.opacity;
    if ("transformX" in _changed) motionPatch.x = all.transformX;
    if ("transformY" in _changed) motionPatch.y = all.transformY;
    if ("transformScale" in _changed) motionPatch.scale = all.transformScale;
    if ("transformScaleX" in _changed) {
      motionPatch.scaleX = all.transformScaleX;
    }
    if ("transformScaleY" in _changed) {
      motionPatch.scaleY = all.transformScaleY;
    }
    if ("transformRotation" in _changed) {
      motionPatch.rotation = all.transformRotation;
    }

    if (Object.keys(basePatch).length > 0) {
      editorStore.updateClip(clip.id, basePatch);
    }
    if (Object.keys(motionPatch).length > 0) {
      editorStore.updateClipMotion(clip.id, motionPatch, currentTime);
    }
  };

  const handleToggleKeyframe = (property: Cut.ClipKeyframeProperty) => {
    if (!withinClip) {
      return;
    }
    editorStore.toggleClipKeyframe(clip.id, property, currentTime);
  };

  const jumpToKeyframe = (direction: "prev" | "next") => {
    const target =
      direction === "prev" ? previousKeyframeTime : nextKeyframeTime;
    if (target !== undefined) {
      playbackStore.seek(target);
    }
  };

  const renderKeyframeLabel = (
    labelId: string,
    property: Cut.ClipKeyframeProperty,
  ) => {
    const isActive = keyframeStates[property];
    return (
      <div className={styles.fieldLabel}>
        <span>{text(labelId)}</span>
        <button
          type="button"
          className={`${styles.keyframeButton}${isActive ? ` ${styles.keyframeButtonActive}` : ""}`}
          disabled={!withinClip}
          title={text(
            isActive ? "cut.keyframe.removeCurrent" : "cut.keyframe.addCurrent",
          )}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleToggleKeyframe(property);
          }}
        >
          {isActive ? "◆" : "◇"}
        </button>
      </div>
    );
  };

  const keyframeTimeText = withinClip
    ? `${text("cut.keyframe.currentTime")}: ${currentClipTime.toFixed(2)} ${text("cut.common.seconds")}`
    : text("cut.keyframe.outOfRange");

  const duration = timelineDuration(clip);
  const isText =
    (clip.type === "text" || clip.type === "subtitle") && !!clip.text;
  const isSticker = clip.type === "sticker" && !!clip.sticker;
  const hasEffects = clip.type !== "audio" && clip.effects.length > 0;
  const showAudioFields = clip.type === "video" || clip.type === "audio";

  return (
    <div className={styles.container}>
      <div className={styles.header}>{text("cut.option.clip")}</div>
      {isText && clip.text && (
        <TextProperties clipId={clip.id} config={clip.text} />
      )}
      {isSticker && clip.sticker && (
        <StickerProperties clipId={clip.id} config={clip.sticker} />
      )}
      {hasEffects && (
        <EffectProperties clipId={clip.id} effects={clip.effects} />
      )}
      <div className={styles.keyframeToolbar}>
        <div>
          <div className={styles.sectionTitle}>
            {text("cut.keyframe.title")}
          </div>
          <div className={styles.keyframeHint}>{keyframeTimeText}</div>
        </div>
        <div className={styles.keyframeNav}>
          <button
            type="button"
            className={styles.navButton}
            disabled={previousKeyframeTime === undefined}
            onClick={() => jumpToKeyframe("prev")}
          >
            {text("cut.keyframe.prev")}
          </button>
          <button
            type="button"
            className={styles.navButton}
            disabled={nextKeyframeTime === undefined}
            onClick={() => jumpToKeyframe("next")}
          >
            {text("cut.keyframe.next")}
          </button>
        </div>
      </div>
      {hasAnyKeyframes && (
        <div className={styles.keyframeSummary}>
          {text("cut.keyframe.timelineHint")}
        </div>
      )}
      <FatForm<ClipFormValues>
        form={form}
        onValuesChange={handleValuesChange}
        layout="vertical"
      >
        <FatForm.Item label={text("cut.option.sourceIn")} name="sourceIn">
          <InputNumber
            min={0}
            step={0.1}
            addonAfter={text("cut.common.seconds")}
            style={{ width: "100%" }}
          />
        </FatForm.Item>
        <FatForm.Item label={text("cut.option.sourceOut")} name="sourceOut">
          <InputNumber
            min={0}
            step={0.1}
            addonAfter={text("cut.common.seconds")}
            style={{ width: "100%" }}
          />
        </FatForm.Item>
        <FatForm.Item label={text("cut.option.timelineIn")} name="timelineIn">
          <InputNumber
            min={0}
            step={0.1}
            addonAfter={text("cut.common.seconds")}
            style={{ width: "100%" }}
          />
        </FatForm.Item>
        <div className={styles.readonly}>
          {text("cut.option.duration")}: {duration.toFixed(2)}{" "}
          {text("cut.common.seconds")}
        </div>
        {showAudioFields && (
          <FatForm.Item label={text("cut.option.volume")} name="volume">
            <Slider min={0} max={1} step={0.05} />
          </FatForm.Item>
        )}
        <FatForm.Item
          label={renderKeyframeLabel("cut.option.opacity", "opacity")}
          name="opacity"
        >
          <Slider min={0} max={1} step={0.05} />
        </FatForm.Item>
        {showAudioFields && (
          <FatForm.Item label={text("cut.option.speed")} name="speed">
            <InputNumber
              min={0.25}
              max={4}
              step={0.25}
              style={{ width: "100%" }}
            />
          </FatForm.Item>
        )}
        <div className={styles.sectionTitle}>
          {text("cut.option.transform")}
        </div>
        <FatForm.Item
          label={renderKeyframeLabel("cut.option.x", "transform.x")}
          name="transformX"
        >
          <InputNumber step={1} style={{ width: "100%" }} />
        </FatForm.Item>
        <FatForm.Item
          label={renderKeyframeLabel("cut.option.y", "transform.y")}
          name="transformY"
        >
          <InputNumber step={1} style={{ width: "100%" }} />
        </FatForm.Item>
        <FatForm.Item
          label={renderKeyframeLabel("cut.option.scale", "transform.scale")}
          name="transformScale"
        >
          <InputNumber
            min={0.1}
            max={10}
            step={0.1}
            style={{ width: "100%" }}
          />
        </FatForm.Item>
        <FatForm.Item
          label={renderKeyframeLabel("cut.option.scaleX", "transform.scaleX")}
          name="transformScaleX"
        >
          <InputNumber
            min={0.1}
            max={10}
            step={0.1}
            style={{ width: "100%" }}
            placeholder={String(clip.transform.scale)}
          />
        </FatForm.Item>
        <FatForm.Item
          label={renderKeyframeLabel("cut.option.scaleY", "transform.scaleY")}
          name="transformScaleY"
        >
          <InputNumber
            min={0.1}
            max={10}
            step={0.1}
            style={{ width: "100%" }}
            placeholder={String(clip.transform.scale)}
          />
        </FatForm.Item>
        <FatForm.Item
          label={renderKeyframeLabel(
            "cut.option.rotation",
            "transform.rotation",
          )}
          name="transformRotation"
        >
          <InputNumber min={0} max={360} step={1} style={{ width: "100%" }} />
        </FatForm.Item>
      </FatForm>
    </div>
  );
};

export default ClipProperties;
