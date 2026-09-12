export const OVERLAY_MIME = "application/x-fat-cut-overlay";

export type OverlayDragPayload =
  | { kind: "text"; preset: Cut.TextConfig }
  | { kind: "sticker"; preset: Cut.StickerConfig }
  | { kind: "subtitle"; preset: Cut.TextConfig };

export const setOverlayPayload = (
  e: React.DragEvent,
  payload: OverlayDragPayload,
) => {
  e.dataTransfer.setData(OVERLAY_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "copy";
};

export const readOverlayPayload = (
  e: React.DragEvent,
): OverlayDragPayload | undefined => {
  const raw = e.dataTransfer.getData(OVERLAY_MIME);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as OverlayDragPayload;
  } catch {
    return undefined;
  }
};

export const hasOverlayPayload = (e: React.DragEvent): boolean => {
  return Array.from(e.dataTransfer.types).includes(OVERLAY_MIME);
};
