import { useSyncExternalStore } from "react";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import { playbackStore } from "./playbackStore";
import {
  collectSnapPoints,
  findClip,
  getTimelineEnd,
  snap,
  timelineOut,
} from "../utils/clip";
import {
  KEYFRAME_EPSILON,
  clampClipLocalTime,
  getClipKeyframeAtTime,
  getClipBaseNumericValue,
  hasClipKeyframesForProperty,
  resolveClipNumericValue,
} from "../utils/keyframe";
import { getEffectDefinition } from "../utils/effects";
import { getFilterDefinition } from "../utils/filters";
import { getTransitionDefinition } from "../utils/transitions";

type LoadingStatus = "idle" | "loading" | "succeeded" | "failed";

interface EditorState {
  project?: Cut.CutProject;
  loadingStatus: LoadingStatus;
  selectedClipId?: string;
  selectedTrackId?: string;
  // 转场选中态:持有 transitionOut 的 clip 与该 transition 的 id
  selectedTransitionId?: string;
  selectedTransitionClipId?: string;
  // 滤镜片段选中态
  selectedFilterClipId?: string;
  pixelsPerSecond: number;
  snapEnabled: boolean;
  dirty: boolean;
  // 预览画布尺寸(CSS 像素),由 PreviewVideo 的 ResizeObserver 写入,
  // 导出时传给后端用于 transform.x/y 从 canvas → project 坐标换算。
  canvasSize?: { width: number; height: number };
}

const initialState: EditorState = {
  project: undefined,
  loadingStatus: "idle",
  selectedClipId: undefined,
  selectedTrackId: undefined,
  selectedTransitionId: undefined,
  selectedTransitionClipId: undefined,
  selectedFilterClipId: undefined,
  pixelsPerSecond: 50,
  snapEnabled: true,
  dirty: false,
  canvasSize: undefined,
};

let state = initialState;
let loadingPromise: Promise<Cut.CutProject> | null = null;
const listeners = new Set<() => void>();

const emitChange = () => {
  listeners.forEach((listener) => listener());
};

const setState = (updater: (prev: EditorState) => EditorState) => {
  const next = updater(state);
  if (next === state) {
    return;
  }
  state = next;
  emitChange();
};

const genId = () => {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
};

const nowIso = () => new Date().toISOString();

type ClipMotionPatch = Partial<{
  x: number;
  y: number;
  scale: number;
  scaleX: number | undefined;
  scaleY: number | undefined;
  rotation: number;
  opacity: number;
}>;

const setTransformValue = (
  transform: Cut.ClipTransform,
  property: Exclude<Cut.ClipKeyframeProperty, "opacity">,
  value: number | undefined,
) => {
  switch (property) {
    case "transform.x":
      transform.x = value ?? 0;
      break;
    case "transform.y":
      transform.y = value ?? 0;
      break;
    case "transform.scale":
      transform.scale = value ?? 1;
      break;
    case "transform.scaleX":
      transform.scaleX = value;
      break;
    case "transform.scaleY":
      transform.scaleY = value;
      break;
    case "transform.rotation":
      transform.rotation = value ?? 0;
      break;
  }
};

const upsertClipKeyframeTrack = (
  clip: Cut.Clip,
  property: Cut.ClipKeyframeProperty,
  localTime: number,
  value: number,
): Cut.ClipKeyframeTrack[] => {
  const tracks = (clip.keyframes ?? []).map((track) => ({
    ...track,
    keyframes: [...track.keyframes],
  }));
  const trackIndex = tracks.findIndex((track) => track.property === property);
  if (trackIndex < 0) {
    tracks.push({
      property,
      keyframes: [
        {
          id: genId(),
          time: localTime,
          value,
        },
      ],
    });
    return tracks;
  }

  const track = tracks[trackIndex];
  const exactIndex = track.keyframes.findIndex(
    (keyframe) => Math.abs(keyframe.time - localTime) <= KEYFRAME_EPSILON,
  );
  if (exactIndex >= 0) {
    track.keyframes[exactIndex] = {
      ...track.keyframes[exactIndex],
      time: localTime,
      value,
    };
  } else {
    track.keyframes.push({
      id: genId(),
      time: localTime,
      value,
    });
  }
  track.keyframes.sort((a, b) => a.time - b.time);
  return tracks;
};

const removeClipKeyframeTrackValue = (
  clip: Cut.Clip,
  property: Cut.ClipKeyframeProperty,
  localTime: number,
): Cut.ClipKeyframeTrack[] => {
  return (clip.keyframes ?? [])
    .map((track) => {
      if (track.property !== property) {
        return track;
      }
      return {
        ...track,
        keyframes: track.keyframes.filter(
          (keyframe) => Math.abs(keyframe.time - localTime) > KEYFRAME_EPSILON,
        ),
      };
    })
    .filter((track) => track.keyframes.length > 0);
};

