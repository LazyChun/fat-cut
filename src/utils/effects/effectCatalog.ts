import type React from "react";

export type EffectCategory =
  | "basic"
  | "dynamic"
  | "picture"
  | "rgb"
  | "border"
  | "nature";

export interface EffectParamSpec {
  key: string;
  labelKey: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface EffectCssOutput {
  filter?: string;
  transform?: string;
  animation?: string;
  overlayClass?: string;
}

export interface EffectDefinition {
  id: string;
  nameKey: string;
  category: EffectCategory;
  defaultParams: Record<string, number>;
  paramSpecs: EffectParamSpec[];
  cssBuilder: (params: Record<string, number>) => EffectCssOutput;
  thumbnailStyle: React.CSSProperties;
}

export interface EffectCategoryDef {
  id: EffectCategory;
  nameKey: string;
  effects: EffectDefinition[];
}

const INTENSITY_PARAM: EffectParamSpec = {
  key: "intensity",
  labelKey: "cut.effects.intensity",
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

const thumbnailBase: React.CSSProperties = {
  width: "100%",
  position: "relative",
  overflow: "hidden",
  background: "linear-gradient(135deg, #5b8def 0%, #b06ab3 50%, #f78ca0 100%)",
};

export const EFFECT_CATEGORIES: EffectCategoryDef[] = [
  {
    id: "basic",
    nameKey: "cut.effects.categoryBasic",
    effects: [
      {
        id: "blackwhite",
        nameKey: "cut.effects.blackwhite",
        category: "basic",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: (p) => ({
          filter: `grayscale(${num(p, "intensity", 1)})`,
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "grayscale(1)",
        },
      },
      {
        id: "sepia",
        nameKey: "cut.effects.sepia",
        category: "basic",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: (p) => ({
          filter: `sepia(${num(p, "intensity", 1)})`,
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "sepia(1)",
        },
      },
      {
        id: "invert",
        nameKey: "cut.effects.invert",
        category: "basic",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: (p) => ({
          filter: `invert(${num(p, "intensity", 1)})`,
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "invert(1)",
        },
      },
      {
        id: "mirror",
        nameKey: "cut.effects.mirror",
        category: "basic",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({ transform: "scaleX(-1)" }),
        thumbnailStyle: {
          ...thumbnailBase,
          transform: "scaleX(-1)",
        },
      },
      {
        id: "blur",
        nameKey: "cut.effects.blur",
        category: "basic",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: (p) => ({
          filter: `blur(${num(p, "intensity", 1) * 4}px)`,
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "blur(3px)",
        },
      },
      {
        id: "brightness",
        nameKey: "cut.effects.brightness",
        category: "basic",
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.effects.intensity",
            min: 0,
            max: 2,
            step: 0.1,
            default: 1,
          },
        ],
        cssBuilder: (p) => ({
          filter: `brightness(${num(p, "intensity", 1)})`,
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "brightness(1.5)",
        },
      },
      {
        id: "contrast",
        nameKey: "cut.effects.contrast",
        category: "basic",
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.effects.intensity",
            min: 0,
            max: 2,
            step: 0.1,
            default: 1,
          },
        ],
        cssBuilder: (p) => ({
          filter: `contrast(${num(p, "intensity", 1)})`,
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "contrast(1.5)",
        },
      },
      {
        id: "saturate",
        nameKey: "cut.effects.saturate",
        category: "basic",
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.effects.intensity",
            min: 0,
            max: 3,
            step: 0.1,
            default: 1,
          },
        ],
        cssBuilder: (p) => ({
          filter: `saturate(${num(p, "intensity", 1)})`,
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "saturate(2)",
        },
      },
    ],
  },
  {
    id: "dynamic",
    nameKey: "cut.effects.categoryDynamic",
    effects: [
      {
        id: "shake",
        nameKey: "cut.effects.shake",
        category: "dynamic",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({
          animation: "fat-cut-shake 0.3s ease-in-out infinite",
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          animation: "fat-cut-shake 0.3s ease-in-out infinite",
        },
      },
      {
        id: "zoompulse",
        nameKey: "cut.effects.zoompulse",
        category: "dynamic",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({
          animation: "fat-cut-zoompulse 1s ease-in-out infinite",
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          animation: "fat-cut-zoompulse 1s ease-in-out infinite",
        },
      },
      {
        id: "heartbeat",
        nameKey: "cut.effects.heartbeat",
        category: "dynamic",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({
          animation: "fat-cut-heartbeat 1.2s ease-in-out infinite",
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          animation: "fat-cut-heartbeat 1.2s ease-in-out infinite",
        },
      },
      {
        id: "flash",
        nameKey: "cut.effects.flash",
        category: "dynamic",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({
          animation: "fat-cut-flash 0.5s linear infinite",
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          animation: "fat-cut-flash 0.5s linear infinite",
        },
      },
      {
        id: "swing",
        nameKey: "cut.effects.swing",
        category: "dynamic",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({
          animation: "fat-cut-swing 2s ease-in-out infinite",
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          animation: "fat-cut-swing 2s ease-in-out infinite",
        },
      },
      {
        id: "bounce",
        nameKey: "cut.effects.bounce",
        category: "dynamic",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({
          animation: "fat-cut-bounce 1s ease-in-out infinite",
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          animation: "fat-cut-bounce 1s ease-in-out infinite",
        },
      },
      {
        id: "spin",
        nameKey: "cut.effects.spin",
        category: "dynamic",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({
          animation: "fat-cut-spin 2s linear infinite",
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          animation: "fat-cut-spin 2s linear infinite",
        },
      },
      {
        id: "vibrate",
        nameKey: "cut.effects.vibrate",
        category: "dynamic",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({
          animation: "fat-cut-vibrate 0.1s linear infinite",
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          animation: "fat-cut-vibrate 0.1s linear infinite",
        },
      },
    ],
  },
  {
    id: "picture",
    nameKey: "cut.effects.categoryPicture",
    effects: [
      {
        id: "vignette",
        nameKey: "cut.effects.vignette",
        category: "picture",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({ overlayClass: "fat-cut-effect-vignette" }),
        thumbnailStyle: {
          ...thumbnailBase,
          boxShadow: "inset 0 0 30px 12px rgba(0,0,0,0.8)",
        },
      },
      {
        id: "lightleak",
        nameKey: "cut.effects.lightleak",
        category: "picture",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({ overlayClass: "fat-cut-effect-lightleak" }),
        thumbnailStyle: {
          ...thumbnailBase,
          background:
            "linear-gradient(135deg, #5b8def 0%, #b06ab3 50%, #ffd194 100%)",
        },
      },
      {
        id: "glow",
        nameKey: "cut.effects.glow",
        category: "picture",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: (p) => {
          const i = num(p, "intensity", 1);
          return {
            filter: `brightness(${1 + i * 0.3}) saturate(${1 + i * 0.4})`,
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "brightness(1.3) saturate(1.4)",
        },
      },
      {
        id: "dreamy",
        nameKey: "cut.effects.dreamy",
        category: "picture",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({
          filter: "blur(1px) brightness(1.1) saturate(1.3)",
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "blur(1px) brightness(1.1) saturate(1.3)",
        },
      },
      {
        id: "fade",
        nameKey: "cut.effects.fade",
        category: "picture",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({
          filter: "contrast(0.85) brightness(1.1)",
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "contrast(0.85) brightness(1.1)",
        },
      },
      {
        id: "warm",
        nameKey: "cut.effects.warm",
        category: "picture",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: (p) => {
          const i = num(p, "intensity", 1);
          return {
            filter: `sepia(${i * 0.3}) saturate(${1 + i * 0.5}) brightness(${1 + i * 0.1})`,
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "sepia(0.3) saturate(1.5) brightness(1.1)",
        },
      },
      {
        id: "cool",
        nameKey: "cut.effects.cool",
        category: "picture",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: (p) => {
          const i = num(p, "intensity", 1);
          return {
            filter: `hue-rotate(${i * 20}deg) saturate(${1 + i * 0.3})`,
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "hue-rotate(20deg) saturate(1.3)",
        },
      },
      {
        id: "vintage",
        nameKey: "cut.effects.vintage",
        category: "picture",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: (p) => {
          const i = num(p, "intensity", 1);
          return {
            filter: `sepia(${i * 0.5}) contrast(${1 - i * 0.2}) brightness(${1 - i * 0.1})`,
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "sepia(0.5) contrast(0.8) brightness(0.9)",
        },
      },
    ],
  },
  {
    id: "rgb",
    nameKey: "cut.effects.categoryRgb",
    effects: [
      {
        id: "glitch",
        nameKey: "cut.effects.glitch",
        category: "rgb",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({ overlayClass: "fat-cut-effect-glitch" }),
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "hue-rotate(90deg) contrast(1.3)",
        },
      },
      {
        id: "rgbsplit",
        nameKey: "cut.effects.rgbsplit",
        category: "rgb",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({ overlayClass: "fat-cut-effect-rgbsplit" }),
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "drop-shadow(2px 0 #ff0000) drop-shadow(-2px 0 #00ffff)",
        },
      },
      {
        id: "chroma",
        nameKey: "cut.effects.chroma",
        category: "rgb",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: (p) => ({
          filter: `saturate(2) hue-rotate(${num(p, "intensity", 1) * 90}deg)`,
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "saturate(2) hue-rotate(90deg)",
        },
      },
      {
        id: "neon",
        nameKey: "cut.effects.neon",
        category: "rgb",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({
          filter: "contrast(1.5) saturate(2) brightness(1.1)",
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "contrast(1.5) saturate(2) brightness(1.1)",
        },
      },
      {
        id: "thermal",
        nameKey: "cut.effects.thermal",
        category: "rgb",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({
          filter: "hue-rotate(180deg) saturate(2) brightness(1.1)",
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "hue-rotate(180deg) saturate(2) brightness(1.1)",
        },
      },
      {
        id: "hueshift",
        nameKey: "cut.effects.hueshift",
        category: "rgb",
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.effects.intensity",
            min: 0,
            max: 360,
            step: 10,
            default: 180,
          },
        ],
        cssBuilder: (p) => ({
          filter: `hue-rotate(${num(p, "intensity", 180)}deg)`,
        }),
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "hue-rotate(180deg)",
        },
      },
      {
        id: "posterize",
        nameKey: "cut.effects.posterize",
        category: "rgb",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: (p) => {
          const i = num(p, "intensity", 1);
          return {
            filter: `contrast(${1 + i * 0.5}) saturate(${1 + i * 0.5})`,
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "contrast(1.5) saturate(1.5)",
        },
      },
    ],
  },
  {
    id: "border",
    nameKey: "cut.effects.categoryBorder",
    effects: [
      {
        id: "borderSolid",
        nameKey: "cut.effects.borderSolid",
        category: "border",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({ overlayClass: "fat-cut-effect-border-solid" }),
        thumbnailStyle: {
          ...thumbnailBase,
          boxShadow: "inset 0 0 0 6px #ffffff",
        },
      },
      {
        id: "borderGradient",
        nameKey: "cut.effects.borderGradient",
        category: "border",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({ overlayClass: "fat-cut-effect-border-gradient" }),
        thumbnailStyle: {
          ...thumbnailBase,
          boxShadow: "inset 0 0 0 6px #ff6b6b",
        },
      },
      {
        id: "borderFilm",
        nameKey: "cut.effects.borderFilm",
        category: "border",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({ overlayClass: "fat-cut-effect-border-film" }),
        thumbnailStyle: {
          ...thumbnailBase,
          boxShadow:
            "inset 0 8px 0 0 #000, inset 0 -8px 0 0 #000, inset 0 0 0 2px #000",
        },
      },
      {
        id: "borderPolaroid",
        nameKey: "cut.effects.borderPolaroid",
        category: "border",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({ overlayClass: "fat-cut-effect-border-polaroid" }),
        thumbnailStyle: {
          ...thumbnailBase,
          boxShadow: "inset 0 0 0 4px #fff, inset 0 -16px 0 0 #fff",
        },
      },
      {
        id: "borderShadow",
        nameKey: "cut.effects.borderShadow",
        category: "border",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({ overlayClass: "fat-cut-effect-border-shadow" }),
        thumbnailStyle: {
          ...thumbnailBase,
          boxShadow: "inset 0 0 20px 4px rgba(0,0,0,0.5)",
        },
      },
      {
        id: "borderVhs",
        nameKey: "cut.effects.borderVhs",
        category: "border",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({ overlayClass: "fat-cut-effect-border-vhs" }),
        thumbnailStyle: {
          ...thumbnailBase,
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)",
        },
      },
    ],
  },
  {
    id: "nature",
    nameKey: "cut.effects.categoryNature",
    effects: [
      {
        id: "snow",
        nameKey: "cut.effects.snow",
        category: "nature",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({ overlayClass: "fat-cut-effect-snow" }),
        thumbnailStyle: {
          ...thumbnailBase,
          background: "linear-gradient(180deg, #4a6fa5 0%, #9bb5d6 100%)",
        },
      },
      {
        id: "rain",
        nameKey: "cut.effects.rain",
        category: "nature",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({ overlayClass: "fat-cut-effect-rain" }),
        thumbnailStyle: {
          ...thumbnailBase,
          background: "linear-gradient(180deg, #2c3e50 0%, #4a6572 100%)",
        },
      },
      {
        id: "fog",
        nameKey: "cut.effects.fog",
        category: "nature",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({ overlayClass: "fat-cut-effect-fog" }),
        thumbnailStyle: {
          ...thumbnailBase,
          background:
            "linear-gradient(135deg, #b5b5b5 0%, #e0e0e0 50%, #b5b5b5 100%)",
        },
      },
      {
        id: "sparkle",
        nameKey: "cut.effects.sparkle",
        category: "nature",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({ overlayClass: "fat-cut-effect-sparkle" }),
        thumbnailStyle: {
          ...thumbnailBase,
          background:
            "radial-gradient(circle at 30% 30%, #fff 0%, #5b8def 40%, #1a1a2e 100%)",
        },
      },
      {
        id: "bokeh",
        nameKey: "cut.effects.bokeh",
        category: "nature",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({ overlayClass: "fat-cut-effect-bokeh" }),
        thumbnailStyle: {
          ...thumbnailBase,
          background:
            "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.6) 0%, transparent 8%), radial-gradient(circle at 70% 30%, rgba(255,255,255,0.5) 0%, transparent 6%), linear-gradient(135deg, #2a1a45 0%, #5b3a8a 100%)",
        },
      },
      {
        id: "fire",
        nameKey: "cut.effects.fire",
        category: "nature",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({ overlayClass: "fat-cut-effect-fire" }),
        thumbnailStyle: {
          ...thumbnailBase,
          background:
            "linear-gradient(180deg, #ff6b35 0%, #f7931e 50%, #ffd700 100%)",
        },
      },
      {
        id: "water",
        nameKey: "cut.effects.water",
        category: "nature",
        defaultParams: { ...DEFAULT_PARAMS },
        paramSpecs: [{ ...INTENSITY_PARAM }],
        cssBuilder: () => ({ overlayClass: "fat-cut-effect-water" }),
        thumbnailStyle: {
          ...thumbnailBase,
          background:
            "linear-gradient(180deg, #0077b6 0%, #00b4d8 50%, #90e0ef 100%)",
        },
      },
    ],
  },
];

const definitionMap = new Map<string, EffectDefinition>();
for (const cat of EFFECT_CATEGORIES) {
  for (const eff of cat.effects) {
    definitionMap.set(eff.id, eff);
  }
}

export const getEffectDefinition = (
  type: string,
): EffectDefinition | undefined => definitionMap.get(type);
