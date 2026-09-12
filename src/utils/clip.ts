export const timelineDuration = (clip: Cut.Clip): number => {
  if (clip.speed <= 0) {
    return 0;
  }
  return (clip.sourceOut - clip.sourceIn) / clip.speed;
};

export const timelineOut = (clip: Cut.Clip): number => {
  return clip.timelineIn + timelineDuration(clip);
};

export const getTimelineEnd = (tracks: Cut.Track[]): number => {
  let end = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      const out = timelineOut(clip);
      if (out > end) {
        end = out;
      }
    }
  }
  return end;
};

// 在 afterTime 之后寻找下一个 video 片段的开始时间（跨所有 video 轨）。
// 用于切片结束后跳到下一个真实存在的片段，避免落入空隙导致播放提前结束。
export const getNextClipStart = (
  tracks: Cut.Track[],
  afterTime: number,
): number | undefined => {
  let nextStart: number | undefined = undefined;
  for (const track of tracks) {
    if (track.type !== "video" || track.hidden) continue;
    for (const clip of track.clips) {
      if (clip.type !== "video") continue;
      if (clip.timelineIn > afterTime) {
        if (nextStart === undefined || clip.timelineIn < nextStart) {
          nextStart = clip.timelineIn;
        }
      }
    }
  }
  return nextStart;
};

export const getActiveClip = (
  tracks: Cut.Track[],
  currentTime: number,
): Cut.Clip | undefined => {
  // video 轨按 sortOrder 升序，最上层（sortOrder 最小）优先
  const videoTracks = tracks
    .filter((t) => t.type === "video" && !t.hidden)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  for (const track of videoTracks) {
    const clip = track.clips.find((c) => {
      return currentTime >= c.timelineIn && currentTime < timelineOut(c);
    });
    if (clip) {
      return clip;
    }
  }
  return undefined;
};

// 返回当前时间所有活跃的 video/image 片段，按轨道 sortOrder 升序（底层在前，顶层在后）
export const getActiveVideoClips = (
  tracks: Cut.Track[],
  currentTime: number,
): Array<{ clip: Cut.Clip; track: Cut.Track }> => {
  const videoTracks = tracks
    .filter((t) => t.type === "video" && !t.hidden)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const result: Array<{ clip: Cut.Clip; track: Cut.Track }> = [];
  for (const track of videoTracks) {
    for (const clip of track.clips) {
      if (
        (clip.type === "video" || clip.type === "image") &&
        clip.assetRef &&
        currentTime >= clip.timelineIn &&
        currentTime < timelineOut(clip)
      ) {
        result.push({ clip, track });
      }
    }
  }
  return result;
};

// 返回当前时间所有活跃的 audio 片段
export const getActiveAudioClips = (
  tracks: Cut.Track[],
  currentTime: number,
): Array<{ clip: Cut.Clip; track: Cut.Track }> => {
  const audioTracks = tracks.filter((t) => t.type === "audio" && !t.hidden);
  const result: Array<{ clip: Cut.Clip; track: Cut.Track }> = [];
  for (const track of audioTracks) {
    for (const clip of track.clips) {
      if (
        clip.type === "audio" &&
        clip.assetRef &&
        currentTime >= clip.timelineIn &&
        currentTime < timelineOut(clip)
      ) {
        result.push({ clip, track });
      }
    }
  }
  return result;
};

// 返回当前时间所有活跃的 text/sticker/subtitle 叠加片段，按轨道 sortOrder 升序
export const getActiveOverlays = (
  tracks: Cut.Track[],
  currentTime: number,
): Cut.Clip[] => {
  const videoTracks = tracks
    .filter((t) => t.type === "video" && !t.hidden)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const result: Cut.Clip[] = [];
  for (const track of videoTracks) {
    for (const clip of track.clips) {
      if (
        (clip.type === "text" ||
          clip.type === "sticker" ||
          clip.type === "subtitle") &&
        currentTime >= clip.timelineIn &&
        currentTime < timelineOut(clip)
      ) {
        result.push(clip);
      }
    }
  }
  return result;
};

