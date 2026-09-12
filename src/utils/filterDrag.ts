export const FILTER_MIME = "application/x-fat-cut-filter";

export type FilterDragPayload = { filterTypeId: string };

export const setFilterPayload = (
  e: React.DragEvent,
  payload: FilterDragPayload,
) => {
  e.dataTransfer.setData(FILTER_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "copy";
};

export const readFilterPayload = (
  e: React.DragEvent,
): FilterDragPayload | undefined => {
  const raw = e.dataTransfer.getData(FILTER_MIME);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as FilterDragPayload;
  } catch {
    return undefined;
  }
};

export const hasFilterPayload = (e: React.DragEvent): boolean => {
  return Array.from(e.dataTransfer.types).includes(FILTER_MIME);
};
