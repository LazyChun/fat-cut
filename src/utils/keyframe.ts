import { timelineDuration } from "./clip";

const KEYFRAME_EPSILON = 1 / 120;

const KEYFRAME_PROPERTIES: Cut.ClipKeyframeProperty[] = [
  "transform.x",
  "transform.y",
  "transform.scale",
  "transform.scaleX",
  "transform.scaleY",
  "transform.rotation",
  "opacity",
];

const sortKeyframes = (keyframes: Cut.ClipKeyframe[]): Cut.ClipKeyframe[] =>
  [...keyframes].sort((a, b) => a.time - b.time);

const getClipBaseNumericValue = (
  clip: Cut.Clip,
  property: Cut.ClipKeyframeProperty,
): number => {
  switch (property) {
    case "transform.x":
      return clip.transform.x;
    case "transform.y":
      return clip.transform.y;
    case "transform.scale":
      return clip.transform.scale;
    case "transform.scaleX":
      return clip.transform.scaleX ?? clip.transform.scale;
    case "transform.scaleY":
      return clip.transform.scaleY ?? clip.transform.scale;
    case "transform.rotation":
      return clip.transform.rotation;
    case "opacity":
      return clip.opacity;
    default:
      return 0;
  }
};

const clampClipLocalTime = (clip: Cut.Clip, time: number): number => {
  const duration = Math.max(0, timelineDuration(clip));
  return Math.max(0, Math.min(time - clip.timelineIn, duration));
};

const getClipKeyframeTrack = (
  clip: Cut.Clip,
  property: Cut.ClipKeyframeProperty,
): Cut.ClipKeyframeTrack | undefined => {
  return clip.keyframes?.find((track) => track.property === property);
};

const getClipKeyframeAtTime = (
  clip: Cut.Clip,
  property: Cut.ClipKeyframeProperty,
  time: number,
): Cut.ClipKeyframe | undefined => {
  const localTime = clampClipLocalTime(clip, time);
  const track = getClipKeyframeTrack(clip, property);
  return track?.keyframes.find(
    (keyframe) => Math.abs(keyframe.time - localTime) <= KEYFRAME_EPSILON,
  );
};

const hasClipKeyframesForProperty = (
  clip: Cut.Clip,
  property: Cut.ClipKeyframeProperty,
): boolean => {
  return (getClipKeyframeTrack(clip, property)?.keyframes.length ?? 0) > 0;
};

const resolveClipNumericValue = (
  clip: Cut.Clip,
  property: Cut.ClipKeyframeProperty,
  time: number,
): number => {
  const baseValue = getClipBaseNumericValue(clip, property);
  const track = getClipKeyframeTrack(clip, property);
  if (!track || track.keyframes.length === 0) {
    return baseValue;
  }

  const localTime = clampClipLocalTime(clip, time);
  const keyframes = sortKeyframes(track.keyframes);
  const exact = keyframes.find(
    (keyframe) => Math.abs(keyframe.time - localTime) <= KEYFRAME_EPSILON,
  );
  if (exact) {
    return exact.value;
  }

  let previous: Cut.ClipKeyframe | undefined;
  let next: Cut.ClipKeyframe | undefined;
  for (const keyframe of keyframes) {
    if (keyframe.time < localTime) {
      previous = keyframe;
      continue;
    }
    if (keyframe.time > localTime) {
      next = keyframe;
      break;
    }
  }

  if (!previous && !next) {
    return baseValue;
  }
  if (!previous) {
    return next!.value;
  }
  if (!next) {
    return previous.value;
  }

  const progress = (localTime - previous.time) / (next.time - previous.time);
  return previous.value + (next.value - previous.value) * progress;
};

const resolveClipTransform = (
  clip: Cut.Clip,
  time: number,
): Cut.ClipTransform => ({
  x: resolveClipNumericValue(clip, "transform.x", time),
  y: resolveClipNumericValue(clip, "transform.y", time),
  scale: resolveClipNumericValue(clip, "transform.scale", time),
  scaleX: hasClipKeyframesForProperty(clip, "transform.scaleX")
    ? resolveClipNumericValue(clip, "transform.scaleX", time)
    : clip.transform.scaleX,
  scaleY: hasClipKeyframesForProperty(clip, "transform.scaleY")
    ? resolveClipNumericValue(clip, "transform.scaleY", time)
    : clip.transform.scaleY,
  rotation: resolveClipNumericValue(clip, "transform.rotation", time),
});

const resolveClipOpacity = (clip: Cut.Clip, time: number): number => {
  return resolveClipNumericValue(clip, "opacity", time);
};

const getClipKeyframeTimelineTimes = (clip: Cut.Clip): number[] => {
  const times = new Set<number>();
  for (const track of clip.keyframes ?? []) {
    for (const keyframe of track.keyframes) {
      times.add(clip.timelineIn + keyframe.time);
    }
  }
  return [...times].sort((a, b) => a - b);
};

const findAdjacentClipKeyframeTime = (
  clip: Cut.Clip,
  time: number,
  direction: "prev" | "next",
): number | undefined => {
  const times = getClipKeyframeTimelineTimes(clip);
  if (times.length === 0) {
    return undefined;
  }
  if (direction === "prev") {
    for (let i = times.length - 1; i >= 0; i -= 1) {
      if (times[i] < time - KEYFRAME_EPSILON) {
        return times[i];
      }
    }
    return undefined;
  }
  return times.find((keyframeTime) => keyframeTime > time + KEYFRAME_EPSILON);
};

export {
  KEYFRAME_EPSILON,
  KEYFRAME_PROPERTIES,
  getClipBaseNumericValue,
  clampClipLocalTime,
  getClipKeyframeTrack,
  getClipKeyframeAtTime,
  hasClipKeyframesForProperty,
  resolveClipNumericValue,
  resolveClipTransform,
  resolveClipOpacity,
  getClipKeyframeTimelineTimes,
  findAdjacentClipKeyframeTime,
};