const buildClipWithMotionPatch = (
  clip: Cut.Clip,
  motionPatch: ClipMotionPatch,
  atTime: number,
): Cut.Clip => {
  const nextClip: Cut.Clip = {
    ...clip,
    transform: { ...clip.transform },
    keyframes: (clip.keyframes ?? []).map((track) => ({
      ...track,
      keyframes: [...track.keyframes],
    })),
  };
  const isWithinClip =
    atTime >= clip.timelineIn - KEYFRAME_EPSILON &&
    atTime <= timelineOut(clip) + KEYFRAME_EPSILON;
  const localTime = clampClipLocalTime(clip, atTime);

  const apply = (
    property: Cut.ClipKeyframeProperty,
    value: number | undefined,
  ) => {
    const shouldUseKeyframe =
      isWithinClip &&
      value !== undefined &&
      hasClipKeyframesForProperty(clip, property);
    if (shouldUseKeyframe) {
      nextClip.keyframes = upsertClipKeyframeTrack(
        nextClip,
        property,
        localTime,
        value,
      );
      return;
    }
    if (property === "opacity") {
      nextClip.opacity = value ?? clip.opacity;
      return;
    }
    setTransformValue(
      nextClip.transform,
      property as Exclude<Cut.ClipKeyframeProperty, "opacity">,
      value,
    );
  };

  if ("x" in motionPatch) apply("transform.x", motionPatch.x);
  if ("y" in motionPatch) apply("transform.y", motionPatch.y);
  if ("scale" in motionPatch) apply("transform.scale", motionPatch.scale);
  if ("scaleX" in motionPatch) apply("transform.scaleX", motionPatch.scaleX);
  if ("scaleY" in motionPatch) apply("transform.scaleY", motionPatch.scaleY);
  if ("rotation" in motionPatch) {
    apply("transform.rotation", motionPatch.rotation);
  }
  if ("opacity" in motionPatch) apply("opacity", motionPatch.opacity);

  nextClip.updatedAt = nowIso();
  return nextClip;
};

const setLoadingStatus = (loadingStatus: LoadingStatus) => {
  setState((prev) =>
    prev.loadingStatus === loadingStatus ? prev : { ...prev, loadingStatus },
  );
};

const setProject = (project: Cut.CutProject) => {
  // 确保 filterClips 字段存在(兼容旧工程)
  const normalizedProject: Cut.CutProject = {
    ...project,
    filterClips: project.filterClips ?? [],
  };
  setState((prev) => ({
    ...prev,
    project: normalizedProject,
    dirty: false,
    selectedClipId: undefined,
    selectedTrackId: undefined,
    selectedTransitionId: undefined,
    selectedTransitionClipId: undefined,
    selectedFilterClipId: undefined,
  }));
};

const reset = () => {
  setState(() => ({
    ...initialState,
    project: undefined,
  }));
};

const loadProject = async (
  sdk: FatNotesPluginSDK,
  id: string,
): Promise<Cut.CutProject> => {
  if (loadingPromise) {
    return loadingPromise;
  }
  setLoadingStatus("loading");
  loadingPromise = sdk.backend
    .invoke<Cut.ProjectDetailResponse>("getProject", { id })
    .then((result) => {
      const project = result?.project;
      if (!project) {
        throw new Error("Project not found");
      }
      setProject(project);
      setLoadingStatus("succeeded");
      // 记住最近打开的工程，下次加载插件时自动恢复
      void sdk.config.set({ lastProjectId: id }, { merge: true });
      return project;
    })
    .catch((error) => {
      setLoadingStatus("failed");
      throw error;
    })
    .finally(() => {
      loadingPromise = null;
    });
  return loadingPromise;
};

const saveProject = async (sdk: FatNotesPluginSDK): Promise<void> => {
  if (!state.project) {
    return;
  }
  await sdk.backend.invoke<Cut.ProjectDetailResponse>("saveProject", {
    project: state.project,
  });
  setState((prev) => ({ ...prev, dirty: false }));
};

interface AddClipInput {
  type: Cut.ClipType;
  assetRef?: Cut.AssetRef;
  text?: Cut.TextConfig;
  sticker?: Cut.StickerConfig;
  transform?: Partial<Cut.ClipTransform>;
  duration?: number;
  timelineIn?: number;
}

const addClip = (input: AddClipInput): string | undefined => {
  if (!state.project) {
    return undefined;
  }
  const tracks = state.project.tracks;
  const targetTrackType = input.type === "audio" ? "audio" : "video";
  // 找最上层未锁定的目标轨
  let targetTrack = tracks
    .filter((t) => t.type === targetTrackType && !t.locked)
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];

  if (!targetTrack) {
    const newTrackId = addTrack(targetTrackType);
    if (!newTrackId) {
      return undefined;
    }
    targetTrack = state.project.tracks.find((t) => t.id === newTrackId)!;
  }

  const currentTime = input.timelineIn ?? playbackStore.getState().currentTime;
  let timelineIn = currentTime;
  const duration = input.duration ?? input.assetRef?.duration ?? 5;

  // 若当前位置与同轨已有片段重叠，则贴到该轨最后一个片段尾部
  const trackClips = targetTrack.clips;
  const overlapping = trackClips.find(
    (c) => timelineIn >= c.timelineIn && timelineIn < timelineOut(c),
  );
  if (overlapping) {
    timelineIn = getTimelineEnd([targetTrack]);
  }

  const now = nowIso();
  const clipId = genId();
  const newClip: Cut.Clip = {
    id: clipId,
    trackId: targetTrack.id,
    type: input.type,
    assetRef: input.assetRef,
    sourceIn: 0,
    sourceOut: duration,
    timelineIn,
    speed: 1,
    volume: 1,
    opacity: 1,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, ...input.transform },
    effects: [],
    transitionIn: undefined,
    transitionOut: undefined,
    text: input.text,
    sticker: input.sticker,
    createdAt: now,
    updatedAt: now,
  };

  setState((prev) => {
    if (!prev.project) {
      return prev;
    }
    const nextProject: Cut.CutProject = {
      ...prev.project,
      tracks: prev.project.tracks.map((t) =>
        t.id === targetTrack.id ? { ...t, clips: [...t.clips, newClip] } : t,
      ),
    };
    return {
      ...prev,
      project: nextProject,
      selectedClipId: clipId,
      selectedTrackId: targetTrack.id,
      dirty: true,
    };
  });
  return clipId;
};

