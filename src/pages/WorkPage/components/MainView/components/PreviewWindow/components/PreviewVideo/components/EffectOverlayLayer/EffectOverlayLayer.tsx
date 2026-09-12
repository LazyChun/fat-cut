import React from "react";
import styles from "./EffectOverlayLayer.less";

interface EffectOverlayLayerProps {
  overlayClasses: string[];
}

const EffectOverlayLayer: React.FC<EffectOverlayLayerProps> = ({
  overlayClasses,
}) => {
  if (!overlayClasses.length) return null;
  return (
    <div className={styles.layer}>
      {overlayClasses.map((cls, i) => (
        <div key={`${cls}-${i}`} className={cls} />
      ))}
    </div>
  );
};

export default EffectOverlayLayer;