// 返回所有字幕片段，按 timelineIn 升序
export const getSubtitles = (tracks: Cut.Track[]): Cut.Clip[] => {
  const result: Cut.Clip[] = [];
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.type === "subtitle") {
        result.push(clip);
      }
    }
  }
  return result.sort((a, b) => a.timelineIn - b.timelineIn);
};

export const findClip = (
  tracks: Cut.Track[],
  clipId: string,
): { clip: Cut.Clip; track: Cut.Track } | undefined => {
  for (const track of tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) {
      return { clip, track };
    }
  }
  return undefined;
};

export const findTrack = (
  tracks: Cut.Track[],
  trackId: string,
): Cut.Track | undefined => {
  return tracks.find((t) => t.id === trackId);
};

export const getAdjacentClips = (
  tracks: Cut.Track[],
  clipId: string,
): { prev?: Cut.Clip; next?: Cut.Clip } => {
  const found = findClip(tracks, clipId);
  if (!found) return {};
  const { clip, track } = found;
  const sortedClips = [...track.clips].sort(
    (a, b) => a.timelineIn - b.timelineIn,
  );
  const idx = sortedClips.findIndex((c) => c.id === clipId);
  return {
    prev: idx > 0 ? sortedClips[idx - 1] : undefined,
    next: idx < sortedClips.length - 1 ? sortedClips[idx + 1] : undefined,
  };
};

export const getActiveTransition = (
  tracks: Cut.Track[],
  currentTime: number,
): {
  outgoingClip?: Cut.Clip;
  incomingClip?: Cut.Clip;
  transition?: Cut.TransitionConfig;
  progress: number;
} | null => {
  const videoTracks = tracks
    .filter((t) => t.type === "video" && !t.hidden)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  for (const track of videoTracks) {
    const sortedClips = [...track.clips].sort(
      (a, b) => a.timelineIn - b.timelineIn,
    );
    for (let i = 0; i < sortedClips.length - 1; i++) {
      const current = sortedClips[i];
      const next = sortedClips[i + 1];
      const currentOut = timelineOut(current);
      const transition = current.transitionOut;
      if (!transition) continue;
      // 转场要求相邻 clip 紧贴（剪映语义），偏差 > 10ms 视为有 gap，转场不生效
      if (Math.abs(next.timelineIn - currentOut) > 0.01) continue;
      // 转场吃掉两边各 duration：区间为 [currentOut - duration, currentOut]
      // 期间 outgoing 显示最后 duration 段、incoming 显示最前 duration 段
      const transitionStart = currentOut - transition.duration;
      const transitionEnd = currentOut;
      if (currentTime >= transitionStart && currentTime < transitionEnd) {
        const progress = (currentTime - transitionStart) / transition.duration;
        return {
          outgoingClip: current,
          incomingClip: next,
          transition,
          progress: Math.max(0, Math.min(1, progress)),
        };
      }
    }
  }
  return null;
};

const SNAP_THRESHOLD = 0.2;

export const snap = (
  time: number,
  snapPoints: number[],
  threshold: number = SNAP_THRESHOLD,
): number => {
  let snapped = time;
  let minDelta = threshold;
  for (const point of snapPoints) {
    const delta = Math.abs(time - point);
    if (delta < minDelta) {
      minDelta = delta;
      snapped = point;
    }
  }
  return snapped;
};

export const collectSnapPoints = (
  tracks: Cut.Track[],
  excludeClipId?: string,
  playhead?: number,
): number[] => {
  const points: number[] = [0];
  if (playhead !== undefined) {
    points.push(playhead);
  }
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.id === excludeClipId) {
        continue;
      }
      points.push(clip.timelineIn);
      points.push(timelineOut(clip));
    }
  }
  return points;
};