interface AddOverlayClipInput {
  type: "text" | "sticker" | "subtitle";
  text?: Cut.TextConfig;
  sticker?: Cut.StickerConfig;
  transform?: Partial<Cut.ClipTransform>;
  duration?: number;
}

// 在当前时间放置一个 text/sticker 叠加片段：
// 优先放在最上层不与当前位置重叠的 video 轨；若都重叠则新建一条最上层 video 轨。
const addOverlayClip = (input: AddOverlayClipInput): string | undefined => {
  if (!state.project) {
    return undefined;
  }

  const currentTime = playbackStore.getState().currentTime;
  const duration = input.duration ?? 5;

  const findNonOverlappingTrack = (
    tracks: Cut.Track[],
  ): Cut.Track | undefined =>
    tracks
      .filter((t) => t.type === "video" && !t.locked)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .find(
        (t) =>
          !t.clips.some(
            (c) => currentTime >= c.timelineIn && currentTime < timelineOut(c),
          ),
      );

  let targetTrack = findNonOverlappingTrack(state.project.tracks);
  if (!targetTrack) {
    const newTrackId = addTrack("video");
    if (!newTrackId) {
      return undefined;
    }
    targetTrack = state.project?.tracks.find((t) => t.id === newTrackId);
  }
  if (!targetTrack) {
    return undefined;
  }
  const targetTrackId = targetTrack.id;

  const now = nowIso();
  const clipId = genId();
  const newClip: Cut.Clip = {
    id: clipId,
    trackId: targetTrackId,
    type: input.type,
    sourceIn: 0,
    sourceOut: duration,
    timelineIn: currentTime,
    speed: 1,
    volume: 1,
    opacity: 1,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, ...input.transform },
    effects: [],
    transitionIn: undefined,
    transitionOut: undefined,
    text: input.text,
    sticker: input.sticker,
    createdAt: now,
    updatedAt: now,
  };

  setState((prev) => {
    if (!prev.project) {
      return prev;
    }
    const nextProject: Cut.CutProject = {
      ...prev.project,
      tracks: prev.project.tracks.map((t) =>
        t.id === targetTrackId ? { ...t, clips: [...t.clips, newClip] } : t,
      ),
    };
    return {
      ...prev,
      project: nextProject,
      selectedClipId: clipId,
      selectedTrackId: targetTrackId,
      dirty: true,
    };
  });
  return clipId;
};

const DEFAULT_SUBTITLE_DURATION = 3;

// 在当前播放头位置放置一条字幕片段。
// 字幕复用 text 配置承载样式，transform.y 默认按画布高度比例偏下，
// 使字幕贴近画面底部（中心向下约 30% 画布高度），避免固定像素在小画布上溢出。
const addSubtitleClip = (
  text: Cut.TextConfig,
  options?: {
    duration?: number;
    timelineIn?: number;
    transform?: Partial<Cut.ClipTransform>;
  },
): string | undefined => {
  const canvasHeight = state.canvasSize?.height;
  const defaultY = canvasHeight ? canvasHeight * 0.32 : 220;
  return addOverlayClip({
    type: "subtitle",
    text: { ...text },
    duration: options?.duration ?? DEFAULT_SUBTITLE_DURATION,
    transform: { y: defaultY, ...options?.transform },
  });
};

const moveClip = (
  clipId: string,
  toTrackId: string,
  newTimelineIn: number,
): void => {
  setState((prev) => {
    if (!prev.project) {
      return prev;
    }
    const found = findClip(prev.project.tracks, clipId);
    if (!found) {
      return prev;
    }
    const { clip, track: sourceTrack } = found;
    const targetTrack = prev.project.tracks.find((t) => t.id === toTrackId);
    if (!targetTrack || targetTrack.locked) {
      return prev;
    }
    if (targetTrack.type !== sourceTrack.type) {
      return prev;
    }

    let snappedIn = Math.max(0, newTimelineIn);
    if (prev.snapEnabled) {
      const points = collectSnapPoints(
        prev.project.tracks,
        clipId,
        playbackStore.getState().currentTime,
      );
      snappedIn = snap(snappedIn, points);
    }

    const updatedClip: Cut.Clip = {
      ...clip,
      trackId: toTrackId,
      timelineIn: snappedIn,
    };

    const tracks = prev.project.tracks.map((t) => {
      if (t.id === sourceTrack.id && t.id === toTrackId) {
        return {
          ...t,
          clips: t.clips.filter((c) => c.id !== clipId).concat(updatedClip),
        };
      }
      if (t.id === sourceTrack.id) {
        return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
      }
      if (t.id === toTrackId) {
        return { ...t, clips: [...t.clips, updatedClip] };
      }
      return t;
    });

    return {
      ...prev,
      project: { ...prev.project, tracks },
      selectedClipId: clipId,
      selectedTrackId: toTrackId,
      dirty: true,
    };
  });
};

