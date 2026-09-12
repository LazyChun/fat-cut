import type React from "react";

export type TransitionCategory =
  | "basic"
  | "slide"
  | "wipe"
  | "zoom"
  | "special";

export interface TransitionParamSpec {
  key: string;
  labelKey: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface TransitionCssOutput {
  outgoingStyle?: React.CSSProperties;
  incomingStyle?: React.CSSProperties;
  overlayClass?: string;
}

export interface TransitionDefinition {
  id: string;
  nameKey: string;
  category: TransitionCategory;
  defaultDuration: number;
  defaultParams: Record<string, number>;
  paramSpecs: TransitionParamSpec[];
  cssBuilder: (
    progress: number,
    params: Record<string, number>,
  ) => TransitionCssOutput;
  thumbnailStyle: React.CSSProperties;
}

export interface TransitionCategoryDef {
  id: TransitionCategory;
  nameKey: string;
  transitions: TransitionDefinition[];
}

const DURATION_PARAM: TransitionParamSpec = {
  key: "duration",
  labelKey: "cut.transitions.duration",
  min: 0.1,
  max: 3,
  step: 0.1,
  default: 0.8,
};

const INTENSITY_PARAM: TransitionParamSpec = {
  key: "intensity",
  labelKey: "cut.transitions.intensity",
  min: 0,
  max: 1,
  step: 0.05,
  default: 1,
};

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
  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  position: "relative",
  overflow: "hidden",
};

const makeThumbnail = (
  _outStyle: React.CSSProperties,
  _inStyle: React.CSSProperties,
  gradient: string,
): React.CSSProperties => ({
  ...thumbnailBase,
  background: gradient,
});

