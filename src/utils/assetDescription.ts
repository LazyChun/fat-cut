const safeNumber = (value: unknown, fallback = 0): number => {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const safeString = (value: unknown, fallback = ""): string => {
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
};

export const parseAssetDescription = (
  description?: string,
): Cut.AssetDescriptionData => {
  if (!description || !description.trim()) {
    return { description: "", clipInfos: [] };
  }
  const trimmed = description.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return { description: trimmed, clipInfos: [] };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "string") {
      return { description: parsed, clipInfos: [] };
    }
    if (parsed && typeof parsed === "object") {
      const desc = safeString(parsed.description, "");
      const rawClips = Array.isArray(parsed.clipInfos) ? parsed.clipInfos : [];
      const clipInfos: Cut.AssetClipInfo[] = rawClips
        .map((item: unknown) => {
          if (!item || typeof item !== "object") {
            return null;
          }
          const startTime = safeNumber(
            (item as Record<string, unknown>).startTime,
            0,
          );
          const endTime = safeNumber(
            (item as Record<string, unknown>).endTime,
            startTime,
          );
          const content = safeString((item as Record<string, unknown>).content);
          if (!content) {
            return null;
          }
          return {
            startTime,
            endTime: endTime < startTime ? startTime : endTime,
            content,
            usage: safeString((item as Record<string, unknown>).usage) || undefined,
          };
        })
        .filter((item: Cut.AssetClipInfo | null): item is Cut.AssetClipInfo => item !== null);
      return { description: desc, clipInfos };
    }
  } catch {
    return { description: trimmed, clipInfos: [] };
  }
  return { description: trimmed, clipInfos: [] };
};

export const serializeAssetDescription = (
  data: Cut.AssetDescriptionData,
): string => {
  const description = safeString(data.description, "");
  const clipInfos = (data.clipInfos ?? [])
    .filter((item) => item.content.trim().length > 0)
    .map((item) => ({
      startTime: safeNumber(item.startTime, 0),
      endTime: safeNumber(item.endTime, item.startTime),
      content: item.content.trim(),
      usage: item.usage?.trim() || undefined,
    }));
  if (!description && clipInfos.length === 0) {
    return "";
  }
  return JSON.stringify({ description, clipInfos });
};

export const hasAssetDescription = (
  data: Cut.AssetDescriptionData,
): boolean => {
  return Boolean(data.description.trim()) || (data.clipInfos?.length ?? 0) > 0;
};

export const isVideoOrAudio = (fileType: string): boolean => {
  return fileType.startsWith("video/") || fileType.startsWith("audio/");
};