const trimClip = (
  clipId: string,
  edge: "left" | "right",
  deltaSeconds: number,
): void => {
  setState((prev) => {
    if (!prev.project) {
      return prev;
    }
    const found = findClip(prev.project.tracks, clipId);
    if (!found) {
      return prev;
    }
    const { clip } = found;
    const minDur = 0.1;
    const isDurationExtendableClip =
      clip.type === "image" ||
      clip.type === "text" ||
      clip.type === "sticker" ||
      clip.type === "subtitle";
    const maxSource = isDurationExtendableClip
      ? Number.POSITIVE_INFINITY
      : (clip.assetRef?.duration ?? clip.sourceOut);

    let nextSourceIn = clip.sourceIn;
    let nextSourceOut = clip.sourceOut;
    let nextTimelineIn = clip.timelineIn;

    if (isDurationExtendableClip) {
      const currentDuration = clip.sourceOut - clip.sourceIn;
      if (edge === "left") {
        nextTimelineIn = Math.max(0, clip.timelineIn + deltaSeconds);
        const actualDelta = nextTimelineIn - clip.timelineIn;
        const nextDuration = Math.max(minDur, currentDuration - actualDelta);
        nextSourceIn = 0;
        nextSourceOut = nextDuration;
      } else {
        const nextDuration = Math.max(minDur, currentDuration + deltaSeconds);
        nextSourceIn = 0;
        nextSourceOut = nextDuration;
      }

      const updatedClip: Cut.Clip = {
        ...clip,
        sourceIn: nextSourceIn,
        sourceOut: nextSourceOut,
        timelineIn: nextTimelineIn,
        updatedAt: nowIso(),
      };

      return {
        ...prev,
        project: {
          ...prev.project,
          tracks: prev.project.tracks.map((t) =>
            t.id === clip.trackId
              ? {
                  ...t,
                  clips: t.clips.map((c) =>
                    c.id === clipId ? updatedClip : c,
                  ),
                }
              : t,
          ),
        },
        dirty: true,
      };
    }

    if (edge === "left") {
      nextSourceIn = Math.max(0, clip.sourceIn + deltaSeconds);
      if (clip.sourceOut - nextSourceIn < minDur) {
        nextSourceIn = clip.sourceOut - minDur;
      }
      // 左边缘移动时 timelineIn 同步偏移，保持右边缘不动
      nextTimelineIn = clip.timelineIn + (nextSourceIn - clip.sourceIn);
    } else {
      nextSourceOut = Math.min(maxSource, clip.sourceOut + deltaSeconds);
      if (nextSourceOut - clip.sourceIn < minDur) {
        nextSourceOut = clip.sourceIn + minDur;
      }
    }

    const updatedClip: Cut.Clip = {
      ...clip,
      sourceIn: nextSourceIn,
      sourceOut: nextSourceOut,
      timelineIn: nextTimelineIn,
      updatedAt: nowIso(),
    };

    return {
      ...prev,
      project: {
        ...prev.project,
        tracks: prev.project.tracks.map((t) =>
          t.id === clip.trackId
            ? {
                ...t,
                clips: t.clips.map((c) => (c.id === clipId ? updatedClip : c)),
              }
            : t,
        ),
      },
      dirty: true,
    };
  });
};

const deleteClip = (clipId: string): void => {
  setState((prev) => {
    if (!prev.project) {
      return prev;
    }
    return {
      ...prev,
      project: {
        ...prev.project,
        tracks: prev.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.filter((c) => c.id !== clipId),
        })),
      },
      selectedClipId:
        prev.selectedClipId === clipId ? undefined : prev.selectedClipId,
      selectedTransitionClipId:
        prev.selectedTransitionClipId === clipId
          ? undefined
          : prev.selectedTransitionClipId,
      selectedTransitionId:
        prev.selectedTransitionClipId === clipId
          ? undefined
          : prev.selectedTransitionId,
      dirty: true,
    };
  });
};

// 在指定时间点将片段一分为二。原片段被替换为左右两个新片段。
// transitionIn 由左半段继承，transitionOut 由右半段继承；effects/filters 两侧共享。
const splitClip = (clipId: string, atTime?: number): void => {
  setState((prev) => {
    if (!prev.project) {
      return prev;
    }
    const found = findClip(prev.project.tracks, clipId);
    if (!found) {
      return prev;
    }
    const { clip, track } = found;
    const splitTime = atTime ?? playbackStore.getState().currentTime;
    const clipOut = timelineOut(clip);
    // 必须严格在片段内部
    if (splitTime <= clip.timelineIn + 0.001) return prev;
    if (splitTime >= clipOut - 0.001) return prev;

    const speed = clip.speed || 1;
    const sourceAtSplit = clip.sourceIn + (splitTime - clip.timelineIn) * speed;
    const now = nowIso();

    const leftClip: Cut.Clip = {
      ...clip,
      id: genId(),
      sourceOut: sourceAtSplit,
      transitionOut: undefined,
      updatedAt: now,
    };
    const rightClip: Cut.Clip = {
      ...clip,
      id: genId(),
      sourceIn: sourceAtSplit,
      timelineIn: splitTime,
      transitionIn: undefined,
      updatedAt: now,
    };

    return {
      ...prev,
      project: {
        ...prev.project,
        tracks: prev.project.tracks.map((t) =>
          t.id === track.id
            ? {
                ...t,
                clips: t.clips
                  .filter((c) => c.id !== clipId)
                  .concat([leftClip, rightClip]),
              }
            : t,
        ),
      },
      selectedClipId: rightClip.id,
      dirty: true,
    };
  });
};

