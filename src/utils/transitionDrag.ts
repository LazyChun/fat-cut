export const TRANSITION_MIME = "application/x-fat-cut-transition";

export type TransitionDragPayload = {
  transitionTypeId: string;
  edge: "in" | "out";
};

export const setTransitionPayload = (
  e: React.DragEvent,
  payload: TransitionDragPayload,
) => {
  e.dataTransfer.setData(TRANSITION_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "copy";
};

export const readTransitionPayload = (
  e: React.DragEvent,
): TransitionDragPayload | undefined => {
  const raw = e.dataTransfer.getData(TRANSITION_MIME);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as TransitionDragPayload;
  } catch {
    return undefined;
  }
};

export const hasTransitionPayload = (e: React.DragEvent): boolean => {
  return Array.from(e.dataTransfer.types).includes(TRANSITION_MIME);
};
