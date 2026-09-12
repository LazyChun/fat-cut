import { getFilterDefinition } from "./filterCatalog";

export interface AggregatedFilterCss {
  filter: string;
}

const toNumberParams = (
  params: Record<string, unknown>,
): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "number" && !Number.isNaN(v)) {
      out[k] = v;
    }
  }
  return out;
};

// 返回在 currentTime 时刻活跃的 filterClips(timelineIn <= t < timelineIn + duration)。
export const getActiveFilterClips = (
  filterClips: Cut.FilterClip[] | undefined,
  currentTime: number,
): Cut.FilterClip[] => {
  if (!filterClips || filterClips.length === 0) return [];
  return filterClips.filter(
    (f) =>
      currentTime >= f.timelineIn &&
      currentTime < f.timelineIn + f.duration,
  );
};

// 将指定时刻活跃的 filterClips 聚合为单个 CSS filter 字符串。
// 多个滤镜按顺序串联,空格分隔,与 CSS filter 属性语法一致。
export const buildFilterClipsCss = (
  filterClips: Cut.FilterClip[] | undefined,
  currentTime: number,
): AggregatedFilterCss | null => {
  const active = getActiveFilterClips(filterClips, currentTime);
  if (active.length === 0) return null;

  const filters: string[] = [];
  for (const f of active) {
    const def = getFilterDefinition(f.type);
    if (!def) continue;
    const params = toNumberParams(f.params ?? {});
    for (const [k, v] of Object.entries(def.defaultParams)) {
      if (!(k in params)) {
        params[k] = v;
      }
    }
    const out = def.cssBuilder(params);
    if (out.filter) filters.push(out.filter);
  }

  if (filters.length === 0) return null;
  return { filter: filters.join(" ") };
};