// 向左剪切：删除播放头左侧的内容，片段起点移到 atTime。
// transitionIn 被清除，transitionOut 保留。
const cutLeft = (clipId: string, atTime?: number): void => {
  setState((prev) => {
    if (!prev.project) {
      return prev;
    }
    const found = findClip(prev.project.tracks, clipId);
    if (!found) {
      return prev;
    }
    const { clip } = found;
    const cutTime = atTime ?? playbackStore.getState().currentTime;
    const clipOut = timelineOut(clip);
    if (cutTime <= clip.timelineIn + 0.001) return prev;
    if (cutTime >= clipOut - 0.001) return prev;

    const speed = clip.speed || 1;
    const newSourceIn = clip.sourceIn + (cutTime - clip.timelineIn) * speed;
    const updatedClip: Cut.Clip = {
      ...clip,
      sourceIn: newSourceIn,
      timelineIn: cutTime,
      transitionIn: undefined,
      updatedAt: nowIso(),
    };

    return {
      ...prev,
      project: {
        ...prev.project,
        tracks: prev.project.tracks.map((t) =>
          t.id === clip.trackId
            ? {
                ...t,
                clips: t.clips.map((c) => (c.id === clipId ? updatedClip : c)),
              }
            : t,
        ),
      },
      dirty: true,
    };
  });
};

// 向右剪切：删除播放头右侧的内容，片段终点收到 atTime。
// transitionOut 被清除，transitionIn 保留。
const cutRight = (clipId: string, atTime?: number): void => {
  setState((prev) => {
    if (!prev.project) {
      return prev;
    }
    const found = findClip(prev.project.tracks, clipId);
    if (!found) {
      return prev;
    }
    const { clip } = found;
    const cutTime = atTime ?? playbackStore.getState().currentTime;
    if (cutTime <= clip.timelineIn + 0.001) return prev;
    if (cutTime >= timelineOut(clip) - 0.001) return prev;

    const speed = clip.speed || 1;
    const newSourceOut = clip.sourceIn + (cutTime - clip.timelineIn) * speed;
    const updatedClip: Cut.Clip = {
      ...clip,
      sourceOut: newSourceOut,
      transitionOut: undefined,
      updatedAt: nowIso(),
    };

    return {
      ...prev,
      project: {
        ...prev.project,
        tracks: prev.project.tracks.map((t) =>
          t.id === clip.trackId
            ? {
                ...t,
                clips: t.clips.map((c) => (c.id === clipId ? updatedClip : c)),
              }
            : t,
        ),
      },
      dirty: true,
    };
  });
};

const updateClip = (clipId: string, patch: Partial<Cut.Clip>): void => {
  setState((prev) => {
    if (!prev.project) {
      return prev;
    }
    return {
      ...prev,
      project: {
        ...prev.project,
        tracks: prev.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, ...patch, updatedAt: nowIso() } : c,
          ),
        })),
      },
      dirty: true,
    };
  });
};

const updateClipMotion = (
  clipId: string,
  motionPatch: ClipMotionPatch,
  atTime: number = playbackStore.getState().currentTime,
): void => {
  setState((prev) => {
    if (!prev.project) {
      return prev;
    }
    const found = findClip(prev.project.tracks, clipId);
    if (!found) {
      return prev;
    }
    const updatedClip = buildClipWithMotionPatch(
      found.clip,
      motionPatch,
      atTime,
    );
    return {
      ...prev,
      project: {
        ...prev.project,
        tracks: prev.project.tracks.map((track) =>
          track.id === found.track.id
            ? {
                ...track,
                clips: track.clips.map((clip) =>
                  clip.id === clipId ? updatedClip : clip,
                ),
              }
            : track,
        ),
      },
      dirty: true,
    };
  });
};

const toggleClipKeyframe = (
  clipId: string,
  property: Cut.ClipKeyframeProperty,
  atTime: number = playbackStore.getState().currentTime,
): void => {
  setState((prev) => {
    if (!prev.project) {
      return prev;
    }
    const found = findClip(prev.project.tracks, clipId);
    if (!found) {
      return prev;
    }
    const { clip, track } = found;
    const isWithinClip =
      atTime >= clip.timelineIn - KEYFRAME_EPSILON &&
      atTime <= timelineOut(clip) + KEYFRAME_EPSILON;
    if (!isWithinClip) {
      return prev;
    }

    const localTime = clampClipLocalTime(clip, atTime);
    const currentKeyframe = getClipKeyframeAtTime(clip, property, atTime);
    const nextClip: Cut.Clip = {
      ...clip,
      transform: { ...clip.transform },
      updatedAt: nowIso(),
    };

    if (currentKeyframe) {
      nextClip.keyframes = removeClipKeyframeTrackValue(
        clip,
        property,
        localTime,
      );
      if ((nextClip.keyframes?.length ?? 0) === 0) {
        delete nextClip.keyframes;
      }
    } else {
      const value = hasClipKeyframesForProperty(clip, property)
        ? resolveClipNumericValue(clip, property, atTime)
        : getClipBaseNumericValue(clip, property);
      nextClip.keyframes = upsertClipKeyframeTrack(
        clip,
        property,
        localTime,
        value,
      );
    }

    return {
      ...prev,
      project: {
        ...prev.project,
        tracks: prev.project.tracks.map((item) =>
          item.id === track.id
            ? {
                ...item,
                clips: item.clips.map((itemClip) =>
                  itemClip.id === clipId ? nextClip : itemClip,
                ),
              }
            : item,
        ),
      },
      dirty: true,
    };
  });
};

