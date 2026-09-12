export const EFFECT_MIME = "application/x-fat-cut-effect";

export type EffectDragPayload = { effectTypeId: string };

export const setEffectPayload = (
  e: React.DragEvent,
  payload: EffectDragPayload,
) => {
  e.dataTransfer.setData(EFFECT_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "copy";
};

export const readEffectPayload = (
  e: React.DragEvent,
): EffectDragPayload | undefined => {
  const raw = e.dataTransfer.getData(EFFECT_MIME);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as EffectDragPayload;
  } catch {
    return undefined;
  }
};

export const hasEffectPayload = (e: React.DragEvent): boolean => {
  return Array.from(e.dataTransfer.types).includes(EFFECT_MIME);
};
