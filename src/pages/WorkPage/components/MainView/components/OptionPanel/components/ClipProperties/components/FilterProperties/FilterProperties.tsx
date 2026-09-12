import React from "react";
import { Button, InputNumber, Slider } from "antd";
import { editorStore, useEditorStore } from "reducers";
import { useI18n } from "hooks";
import { getFilterDefinition } from "utils";
import styles from "./FilterProperties.less";

const numValue = (
  params: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
): number => {
  if (!params) return fallback;
  const v = params[key];
  return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
};

const FilterProperties: React.FC = () => {
  const { text } = useI18n();
  const { project, selectedFilterClipId } = useEditorStore();

  const filterClip =
    project?.filterClips?.find((f) => f.id === selectedFilterClipId) ??
    undefined;

  if (!filterClip) return null;

  const def = getFilterDefinition(filterClip.type);
  if (!def) return null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>{text("cut.filters.properties")}</span>
        <Button
          size="small"
          danger
          onClick={() => editorStore.removeFilterClip(filterClip.id)}
        >
          {text("cut.filters.delete")}
        </Button>
      </div>
      <div className={styles.filterName}>{text(def.nameKey)}</div>
      <div className={styles.durationRow}>
        <span className={styles.paramLabel}>
          {text("cut.filters.duration")}
        </span>
        <InputNumber
          size="small"
          min={0.1}
          step={0.1}
          value={Number(filterClip.duration.toFixed(2))}
          onChange={(value) => {
            if (typeof value === "number" && value > 0) {
              editorStore.updateFilterClip(filterClip.id, { duration: value });
            }
          }}
          addonAfter={text("cut.common.seconds")}
          style={{ width: "100%" }}
        />
      </div>
      {def.paramSpecs.map((spec) => (
        <div key={spec.key} className={styles.param}>
          <div className={styles.paramLabel}>{text(spec.labelKey)}</div>
          <Slider
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={numValue(filterClip.params, spec.key, spec.default)}
            onChange={(value) =>
              editorStore.updateFilterClip(filterClip.id, {
                params: { [spec.key]: value },
              })
            }
          />
        </div>
      ))}
    </div>
  );
};

export default FilterProperties;