const setClipKeyframeValue = (
  clipId: string,
  property: Cut.ClipKeyframeProperty,
  value: number,
  atTime: number = playbackStore.getState().currentTime,
): void => {
  setState((prev) => {
    if (!prev.project) {
      return prev;
    }
    const found = findClip(prev.project.tracks, clipId);
    if (!found) {
      return prev;
    }
    const { clip, track } = found;
    const isWithinClip =
      atTime >= clip.timelineIn - KEYFRAME_EPSILON &&
      atTime <= timelineOut(clip) + KEYFRAME_EPSILON;
    if (!isWithinClip) {
      return prev;
    }

    const localTime = clampClipLocalTime(clip, atTime);
    const nextClip: Cut.Clip = {
      ...clip,
      keyframes: upsertClipKeyframeTrack(clip, property, localTime, value),
      updatedAt: nowIso(),
    };

    return {
      ...prev,
      project: {
        ...prev.project,
        tracks: prev.project.tracks.map((item) =>
          item.id === track.id
            ? {
                ...item,
                clips: item.clips.map((itemClip) =>
                  itemClip.id === clipId ? nextClip : itemClip,
                ),
              }
            : item,
        ),
      },
      dirty: true,
    };
  });
};

const addClipEffect = (
  clipId: string,
  effect: { type: string; params?: Record<string, unknown> },
): string | undefined => {
  if (!state.project) return undefined;
  const found = findClip(state.project.tracks, clipId);
  if (!found) return undefined;
  const { clip } = found;
  if (clip.type === "audio") return undefined;
  const def = getEffectDefinition(effect.type);
  if (!def) return undefined;
  const effectId = genId();
  const params = effect.params ?? { ...def.defaultParams };
  const newEffect: Cut.EffectConfig = {
    id: effectId,
    type: effect.type,
    params,
  };
  setState((prev) => {
    if (!prev.project) return prev;
    return {
      ...prev,
      project: {
        ...prev.project,
        tracks: prev.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId
              ? {
                  ...c,
                  effects: [...c.effects, newEffect],
                  updatedAt: nowIso(),
                }
              : c,
          ),
        })),
      },
      dirty: true,
    };
  });
  return effectId;
};

const updateClipEffect = (
  clipId: string,
  effectId: string,
  params: Record<string, unknown>,
): void => {
  setState((prev) => {
    if (!prev.project) return prev;
    return {
      ...prev,
      project: {
        ...prev.project,
        tracks: prev.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId
              ? {
                  ...c,
                  effects: c.effects.map((e) =>
                    e.id === effectId
                      ? { ...e, params: { ...e.params, ...params } }
                      : e,
                  ),
                  updatedAt: nowIso(),
                }
              : c,
          ),
        })),
      },
      dirty: true,
    };
  });
};

const removeClipEffect = (clipId: string, effectId: string): void => {
  setState((prev) => {
    if (!prev.project) return prev;
    return {
      ...prev,
      project: {
        ...prev.project,
        tracks: prev.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId
              ? {
                  ...c,
                  effects: c.effects.filter((e) => e.id !== effectId),
                  updatedAt: nowIso(),
                }
              : c,
          ),
        })),
      },
      dirty: true,
    };
  });
};

const clearClipEffects = (clipId: string): void => {
  setState((prev) => {
    if (!prev.project) return prev;
    return {
      ...prev,
      project: {
        ...prev.project,
        tracks: prev.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, effects: [], updatedAt: nowIso() } : c,
          ),
        })),
      },
      dirty: true,
    };
  });
};

// ── 滤镜片段操作 ──
// 滤镜片段独立于 clip,拥有自己的时间范围,在时间线滤镜轨道上排列。

const DEFAULT_FILTER_DURATION = 5;

const addFilterClip = (
  filterType: string,
  options?: { timelineIn?: number; duration?: number },
): string | undefined => {
  if (!state.project) return undefined;
  const def = getFilterDefinition(filterType);
  if (!def) return undefined;
  const filterId = genId();
  const timelineIn =
    options?.timelineIn ?? playbackStore.getState().currentTime;
  const duration = options?.duration ?? DEFAULT_FILTER_DURATION;
  const newFilterClip: Cut.FilterClip = {
    id: filterId,
    type: filterType,
    timelineIn,
    duration,
    params: { ...def.defaultParams },
  };
  setState((prev) => {
    if (!prev.project) return prev;
    return {
      ...prev,
      project: {
        ...prev.project,
        filterClips: [...(prev.project.filterClips ?? []), newFilterClip],
      },
      selectedFilterClipId: filterId,
      selectedClipId: undefined,
      selectedTrackId: undefined,
      selectedTransitionId: undefined,
      selectedTransitionClipId: undefined,
      dirty: true,
    };
  });
  return filterId;
};