export const TRANSITION_CATEGORIES: TransitionCategoryDef[] = [
  {
    id: "basic",
    nameKey: "cut.transitions.categoryBasic",
    transitions: [
      {
        id: "fade",
        nameKey: "cut.transitions.fade",
        category: "basic",
        defaultDuration: 0.8,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          return {
            outgoingStyle: { opacity: 1 - p * intensity },
            incomingStyle: { opacity: p * intensity },
          };
        },
        thumbnailStyle: makeThumbnail(
          { opacity: 0.5 },
          { opacity: 0.5 },
          "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        ),
      },
      {
        id: "fadeBlack",
        nameKey: "cut.transitions.fadeBlack",
        category: "basic",
        defaultDuration: 0.8,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          const midP = p < 0.5 ? p * 2 : (1 - p) * 2;
          return {
            outgoingStyle: {
              opacity: p < 0.5 ? 1 : 0,
              filter: `brightness(${1 - p * intensity})`,
            },
            incomingStyle: {
              opacity: p < 0.5 ? 0 : 1,
              filter: `brightness(${1 - (1 - p) * intensity})`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background:
            "linear-gradient(90deg, #667eea 0%, #000 50%, #764ba2 100%)",
        },
      },
      {
        id: "fadeWhite",
        nameKey: "cut.transitions.fadeWhite",
        category: "basic",
        defaultDuration: 0.6,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          return {
            outgoingStyle: {
              opacity: p < 0.5 ? 1 : 0,
              filter: `brightness(${1 + p * intensity})`,
            },
            incomingStyle: {
              opacity: p < 0.5 ? 0 : 1,
              filter: `brightness(${1 + (1 - p) * intensity})`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background:
            "linear-gradient(90deg, #667eea 0%, #fff 50%, #764ba2 100%)",
        },
      },
      {
        id: "dissolve",
        nameKey: "cut.transitions.dissolve",
        category: "basic",
        defaultDuration: 1,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          return {
            outgoingStyle: {
              opacity: 1 - p * intensity,
              filter: `blur(${p * 5 * intensity}px)`,
            },
            incomingStyle: {
              opacity: p * intensity,
              filter: `blur(${(1 - p) * 5 * intensity}px)`,
            },
          };
        },
        thumbnailStyle: makeThumbnail(
          { opacity: 0.5, filter: "blur(2px)" },
          { opacity: 0.5, filter: "blur(2px)" },
          "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
        ),
      },
      {
        id: "flashBlack",
        nameKey: "cut.transitions.flashBlack",
        category: "basic",
        defaultDuration: 0.5,
        defaultParams: { intensity: 1 },
        paramSpecs: [INTENSITY_PARAM],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          let outOpacity: number;
          let inOpacity: number;
          if (p < 0.2) {
            outOpacity = 1 - (p / 0.2) * intensity;
            inOpacity = 0;
          } else if (p < 0.8) {
            outOpacity = 0;
            inOpacity = 0;
          } else {
            outOpacity = 0;
            inOpacity = ((p - 0.8) / 0.2) * intensity;
          }
          return {
            outgoingStyle: { opacity: outOpacity },
            incomingStyle: { opacity: inOpacity },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background:
            "linear-gradient(90deg, #667eea 0%, #000 30%, #000 70%, #764ba2 100%)",
        },
      },
      {
        id: "flashWhite",
        nameKey: "cut.transitions.flashWhite",
        category: "basic",
        defaultDuration: 0.5,
        defaultParams: { intensity: 1 },
        paramSpecs: [INTENSITY_PARAM],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          let outOpacity: number;
          let inOpacity: number;
          if (p < 0.2) {
            outOpacity = 1 - (p / 0.2) * intensity;
            inOpacity = 0;
          } else if (p < 0.8) {
            outOpacity = 0;
            inOpacity = 0;
          } else {
            outOpacity = 0;
            inOpacity = ((p - 0.8) / 0.2) * intensity;
          }
          return {
            outgoingStyle: {
              opacity: outOpacity,
              filter: `brightness(${1 + (1 - outOpacity) * intensity})`,
            },
            incomingStyle: {
              opacity: inOpacity,
              filter: `brightness(${1 + (1 - inOpacity) * intensity})`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background:
            "linear-gradient(90deg, #667eea 0%, #fff 30%, #fff 70%, #764ba2 100%)",
        },
      },
    ],
  },
  {
    id: "slide",
    nameKey: "cut.transitions.categorySlide",
    transitions: [
      {
        id: "slideLeft",
        nameKey: "cut.transitions.slideLeft",
        category: "slide",
        defaultDuration: 0.6,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          return {
            outgoingStyle: {
              transform: `translateX(${-100 * p * intensity}%)`,
            },
            incomingStyle: {
              transform: `translateX(${100 * (1 - p) * intensity}%)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background: "linear-gradient(90deg, #4facfe 50%, #f5576c 50%)",
        },
      },
      {
        id: "slideRight",
        nameKey: "cut.transitions.slideRight",
        category: "slide",
        defaultDuration: 0.6,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          return {
            outgoingStyle: { transform: `translateX(${100 * p * intensity}%)` },
            incomingStyle: {
              transform: `translateX(${-100 * (1 - p) * intensity}%)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background: "linear-gradient(90deg, #f5576c 50%, #4facfe 50%)",
        },
      },
      {
        id: "slideUp",
        nameKey: "cut.transitions.slideUp",
        category: "slide",
        defaultDuration: 0.6,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          return {
            outgoingStyle: {
              transform: `translateY(${-100 * p * intensity}%)`,
            },
            incomingStyle: {
              transform: `translateY(${100 * (1 - p) * intensity}%)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background: "linear-gradient(180deg, #4facfe 50%, #f5576c 50%)",
        },
      },
      {
        id: "slideDown",
        nameKey: "cut.transitions.slideDown",
        category: "slide",
        defaultDuration: 0.6,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          return {
            outgoingStyle: { transform: `translateY(${100 * p * intensity}%)` },
            incomingStyle: {
              transform: `translateY(${-100 * (1 - p) * intensity}%)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background: "linear-gradient(180deg, #f5576c 50%, #4facfe 50%)",
        },
      },
      {
        id: "pushLeft",
        nameKey: "cut.transitions.pushLeft",
        category: "slide",
        defaultDuration: 0.7,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          return {
            outgoingStyle: {
              transform: `translateX(${-100 * p * intensity}%)`,
            },
            incomingStyle: {
              transform: `translateX(${100 * (1 - p) * intensity}%)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background:
            "linear-gradient(90deg, #00f2fe 0%, #4facfe 50%, #f5576c 100%)",
        },
      },
      {
        id: "pushRight",
        nameKey: "cut.transitions.pushRight",
        category: "slide",
        defaultDuration: 0.7,
        defaultParams: { intensity: 1 },
        paramSpecs: [INTENSITY_PARAM],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          return {
            outgoingStyle: {
              transform: `translateX(${100 * p * intensity}%)`,
            },
            incomingStyle: {
              transform: `translateX(${-100 * (1 - p) * intensity}%)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background:
            "linear-gradient(90deg, #f5576c 0%, #4facfe 50%, #00f2fe 100%)",
        },
      },
      {
        id: "pushUp",
        nameKey: "cut.transitions.pushUp",
        category: "slide",
        defaultDuration: 0.7,
        defaultParams: { intensity: 1 },
        paramSpecs: [INTENSITY_PARAM],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          return {
            outgoingStyle: {
              transform: `translateY(${-100 * p * intensity}%)`,
            },
            incomingStyle: {
              transform: `translateY(${100 * (1 - p) * intensity}%)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background:
            "linear-gradient(180deg, #f5576c 0%, #4facfe 50%, #00f2fe 100%)",
        },
      },
      {
        id: "pushDown",
        nameKey: "cut.transitions.pushDown",
        category: "slide",
        defaultDuration: 0.7,
        defaultParams: { intensity: 1 },
        paramSpecs: [INTENSITY_PARAM],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          return {
            outgoingStyle: {
              transform: `translateY(${100 * p * intensity}%)`,
            },
            incomingStyle: {
              transform: `translateY(${-100 * (1 - p) * intensity}%)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background:
            "linear-gradient(180deg, #00f2fe 0%, #4facfe 50%, #f5576c 100%)",
        },
      },
    ],
  },
  {
    id: "wipe",
    nameKey: "cut.transitions.categoryWipe",
    transitions: [
      {
        id: "wipeLeft",
        nameKey: "cut.transitions.wipeLeft",
        category: "wipe",
        defaultDuration: 0.8,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          return {
            outgoingStyle: {
              clipPath: `inset(0 ${100 * p * intensity}% 0 0)`,
            },
            incomingStyle: {
              clipPath: `inset(0 0 0 ${100 * (1 - p) * intensity}%)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background: "linear-gradient(90deg, #f093fb 40%, #4facfe 60%)",
        },
      },
      {
        id: "wipeRight",
        nameKey: "cut.transitions.wipeRight",
        category: "wipe",
        defaultDuration: 0.8,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          return {
            outgoingStyle: {
              clipPath: `inset(0 0 0 ${100 * p * intensity}%)`,
            },
            incomingStyle: {
              clipPath: `inset(0 ${100 * (1 - p) * intensity}% 0 0)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background: "linear-gradient(90deg, #4facfe 40%, #f093fb 60%)",
        },
      },
      {
        id: "wipeTop",
        nameKey: "cut.transitions.wipeTop",
        category: "wipe",
        defaultDuration: 0.8,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          return {
            outgoingStyle: {
              clipPath: `inset(${100 * p * intensity}% 0 0 0)`,
            },
            incomingStyle: {
              clipPath: `inset(0 0 ${100 * (1 - p) * intensity}% 0)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background: "linear-gradient(180deg, #f093fb 40%, #4facfe 60%)",
        },
      },
      {
        id: "wipeBottom",
        nameKey: "cut.transitions.wipeBottom",
        category: "wipe",
        defaultDuration: 0.8,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          return {
            outgoingStyle: {
              clipPath: `inset(0 0 ${100 * p * intensity}% 0)`,
            },
            incomingStyle: {
              clipPath: `inset(${100 * (1 - p) * intensity}% 0 0 0)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background: "linear-gradient(180deg, #4facfe 40%, #f093fb 60%)",
        },
      },
      {
        id: "wipeDiagonal",
        nameKey: "cut.transitions.wipeDiagonal",
        category: "wipe",
        defaultDuration: 1,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          const pos = p * intensity * 200;
          return {
            outgoingStyle: {
              clipPath: `polygon(0 0, ${pos}% 0, 0 ${pos}%)`,
            },
            incomingStyle: {
              clipPath: `polygon(100% 100%, ${pos}% 0, 0 ${pos}%)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background: "linear-gradient(45deg, #f093fb 50%, #4facfe 50%)",
        },
      },
      {
        id: "circleReveal",
        nameKey: "cut.transitions.circleReveal",
        category: "wipe",
        defaultDuration: 1,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          const radius = p * intensity * 150;
          return {
            outgoingStyle: {
              clipPath: `circle(${100 - radius}% at 50% 50%)`,
            },
            incomingStyle: {
              clipPath: `circle(${radius}% at 50% 50%)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background: "radial-gradient(circle, #4facfe 30%, #f093fb 30%)",
        },
      },
      {
        id: "diamondReveal",
        nameKey: "cut.transitions.diamondReveal",
        category: "wipe",
        defaultDuration: 0.9,
        defaultParams: { intensity: 1 },
        paramSpecs: [INTENSITY_PARAM],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          const s = p * intensity * 70;
          return {
            outgoingStyle: {
              opacity: 1 - p * intensity * 0.5,
            },
            incomingStyle: {
              clipPath: `polygon(50% ${50 - s}%, ${50 + s}% 50%, 50% ${50 + s}%, ${50 - s}% 50%)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background: "conic-gradient(from 45deg, #f093fb, #4facfe, #f093fb)",
        },
      },
      {
        id: "featherWipe",
        nameKey: "cut.transitions.featherWipe",
        category: "wipe",
        defaultDuration: 0.9,
        defaultParams: { intensity: 1 },
        paramSpecs: [INTENSITY_PARAM],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          const pos = p * 100 * intensity;
          const left = Math.max(0, pos - 15);
          const right = Math.min(100, pos + 15);
          return {
            outgoingStyle: {
              WebkitMaskImage: `linear-gradient(90deg, black ${left}%, transparent ${right}%)`,
              maskImage: `linear-gradient(90deg, black ${left}%, transparent ${right}%)`,
            },
            incomingStyle: {
              WebkitMaskImage: `linear-gradient(90deg, transparent ${left}%, black ${right}%)`,
              maskImage: `linear-gradient(90deg, transparent ${left}%, black ${right}%)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background:
            "linear-gradient(90deg, #f093fb 0%, #4facfe 50%, #f093fb 100%)",
        },
      },
    ],
  },
  {
    id: "zoom",
    nameKey: "cut.transitions.categoryZoom",
    transitions: [
      {
        id: "zoomIn",
        nameKey: "cut.transitions.zoomIn",
        category: "zoom",
        defaultDuration: 0.7,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          const scale = 1 + p * intensity;
          return {
            outgoingStyle: {
              opacity: 1 - p * intensity,
              transform: `scale(${scale})`,
            },
            incomingStyle: {
              opacity: p * intensity,
              transform: `scale(${1 + (1 - p) * intensity})`,
            },
          };
        },
        thumbnailStyle: makeThumbnail(
          { opacity: 0.5, transform: "scale(1.3)" },
          { opacity: 0.5, transform: "scale(0.8)" },
          "radial-gradient(circle, #ffecd2 0%, #fcb69f 100%)",
        ),
      },
      {
        id: "zoomOut",
        nameKey: "cut.transitions.zoomOut",
        category: "zoom",
        defaultDuration: 0.7,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          const scale = 1 - p * 0.5 * intensity;
          return {
            outgoingStyle: {
              opacity: 1 - p * intensity,
              transform: `scale(${Math.max(0.1, scale)})`,
            },
            incomingStyle: {
              opacity: p * intensity,
              transform: `scale(${Math.max(0.1, 1 - (1 - p) * 0.5 * intensity)})`,
            },
          };
        },
        thumbnailStyle: makeThumbnail(
          { opacity: 0.5, transform: "scale(0.7)" },
          { opacity: 0.5, transform: "scale(1.2)" },
          "radial-gradient(circle, #a1c4fd 0%, #c2e9fb 100%)",
        ),
      },
      {
        id: "zoomRotate",
        nameKey: "cut.transitions.zoomRotate",
        category: "zoom",
        defaultDuration: 0.8,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          return {
            outgoingStyle: {
              opacity: 1 - p * intensity,
              transform: `scale(${1 + p * intensity}) rotate(${p * 180 * intensity}deg)`,
            },
            incomingStyle: {
              opacity: p * intensity,
              transform: `scale(${1 + (1 - p) * intensity}) rotate(${(1 - p) * -180 * intensity}deg)`,
            },
          };
        },
        thumbnailStyle: makeThumbnail(
          { opacity: 0.5, transform: "scale(1.2) rotate(15deg)" },
          { opacity: 0.5, transform: "scale(0.9) rotate(-10deg)" },
          "conic-gradient(from 0deg, #f093fb, #f5576c, #4facfe, #00f2fe, #f093fb)",
        ),
      },
      {
        id: "spin",
        nameKey: "cut.transitions.spin",
        category: "zoom",
        defaultDuration: 0.8,
        defaultParams: { intensity: 1 },
        paramSpecs: [INTENSITY_PARAM],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          return {
            outgoingStyle: {
              opacity: 1 - p * intensity,
              transform: `rotate(${p * 180 * intensity}deg) scale(${1 - p * 0.3 * intensity})`,
            },
            incomingStyle: {
              opacity: p * intensity,
              transform: `rotate(${(1 - p) * -180 * intensity}deg) scale(${0.7 + p * 0.3 * intensity})`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background: "conic-gradient(from 0deg, #ffecd2, #fcb69f, #ffecd2)",
        },
      },
    ],
  },
  {
    id: "special",
    nameKey: "cut.transitions.categorySpecial",
    transitions: [
      {
        id: "flip",
        nameKey: "cut.transitions.flip",
        category: "special",
        defaultDuration: 0.8,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          const angle = p * 180 * intensity;
          return {
            outgoingStyle: {
              opacity: p < 0.5 ? 1 : 0,
              transform: `perspective(1000px) rotateY(${angle}deg)`,
              backfaceVisibility: "hidden",
            },
            incomingStyle: {
              opacity: p < 0.5 ? 0 : 1,
              transform: `perspective(1000px) rotateY(${angle - 180}deg)`,
              backfaceVisibility: "hidden",
            },
          };
        },
        thumbnailStyle: makeThumbnail(
          { opacity: 0.5, transform: "perspective(1000px) rotateY(45deg)" },
          { opacity: 0.5, transform: "perspective(1000px) rotateY(-45deg)" },
          "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        ),
      },
      {
        id: "cube",
        nameKey: "cut.transitions.cube",
        category: "special",
        defaultDuration: 1,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          const angle = p * 90 * intensity;
          return {
            outgoingStyle: {
              opacity: 1,
              transform: `perspective(1000px) rotateY(${-angle}deg) translateX(-50%)`,
              transformOrigin: "right center",
            },
            incomingStyle: {
              opacity: 1,
              transform: `perspective(1000px) rotateY(${90 - angle}deg) translateX(50%)`,
              transformOrigin: "left center",
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background: "linear-gradient(135deg, #f093fb 0%, #4facfe 100%)",
          transform: "perspective(200px) rotateY(20deg)",
        },
      },
      {
        id: "glitch",
        nameKey: "cut.transitions.glitch",
        category: "special",
        defaultDuration: 0.6,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          const shake = Math.sin(p * Math.PI * 4) * 10 * intensity;
          return {
            outgoingStyle: {
              opacity: 1 - p * intensity,
              transform: `translateX(${shake}px)`,
              filter: `hue-rotate(${p * 180 * intensity}deg)`,
            },
            incomingStyle: {
              opacity: p * intensity,
              transform: `translateX(${-shake}px)`,
              filter: `hue-rotate(${(1 - p) * 180 * intensity}deg)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          filter: "hue-rotate(90deg) contrast(1.3)",
        },
      },
      {
        id: "mosaic",
        nameKey: "cut.transitions.mosaic",
        category: "special",
        defaultDuration: 0.8,
        defaultParams: { intensity: 1 },
        paramSpecs: [
          {
            key: "intensity",
            labelKey: "cut.transitions.intensity",
            min: 0,
            max: 1,
            step: 0.05,
            default: 1,
          },
        ],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          return {
            outgoingStyle: {
              opacity: 1 - p * intensity,
              filter: `blur(${p * 8 * intensity}px) contrast(${1 + p * intensity})`,
            },
            incomingStyle: {
              opacity: p * intensity,
              filter: `blur(${(1 - p) * 8 * intensity}px) contrast(${1 + (1 - p) * intensity})`,
            },
          };
        },
        thumbnailStyle: makeThumbnail(
          { opacity: 0.5, filter: "blur(4px) contrast(1.5)" },
          { opacity: 0.5, filter: "blur(4px) contrast(1.5)" },
          "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
        ),
      },
      {
        id: "blur",
        nameKey: "cut.transitions.blur",
        category: "special",
        defaultDuration: 0.8,
        defaultParams: { intensity: 1 },
        paramSpecs: [INTENSITY_PARAM],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          const midP = p < 0.5 ? p * 2 : (1 - p) * 2;
          return {
            outgoingStyle: {
              opacity: 1 - p * intensity,
              filter: `blur(${midP * 15 * intensity}px)`,
            },
            incomingStyle: {
              opacity: p * intensity,
              filter: `blur(${midP * 15 * intensity}px)`,
            },
          };
        },
        thumbnailStyle: makeThumbnail(
          { opacity: 0.5, filter: "blur(4px)" },
          { opacity: 0.5, filter: "blur(4px)" },
          "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
        ),
      },
      {
        id: "shake",
        nameKey: "cut.transitions.shake",
        category: "special",
        defaultDuration: 0.6,
        defaultParams: { intensity: 1 },
        paramSpecs: [INTENSITY_PARAM],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          const shakeX = Math.sin(p * Math.PI * 8) * 20 * intensity;
          const shakeY = Math.cos(p * Math.PI * 6) * 15 * intensity;
          return {
            outgoingStyle: {
              opacity: 1 - p * intensity,
              transform: `translate(${shakeX}px, ${shakeY}px)`,
            },
            incomingStyle: {
              opacity: p * intensity,
              transform: `translate(${-shakeX}px, ${-shakeY}px)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background:
            "repeating-linear-gradient(90deg, #f093fb 0px, #4facfe 8px, #f093fb 16px)",
        },
      },
      {
        id: "pageFlip",
        nameKey: "cut.transitions.pageFlip",
        category: "special",
        defaultDuration: 1,
        defaultParams: { intensity: 1 },
        paramSpecs: [INTENSITY_PARAM],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          const angle = p * 180 * intensity;
          return {
            outgoingStyle: {
              transformOrigin: "left center",
              transform: `perspective(1200px) rotateY(${-angle}deg)`,
              backfaceVisibility: "hidden",
            },
            incomingStyle: {
              transformOrigin: "left center",
              transform: `perspective(1200px) rotateY(${180 - angle}deg)`,
              backfaceVisibility: "hidden",
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          transform: "perspective(200px) rotateY(15deg)",
        },
      },
      {
        id: "door",
        nameKey: "cut.transitions.door",
        category: "special",
        defaultDuration: 0.8,
        defaultParams: { intensity: 1 },
        paramSpecs: [INTENSITY_PARAM],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          const squeeze = 1 - p * 0.9 * intensity;
          return {
            outgoingStyle: {
              transform: `scaleX(${Math.max(0.01, squeeze)})`,
              opacity: 1 - p * intensity * 0.4,
            },
            incomingStyle: {
              transform: `scaleX(${0.1 + p * 0.9 * intensity})`,
              opacity: p * intensity,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background:
            "linear-gradient(90deg, #f093fb 0%, #fff 50%, #4facfe 100%)",
        },
      },
      {
        id: "invert",
        nameKey: "cut.transitions.invert",
        category: "special",
        defaultDuration: 0.7,
        defaultParams: { intensity: 1 },
        paramSpecs: [INTENSITY_PARAM],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          const midP = p < 0.5 ? p * 2 : (1 - p) * 2;
          return {
            outgoingStyle: {
              opacity: 1 - p * intensity,
              filter: `invert(${midP * intensity}) hue-rotate(${p * 180 * intensity}deg)`,
            },
            incomingStyle: {
              opacity: p * intensity,
              filter: `invert(${midP * intensity}) hue-rotate(${(1 - p) * 180 * intensity}deg)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background: "linear-gradient(135deg, #ff00ff 0%, #00ff00 100%)",
          filter: "invert(0.5)",
        },
      },
      {
        id: "ripple",
        nameKey: "cut.transitions.ripple",
        category: "special",
        defaultDuration: 0.9,
        defaultParams: { intensity: 1 },
        paramSpecs: [INTENSITY_PARAM],
        cssBuilder: (p, params) => {
          const intensity = num(params, "intensity", 1);
          const wave = Math.sin(p * Math.PI * 3) * intensity;
          const blurAmount =
            Math.abs(Math.sin(p * Math.PI * 2)) * 4 * intensity;
          return {
            outgoingStyle: {
              opacity: 1 - p * intensity,
              transform: `scale(${1 + wave * 0.15})`,
              filter: `blur(${blurAmount}px)`,
            },
            incomingStyle: {
              opacity: p * intensity,
              transform: `scale(${1 - wave * 0.15})`,
              filter: `blur(${blurAmount}px)`,
            },
          };
        },
        thumbnailStyle: {
          ...thumbnailBase,
          background: "radial-gradient(circle, #4facfe 0%, #f093fb 100%)",
        },
      },
    ],
  },
];

const definitionMap = new Map<string, TransitionDefinition>();
for (const cat of TRANSITION_CATEGORIES) {
  for (const t of cat.transitions) {
    definitionMap.set(t.id, t);
  }
}

export const getTransitionDefinition = (
  type: string,
): TransitionDefinition | undefined => definitionMap.get(type);
