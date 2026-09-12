import { getEffectDefinition } from "./effectCatalog";

export interface AggregatedEffectCss {
  filter: string;
  transform: string;
  animations: string[];
  overlayClasses: string[];
}

const toNumberParams = (params: Record<string, unknown>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "number" && !Number.isNaN(v)) {
      out[k] = v;
    }
  }
  return out;
};

export const buildClipEffectCss = (
  clip: Cut.Clip,
): AggregatedEffectCss | null => {
  if (!clip.effects || clip.effects.length === 0) {
    return null;
  }

  const filters: string[] = [];
  const transforms: string[] = [];
  const animations: string[] = [];
  const overlayClasses: string[] = [];

  for (const eff of clip.effects) {
    const def = getEffectDefinition(eff.type);
    if (!def) continue;
    const params = toNumberParams(eff.params ?? {});
    // 用 defaultParams 补齐缺失项
    for (const [k, v] of Object.entries(def.defaultParams)) {
      if (!(k in params)) {
        params[k] = v;
      }
    }
    const out = def.cssBuilder(params);
    if (out.filter) filters.push(out.filter);
    if (out.transform) transforms.push(out.transform);
    if (out.animation) animations.push(out.animation);
    if (out.overlayClass) overlayClasses.push(out.overlayClass);
  }

  if (
    filters.length === 0 &&
    transforms.length === 0 &&
    animations.length === 0 &&
    overlayClasses.length === 0
  ) {
    return null;
  }

  return {
    filter: filters.join(" "),
    transform: transforms.join(" "),
    animations,
    overlayClasses,
  };
};