const updateFilterClip = (
  filterClipId: string,
  patch: Partial<Pick<Cut.FilterClip, "params" | "timelineIn" | "duration">>,
): void => {
  setState((prev) => {
    if (!prev.project) return prev;
    const filterClips = prev.project.filterClips ?? [];
    const exists = filterClips.some((f) => f.id === filterClipId);
    if (!exists) return prev;
    return {
      ...prev,
      project: {
        ...prev.project,
        filterClips: filterClips.map((f) =>
          f.id === filterClipId
            ? {
                ...f,
                ...patch,
                params: patch.params
                  ? { ...f.params, ...patch.params }
                  : f.params,
              }
            : f,
        ),
      },
      dirty: true,
    };
  });
};

const removeFilterClip = (filterClipId: string): void => {
  setState((prev) => {
    if (!prev.project) return prev;
    return {
      ...prev,
      project: {
        ...prev.project,
        filterClips: (prev.project.filterClips ?? []).filter(
          (f) => f.id !== filterClipId,
        ),
      },
      selectedFilterClipId:
        prev.selectedFilterClipId === filterClipId
          ? undefined
          : prev.selectedFilterClipId,
      dirty: true,
    };
  });
};

const moveFilterClip = (filterClipId: string, newTimelineIn: number): void => {
  setState((prev) => {
    if (!prev.project) return prev;
    const filterClips = prev.project.filterClips ?? [];
    const target = filterClips.find((f) => f.id === filterClipId);
    if (!target) return prev;

    let snappedIn = Math.max(0, newTimelineIn);
    if (prev.snapEnabled) {
      const points = collectSnapPoints(
        prev.project.tracks,
        undefined,
        playbackStore.getState().currentTime,
      );
      // 加入其他滤镜片段的边缘作为吸附点
      for (const f of filterClips) {
        if (f.id === filterClipId) continue;
        points.push(f.timelineIn, f.timelineIn + f.duration);
      }
      snappedIn = snap(snappedIn, points);
    }

    return {
      ...prev,
      project: {
        ...prev.project,
        filterClips: filterClips.map((f) =>
          f.id === filterClipId ? { ...f, timelineIn: snappedIn } : f,
        ),
      },
      dirty: true,
    };
  });
};

const trimFilterClip = (
  filterClipId: string,
  edge: "left" | "right",
  deltaSeconds: number,
): void => {
  setState((prev) => {
    if (!prev.project) return prev;
    const filterClips = prev.project.filterClips ?? [];
    const target = filterClips.find((f) => f.id === filterClipId);
    if (!target) return prev;

    const minDur = 0.1;
    let nextTimelineIn = target.timelineIn;
    let nextDuration = target.duration;

    if (edge === "left") {
      const newTimelineIn = Math.max(0, target.timelineIn + deltaSeconds);
      const shift = newTimelineIn - target.timelineIn;
      nextDuration = target.duration - shift;
      if (nextDuration < minDur) {
        nextDuration = minDur;
        nextTimelineIn = target.timelineIn + (target.duration - minDur);
      } else {
        nextTimelineIn = newTimelineIn;
      }
    } else {
      nextDuration = Math.max(minDur, target.duration + deltaSeconds);
    }

    return {
      ...prev,
      project: {
        ...prev.project,
        filterClips: filterClips.map((f) =>
          f.id === filterClipId
            ? { ...f, timelineIn: nextTimelineIn, duration: nextDuration }
            : f,
        ),
      },
      dirty: true,
    };
  });
};

const setFilterClipSelection = (filterClipId?: string): void => {
  setState((prev) => ({
    ...prev,
    selectedFilterClipId: filterClipId,
    selectedClipId: undefined,
    selectedTrackId: undefined,
    selectedTransitionId: undefined,
    selectedTransitionClipId: undefined,
  }));
};

const addClipTransition = (
  clipId: string,
  edge: "in" | "out",
  transition: {
    type: string;
    duration?: number;
    params?: Record<string, unknown>;
  },
): string | undefined => {
  if (!state.project) return undefined;
  const found = findClip(state.project.tracks, clipId);
  if (!found) return undefined;
  const { clip } = found;
  if (clip.type === "audio") return undefined;
  const def = getTransitionDefinition(transition.type);
  if (!def) return undefined;
  const transitionId = genId();
  const duration = transition.duration ?? def.defaultDuration;
  const params = transition.params ?? { ...def.defaultParams };
  const newTransition: Cut.TransitionConfig = {
    id: transitionId,
    type: transition.type,
    duration,
    params,
  };
  setState((prev) => {
    if (!prev.project) return prev;
    return {
      ...prev,
      project: {
        ...prev.project,
        tracks: prev.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId
              ? {
                  ...c,
                  [edge === "in" ? "transitionIn" : "transitionOut"]:
                    newTransition,
                  updatedAt: nowIso(),
                }
              : c,
          ),
        })),
      },
      dirty: true,
    };
  });
  return transitionId;
};

