import React from "react";
import { Button, Slider } from "antd";
import { editorStore } from "reducers";
import { useI18n } from "hooks";
import { getEffectDefinition } from "utils";
import styles from "./EffectProperties.less";

interface EffectPropertiesProps {
  clipId: string;
  effects: Cut.EffectConfig[];
}

const numValue = (
  params: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
): number => {
  if (!params) return fallback;
  const v = params[key];
  return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
};

const EffectProperties: React.FC<EffectPropertiesProps> = ({
  clipId,
  effects,
}) => {
  const { text } = useI18n();

  if (effects.length === 0) return null;

  return (
    <div className={styles.container}>
      <div className={styles.sectionTitle}>
        {text("cut.effects.properties")}
      </div>
      {effects.map((eff) => {
        const def = getEffectDefinition(eff.type);
        if (!def) return null;
        return (
          <div key={eff.id} className={styles.effect}>
            <div className={styles.effectHeader}>
              <span className={styles.effectName}>{text(def.nameKey)}</span>
              <button
                type="button"
                className={styles.removeBtn}
                aria-label={text("cut.effects.remove")}
                title={text("cut.effects.remove")}
                onClick={() => editorStore.removeClipEffect(clipId, eff.id)}
              >
                ×
              </button>
            </div>
            {def.paramSpecs.map((spec) => (
              <div key={spec.key} className={styles.param}>
                <div className={styles.paramLabel}>
                  {text(spec.labelKey)}
                </div>
                <Slider
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={numValue(eff.params, spec.key, spec.default)}
                  onChange={(value) =>
                    editorStore.updateClipEffect(clipId, eff.id, {
                      [spec.key]: value,
                    })
                  }
                />
              </div>
            ))}
          </div>
        );
      })}
      <div className={styles.footer}>
        <Button
          size="small"
          danger
          onClick={() => editorStore.clearClipEffects(clipId)}
        >
          {text("cut.effects.clearAll")}
        </Button>
      </div>
    </div>
  );
};

export default EffectProperties;
