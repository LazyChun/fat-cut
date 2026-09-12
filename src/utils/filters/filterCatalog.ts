import type React from "react";

export type FilterCategory =
  | "modern"
  | "cinematic"
  | "vintage"
  | "bw"
  | "portrait"
  | "landscape"
  | "food"
  | "film";

export interface FilterParamSpec {
  key: string;
  labelKey: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface FilterCssOutput {
  filter?: string;
}

export interface FilterDefinition {
  id: string;
  nameKey: string;
  category: FilterCategory;
  defaultParams: Record<string, number>;
  paramSpecs: FilterParamSpec[];
  cssBuilder: (params: Record<string, number>) => FilterCssOutput;
  thumbnailStyle: React.CSSProperties;
}

export interface FilterCategoryDef {
  id: FilterCategory;
  nameKey: string;
  filters: FilterDefinition[];
}

const INTENSITY_PARAM: FilterParamSpec = {
  key: "intensity",
  labelKey: "cut.filters.intensity",
  min: 0,
  max: 1,
  step: 0.05,
  default: 1,
};

const DEFAULT_PARAMS = { intensity: 1 };

const num = (
  params: Record<string, unknown>,
  key: string,
  fallback: number,
) => {
  const v = params[key];
  return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
};

// 缩略图基准渐变,模拟一张"画面"以便直观看出滤镜效果
const thumbnailBase: React.CSSProperties = {
  width: "100%",
  position: "relative",
  overflow: "hidden",
  background:
    "linear-gradient(135deg, #5b8def 0%, #6ee7b7 35%, #fbbf24 70%, #f87171 100%)",
};

// makeFilter: builder 接收 intensity(0-1) 返回 CSS filter 字符串。
// thumbnailFilter 为 intensity=1 时的预览样式。
const makeFilter = (
  id: string,
  nameKey: string,
  category: FilterCategory,
  builder: (i: number) => string,
  thumbnailFilter: string,
): FilterDefinition => ({
  id,
  nameKey,
  category,
  defaultParams: { ...DEFAULT_PARAMS },
  paramSpecs: [{ ...INTENSITY_PARAM }],
  cssBuilder: (p) => ({
    filter: builder(num(p, "intensity", 1)),
  }),
  thumbnailStyle: {
    ...thumbnailBase,
    filter: thumbnailFilter,
  },
});

// 工具:按强度缩放数值,保留 3 位小数
const s = (base: number, i: number) => (base * i).toFixed(3);

export const FILTER_CATEGORIES: FilterCategoryDef[] = [
  {
    id: "modern",
    nameKey: "cut.filters.categoryModern",
    filters: [
      makeFilter(
        "vivid",
        "cut.filters.vivid",
        "modern",
        (i) => `saturate(${s(1.4, i)}) contrast(${s(1.05, i)}) brightness(${1 + 0.02 * i})`,
        "saturate(1.4) contrast(1.05) brightness(1.02)",
      ),
      makeFilter(
        "natural",
        "cut.filters.natural",
        "modern",
        (i) => `saturate(${1 + 0.15 * i}) brightness(${1 + 0.03 * i}) sepia(${s(0.05, i)})`,
        "saturate(1.15) brightness(1.03) sepia(0.05)",
      ),
      makeFilter(
        "clear",
        "cut.filters.clear",
        "modern",
        (i) => `brightness(${1 + 0.08 * i}) contrast(${s(1.08, i)}) saturate(${1 + 0.1 * i})`,
        "brightness(1.08) contrast(1.08) saturate(1.1)",
      ),
      makeFilter(
        "tealOrange",
        "cut.filters.tealOrange",
        "modern",
        (i) => `hue-rotate(${-10 * i}deg) saturate(${1 + 0.3 * i}) contrast(${s(1.05, i)})`,
        "hue-rotate(-10deg) saturate(1.3) contrast(1.05)",
      ),
      makeFilter(
        "fresh",
        "cut.filters.fresh",
        "modern",
        (i) => `brightness(${1 + 0.06 * i}) saturate(${1 + 0.2 * i}) hue-rotate(${5 * i}deg)`,
        "brightness(1.06) saturate(1.2) hue-rotate(5deg)",
      ),
    ],
  },
  {
    id: "cinematic",
    nameKey: "cut.filters.categoryCinematic",
    filters: [
      makeFilter(
        "cinemaOrange",
        "cut.filters.cinemaOrange",
        "cinematic",
        (i) => `contrast(${s(1.15, i)}) saturate(${1 + 0.2 * i}) sepia(${s(0.15, i)}) hue-rotate(${-10 * i}deg)`,
        "contrast(1.15) saturate(1.2) sepia(0.15) hue-rotate(-10deg)",
      ),
      makeFilter(
        "darkMood",
        "cut.filters.darkMood",
        "cinematic",
        (i) => `brightness(${1 - 0.15 * i}) contrast(${s(1.2, i)}) saturate(${1 - 0.1 * i})`,
        "brightness(0.85) contrast(1.2) saturate(0.9)",
      ),
      makeFilter(
        "hdr",
        "cut.filters.hdr",
        "cinematic",
        (i) => `contrast(${s(1.25, i)}) saturate(${1 + 0.3 * i}) brightness(${1 + 0.03 * i})`,
        "contrast(1.25) saturate(1.3) brightness(1.03)",
      ),
      makeFilter(
        "blueMood",
        "cut.filters.blueMood",
        "cinematic",
        (i) => `hue-rotate(${15 * i}deg) saturate(${1 + 0.1 * i}) brightness(${1 - 0.05 * i}) contrast(${s(1.05, i)})`,
        "hue-rotate(15deg) saturate(1.1) brightness(0.95) contrast(1.05)",
      ),
      makeFilter(
        "noir",
        "cut.filters.noir",
        "cinematic",
        (i) => `contrast(${s(1.3, i)}) brightness(${1 - 0.1 * i}) saturate(${1 - 0.3 * i})`,
        "contrast(1.3) brightness(0.9) saturate(0.7)",
      ),
    ],
  },
  {
    id: "vintage",
    nameKey: "cut.filters.categoryVintage",
    filters: [
      makeFilter(
        "oldPhoto",
        "cut.filters.oldPhoto",
        "vintage",
        (i) => `sepia(${s(0.5, i)}) contrast(${1 - 0.1 * i}) brightness(${1 + 0.05 * i})`,
        "sepia(0.5) contrast(0.9) brightness(1.05)",
      ),
      makeFilter(
        "eighties",
        "cut.filters.eighties",
        "vintage",
        (i) => `sepia(${s(0.3, i)}) saturate(${1 + 0.3 * i}) contrast(${s(1.1, i)}) hue-rotate(${-10 * i}deg)`,
        "sepia(0.3) saturate(1.3) contrast(1.1) hue-rotate(-10deg)",
      ),
      makeFilter(
        "faded",
        "cut.filters.faded",
        "vintage",
        (i) => `contrast(${1 - 0.15 * i}) brightness(${1 + 0.08 * i}) saturate(${1 - 0.15 * i}) sepia(${s(0.1, i)})`,
        "contrast(0.85) brightness(1.08) saturate(0.85) sepia(0.1)",
      ),
      makeFilter(
        "nostalgic",
        "cut.filters.nostalgic",
        "vintage",
        (i) => `sepia(${s(0.4, i)}) brightness(${1 - 0.05 * i}) saturate(${1 + 0.1 * i}) contrast(${1 - 0.05 * i})`,
        "sepia(0.4) brightness(0.95) saturate(1.1) contrast(0.95)",
      ),
      makeFilter(
        "amber",
        "cut.filters.amber",
        "vintage",
        (i) => `sepia(${s(0.35, i)}) saturate(${1 + 0.4 * i}) brightness(${1 + 0.05 * i}) hue-rotate(${-15 * i}deg)`,
        "sepia(0.35) saturate(1.4) brightness(1.05) hue-rotate(-15deg)",
      ),
    ],
  },
  {
    id: "bw",
    nameKey: "cut.filters.categoryBw",
    filters: [
      makeFilter(
        "bwClassic",
        "cut.filters.bwClassic",
        "bw",
        (i) => `grayscale(${s(1, i)}) contrast(${s(1.05, i)})`,
        "grayscale(1) contrast(1.05)",
      ),
      makeFilter(
        "bwHighContrast",
        "cut.filters.bwHighContrast",
        "bw",
        (i) => `grayscale(${s(1, i)}) contrast(${s(1.3, i)}) brightness(${1 - 0.05 * i})`,
        "grayscale(1) contrast(1.3) brightness(0.95)",
      ),
      makeFilter(
        "bwSilver",
        "cut.filters.bwSilver",
        "bw",
        (i) => `grayscale(${s(1, i)}) contrast(${s(1.1, i)}) brightness(${1 + 0.05 * i}) hue-rotate(${180 * i}deg)`,
        "grayscale(1) contrast(1.1) brightness(1.05) hue-rotate(180deg)",
      ),
      makeFilter(
        "bwDark",
        "cut.filters.bwDark",
        "bw",
        (i) => `grayscale(${s(1, i)}) contrast(${s(1.2, i)}) brightness(${1 - 0.2 * i})`,
        "grayscale(1) contrast(1.2) brightness(0.8)",
      ),
    ],
  },
  {
    id: "portrait",
    nameKey: "cut.filters.categoryPortrait",
    filters: [
      makeFilter(
        "whitening",
        "cut.filters.whitening",
        "portrait",
        (i) => `brightness(${1 + 0.12 * i}) saturate(${1 - 0.05 * i}) sepia(${s(0.05, i)})`,
        "brightness(1.12) saturate(0.95) sepia(0.05)",
      ),
      makeFilter(
        "rosy",
        "cut.filters.rosy",
        "portrait",
        (i) => `sepia(${s(0.15, i)}) saturate(${1 + 0.2 * i}) brightness(${1 + 0.05 * i}) hue-rotate(${-10 * i}deg)`,
        "sepia(0.15) saturate(1.2) brightness(1.05) hue-rotate(-10deg)",
      ),
      makeFilter(
        "softSkin",
        "cut.filters.softSkin",
        "portrait",
        (i) => `brightness(${1 + 0.05 * i}) saturate(${1 + 0.05 * i}) sepia(${s(0.1, i)}) blur(${s(0.5, i)}px)`,
        "brightness(1.05) saturate(1.05) sepia(0.1) blur(0.5px)",
      ),
      makeFilter(
        "kraft",
        "cut.filters.kraft",
        "portrait",
        (i) => `sepia(${s(0.25, i)}) saturate(${1 + 0.1 * i}) contrast(${1 - 0.05 * i}) brightness(${1 + 0.02 * i})`,
        "sepia(0.25) saturate(1.1) contrast(0.95) brightness(1.02)",
      ),
      makeFilter(
        "honey",
        "cut.filters.honey",
        "portrait",
        (i) => `sepia(${s(0.2, i)}) saturate(${1 + 0.25 * i}) brightness(${1 + 0.08 * i})`,
        "sepia(0.2) saturate(1.25) brightness(1.08)",
      ),
    ],
  },
  {
    id: "landscape",
    nameKey: "cut.filters.categoryLandscape",
    filters: [
      makeFilter(
        "verdant",
        "cut.filters.verdant",
        "landscape",
        (i) => `saturate(${1 + 0.3 * i}) hue-rotate(${10 * i}deg) brightness(${1 + 0.03 * i})`,
        "saturate(1.3) hue-rotate(10deg) brightness(1.03)",
      ),
      makeFilter(
        "skyBlue",
        "cut.filters.skyBlue",
        "landscape",
        (i) => `hue-rotate(${-15 * i}deg) saturate(${1 + 0.25 * i}) brightness(${1 + 0.05 * i}) contrast(${s(1.05, i)})`,
        "hue-rotate(-15deg) saturate(1.25) brightness(1.05) contrast(1.05)",
      ),
      makeFilter(
        "dusk",
        "cut.filters.dusk",
        "landscape",
        (i) => `sepia(${s(0.25, i)}) saturate(${1 + 0.3 * i}) brightness(${1 - 0.05 * i}) hue-rotate(${-15 * i}deg)`,
        "sepia(0.25) saturate(1.3) brightness(0.95) hue-rotate(-15deg)",
      ),
      makeFilter(
        "autumn",
        "cut.filters.autumn",
        "landscape",
        (i) => `sepia(${s(0.3, i)}) saturate(${1 + 0.35 * i}) hue-rotate(${-20 * i}deg) brightness(${1 + 0.02 * i})`,
        "sepia(0.3) saturate(1.35) hue-rotate(-20deg) brightness(1.02)",
      ),
      makeFilter(
        "forest",
        "cut.filters.forest",
        "landscape",
        (i) => `hue-rotate(${20 * i}deg) saturate(${1 + 0.2 * i}) contrast(${s(1.05, i)}) brightness(${1 - 0.02 * i})`,
        "hue-rotate(20deg) saturate(1.2) contrast(1.05) brightness(0.98)",
      ),
    ],
  },
  {
    id: "food",
    nameKey: "cut.filters.categoryFood",
    filters: [
      makeFilter(
        "vividFood",
        "cut.filters.vividFood",
        "food",
        (i) => `saturate(${1 + 0.5 * i}) contrast(${s(1.1, i)}) brightness(${1 + 0.05 * i}) sepia(${s(0.05, i)})`,
        "saturate(1.5) contrast(1.1) brightness(1.05) sepia(0.05)",
      ),
      makeFilter(
        "warmFood",
        "cut.filters.warmFood",
        "food",
        (i) => `sepia(${s(0.2, i)}) saturate(${1 + 0.3 * i}) brightness(${1 + 0.05 * i})`,
        "sepia(0.2) saturate(1.3) brightness(1.05)",
      ),
      makeFilter(
        "delicious",
        "cut.filters.delicious",
        "food",
        (i) => `contrast(${s(1.15, i)}) saturate(${1 + 0.35 * i}) sepia(${s(0.1, i)}) brightness(${1 + 0.03 * i})`,
        "contrast(1.15) saturate(1.35) sepia(0.1) brightness(1.03)",
      ),
      makeFilter(
        "freshFood",
        "cut.filters.freshFood",
        "food",
        (i) => `brightness(${1 + 0.1 * i}) saturate(${1 + 0.2 * i}) hue-rotate(${5 * i}deg)`,
        "brightness(1.1) saturate(1.2) hue-rotate(5deg)",
      ),
    ],
  },
  {
    id: "film",
    nameKey: "cut.filters.categoryFilm",
    filters: [
      makeFilter(
        "kodak",
        "cut.filters.kodak",
        "film",
        (i) => `sepia(${s(0.2, i)}) saturate(${1 + 0.2 * i}) contrast(${s(1.1, i)}) brightness(${1 + 0.03 * i})`,
        "sepia(0.2) saturate(1.2) contrast(1.1) brightness(1.03)",
      ),
      makeFilter(
        "fuji",
        "cut.filters.fuji",
        "film",
        (i) => `hue-rotate(${10 * i}deg) saturate(${1 + 0.25 * i}) contrast(${s(1.05, i)}) brightness(${1 + 0.02 * i})`,
        "hue-rotate(10deg) saturate(1.25) contrast(1.05) brightness(1.02)",
      ),
      makeFilter(
        "polaroid",
        "cut.filters.polaroid",
        "film",
        (i) => `sepia(${s(0.3, i)}) contrast(${1 - 0.1 * i}) brightness(${1 + 0.08 * i}) saturate(${1 - 0.05 * i})`,
        "sepia(0.3) contrast(0.9) brightness(1.08) saturate(0.95)",
      ),
      makeFilter(
        "vhs",
        "cut.filters.vhs",
        "film",
        (i) => `saturate(${1 - 0.15 * i}) contrast(${1 - 0.05 * i}) brightness(${1 + 0.05 * i}) sepia(${s(0.15, i)})`,
        "saturate(0.85) contrast(0.95) brightness(1.05) sepia(0.15)",
      ),
      makeFilter(
        "super8",
        "cut.filters.super8",
        "film",
        (i) => `sepia(${s(0.4, i)}) saturate(${1 + 0.1 * i}) contrast(${s(1.15, i)}) brightness(${1 - 0.05 * i})`,
        "sepia(0.4) saturate(1.1) contrast(1.15) brightness(0.95)",
      ),
    ],
  },
];

const definitionMap = new Map<string, FilterDefinition>();
for (const cat of FILTER_CATEGORIES) {
  for (const f of cat.filters) {
    definitionMap.set(f.id, f);
  }
}

export const getFilterDefinition = (
  type: string,
): FilterDefinition | undefined => definitionMap.get(type);