const updateClipTransition = (
  clipId: string,
  edge: "in" | "out",
  patch: Partial<Cut.TransitionConfig>,
): void => {
  setState((prev) => {
    if (!prev.project) return prev;
    return {
      ...prev,
      project: {
        ...prev.project,
        tracks: prev.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => {
            if (c.id !== clipId) return c;
            const key = edge === "in" ? "transitionIn" : "transitionOut";
            const current = c[key];
            if (!current) return c;
            return {
              ...c,
              [key]: {
                ...current,
                ...patch,
                params: { ...current.params, ...patch.params },
              },
              updatedAt: nowIso(),
            };
          }),
        })),
      },
      dirty: true,
    };
  });
};

const removeClipTransition = (clipId: string, edge: "in" | "out"): void => {
  setState((prev) => {
    if (!prev.project) return prev;
    return {
      ...prev,
      project: {
        ...prev.project,
        tracks: prev.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => {
            if (c.id !== clipId) return c;
            const key = edge === "in" ? "transitionIn" : "transitionOut";
            const newClip = { ...c, updatedAt: nowIso() };
            delete newClip[key];
            return newClip;
          }),
        })),
      },
      dirty: true,
    };
  });
};

const addTrack = (type: Cut.TrackType): string | undefined => {
  if (!state.project) {
    return undefined;
  }
  const now = nowIso();
  const trackId = genId();
  const sameType = state.project.tracks.filter((t) => t.type === type);
  const sortOrder =
    type === "video"
      ? Math.min(0, ...sameType.map((t) => t.sortOrder)) - 1
      : Math.max(0, ...sameType.map((t) => t.sortOrder)) + 1;
  const newTrack: Cut.Track = {
    id: trackId,
    type,
    name: `${type === "video" ? "Video" : "Audio"} ${sameType.length + 1}`,
    clips: [],
    muted: false,
    locked: false,
    hidden: false,
    height: type === "video" ? 60 : 50,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
  setState((prev) => {
    if (!prev.project) {
      return prev;
    }
    const tracks = [...prev.project.tracks, newTrack].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    return {
      ...prev,
      project: { ...prev.project, tracks },
      dirty: true,
    };
  });
  return trackId;
};

const deleteTrack = (trackId: string): void => {
  setState((prev) => {
    if (!prev.project) {
      return prev;
    }
    return {
      ...prev,
      project: {
        ...prev.project,
        tracks: prev.project.tracks.filter((t) => t.id !== trackId),
      },
      selectedTrackId:
        prev.selectedTrackId === trackId ? undefined : prev.selectedTrackId,
      selectedClipId: undefined,
      dirty: true,
    };
  });
};

const updateTrack = (trackId: string, patch: Partial<Cut.Track>): void => {
  setState((prev) => {
    if (!prev.project) {
      return prev;
    }
    return {
      ...prev,
      project: {
        ...prev.project,
        tracks: prev.project.tracks.map((t) =>
          t.id === trackId ? { ...t, ...patch } : t,
        ),
      },
      dirty: true,
    };
  });
};

const updateProject = (patch: Partial<Cut.CutProject>): void => {
  setState((prev) => {
    if (!prev.project) {
      return prev;
    }
    return {
      ...prev,
      project: { ...prev.project, ...patch },
      dirty: true,
    };
  });
};

const setSelection = (selection: {
  clipId?: string;
  trackId?: string;
}): void => {
  setState((prev) => ({
    ...prev,
    selectedClipId: selection.clipId,
    selectedTrackId: selection.trackId,
    selectedTransitionId: undefined,
    selectedTransitionClipId: undefined,
    selectedFilterClipId: undefined,
  }));
};

const setTransitionSelection = (
  transitionId?: string,
  clipId?: string,
): void => {
  setState((prev) => ({
    ...prev,
    selectedTransitionId: transitionId,
    selectedTransitionClipId: clipId,
  }));
};

const setZoom = (pixelsPerSecond: number): void => {
  setState((prev) => ({
    ...prev,
    pixelsPerSecond: Math.max(1, Math.min(500, pixelsPerSecond)),
  }));
};

const toggleSnap = (): void => {
  setState((prev) => ({ ...prev, snapEnabled: !prev.snapEnabled }));
};

const setCanvasSize = (size: { width: number; height: number }): void => {
  setState((prev) => {
    if (
      prev.canvasSize &&
      prev.canvasSize.width === size.width &&
      prev.canvasSize.height === size.height
    ) {
      return prev;
    }
    return { ...prev, canvasSize: size };
  });
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => state;

const editorStore = {
  getState: getSnapshot,
  loadProject,
  saveProject,
  addClip,
  addOverlayClip,
  addSubtitleClip,
  moveClip,
  trimClip,
  splitClip,
  cutLeft,
  cutRight,
  deleteClip,
  updateClip,
  updateClipMotion,
  toggleClipKeyframe,
  setClipKeyframeValue,
  addClipEffect,
  updateClipEffect,
  removeClipEffect,
  clearClipEffects,
  addFilterClip,
  updateFilterClip,
  removeFilterClip,
  moveFilterClip,
  trimFilterClip,
  setFilterClipSelection,
  addClipTransition,
  updateClipTransition,
  removeClipTransition,
  setTransitionSelection,
  addTrack,
  deleteTrack,
  updateTrack,
  updateProject,
  setSelection,
  setZoom,
  toggleSnap,
  setCanvasSize,
  reset,
  subscribe,
};

const useEditorStore = () => useSyncExternalStore(subscribe, getSnapshot);

export type { EditorState, AddClipInput, AddOverlayClipInput };
export { editorStore, useEditorStore };
