import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useActiveClip,
  useActiveVideoClips,
  useActiveAudioClips,
  useI18n,
  useSdk,
} from "hooks";
import {
  usePlaybackStore,
  playbackStore,
  editorStore,
  useEditorStore,
} from "reducers";
import {
  getTimelineEnd,
  hasOverlayPayload,
  readOverlayPayload,
  hasEffectPayload,
  readEffectPayload,
  buildClipEffectCss,
  buildFilterClipsCss,
  getActiveTransition,
  buildTransitionCss,
  resolveClipOpacity,
  resolveClipTransform,
} from "utils";
import {
  OverlayLayer,
  EffectOverlayLayer,
  VideoTransformLayer,
} from "./components";
import styles from "./PreviewVideo.less";

const PreviewVideo: React.FC = () => {
  const activeClip = useActiveClip();
  const activeVideoClips = useActiveVideoClips();
  const activeAudioClips = useActiveAudioClips();
  const { currentTime, isPlaying, rate } = usePlaybackStore();
  const { project } = useEditorStore();
  const sdk = useSdk();
  const { text } = useI18n();
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const lastPushedRef = useRef<number | undefined>(undefined);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [canvasSize, setCanvasSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const activeTransition = useMemo(() => {
    if (!project) return null;
    return getActiveTransition(project.tracks, currentTime);
  }, [project?.tracks, currentTime]);

  const hasVideo = activeVideoClips.length > 0;

  const clipEffectCssMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildClipEffectCss>>();
    for (const { clip } of activeVideoClips) {
      map.set(clip.id, buildClipEffectCss(clip));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVideoClips]);

  const filterClipsCss = useMemo(() => {
    return buildFilterClipsCss(project?.filterClips, currentTime);
  }, [project?.filterClips, currentTime]);

  const allOverlayClasses = useMemo(() => {
    const classes: string[] = [];
    for (const css of clipEffectCssMap.values()) {
      if (css) {
        classes.push(...css.overlayClasses);
      }
    }
    return classes;
  }, [clipEffectCssMap]);

  const transitionCss = useMemo(() => {
    if (!activeTransition?.transition) return null;
    return buildTransitionCss(
      activeTransition.transition,
      activeTransition.progress,
    );
  }, [activeTransition?.transition, activeTransition?.progress]);

  const canvasAspect = useMemo(() => {
    if (!project) return 16 / 9;
    const w = project.width || 1920;
    const h = project.height || 1080;
    return w / h;
  }, [project?.width, project?.height]);

  // Resize canvas to fit container while maintaining project aspect ratio
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      if (rect.width === 0 || rect.height === 0) return;
      const containerW = rect.width;
      const containerH = rect.height;
      let w: number;
      let h: number;
      if (containerW / containerH > canvasAspect) {
        h = containerH;
        w = h * canvasAspect;
      } else {
        w = containerW;
        h = w / canvasAspect;
      }
      const next = { width: Math.round(w), height: Math.round(h) };
      setCanvasSize(next);
      // 同步到 editorStore,供导出时做 canvas → project 坐标换算
      editorStore.setCanvasSize(next);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [canvasAspect]);

  // Source loading: set src for each active video clip
  useEffect(() => {
    for (const { clip } of activeVideoClips) {
      if (!clip.assetRef) continue;
      const video = videoRefs.current.get(clip.id);
      if (!video) continue;
      const url = sdk.asset.previewUrl(clip.assetRef.filePath);
      if (video.src !== url) {
        video.src = url;
        video.load();
      }
    }
    for (const { clip } of activeAudioClips) {
      if (!clip.assetRef) continue;
      const audio = audioRefs.current.get(clip.id);
      if (!audio) continue;
      const url = sdk.asset.previewUrl(clip.assetRef.filePath);
      if (audio.src !== url) {
        audio.src = url;
        audio.load();
      }
    }
    // Clean up stale video elements
    const activeVideoIds = new Set(activeVideoClips.map((v) => v.clip.id));
    for (const [clipId, video] of videoRefs.current) {
      if (!activeVideoIds.has(clipId)) {
        video.removeAttribute("src");
        video.load();
        videoRefs.current.delete(clipId);
      }
    }
    const activeAudioIds = new Set(activeAudioClips.map((v) => v.clip.id));
    for (const [clipId, audio] of audioRefs.current) {
      if (!activeAudioIds.has(clipId)) {
        audio.removeAttribute("src");
        audio.load();
        audioRefs.current.delete(clipId);
      }
    }
  }, [activeVideoClips, activeAudioClips, sdk]);

  // Seek sync: sync all active media elements to currentTime
  useEffect(() => {
    if (currentTime === lastPushedRef.current) return;
    const syncMedia = (media: HTMLMediaElement, clip: Cut.Clip) => {
      const expected = currentTime - clip.timelineIn + clip.sourceIn;
      const clamped = Math.max(
        clip.sourceIn,
        Math.min(expected, clip.sourceOut),
      );
      if (Math.abs(media.currentTime - clamped) > 0.05) {
        media.currentTime = clamped;
      }
    };
    for (const { clip } of activeVideoClips) {
      const video = videoRefs.current.get(clip.id);
      if (video) syncMedia(video, clip);
    }
    for (const { clip } of activeAudioClips) {
      const audio = audioRefs.current.get(clip.id);
      if (audio) syncMedia(audio, clip);
    }
  }, [currentTime, activeVideoClips, activeAudioClips]);

  // Mute/volume sync: React 的 <video muted> prop 在动态更新时不可靠,
  // 需要通过 ref 直接设置才能保证静音和音量即时生效。
  useEffect(() => {
    for (const { clip, track } of activeVideoClips) {
      const video = videoRefs.current.get(clip.id);
      if (!video) continue;
      video.muted = track.muted;
      const v = Math.max(0, Math.min(1, clip.volume ?? 1));
      if (video.volume !== v) {
        video.volume = v;
      }
    }
    for (const { clip, track } of activeAudioClips) {
      const audio = audioRefs.current.get(clip.id);
      if (!audio) continue;
      audio.muted = track.muted;
      const v = Math.max(0, Math.min(1, clip.volume ?? 1));
      if (audio.volume !== v) {
        audio.volume = v;
      }
    }
  }, [activeVideoClips, activeAudioClips]);

  // Playback loop: prefer a real media element as master clock.
  // When only image clips are active, fall back to store tick.
  useEffect(() => {
    if (!isPlaying) {
      for (const video of videoRefs.current.values()) {
        video.pause();
      }
      for (const audio of audioRefs.current.values()) {
        audio.pause();
      }
      lastPushedRef.current = undefined;
      return;
    }

    let masterMedia: HTMLMediaElement | undefined;
    let masterClip: Cut.Clip | undefined;

    for (const { clip } of activeVideoClips) {
      const video = videoRefs.current.get(clip.id);
      if (video) {
        video.playbackRate = (clip.speed || 1) * rate;
        video.play().catch(() => {});
        if (!masterMedia && clip.type === "video") {
          masterMedia = video;
          masterClip = clip;
        }
      }
    }
    for (const { clip } of activeAudioClips) {
      const audio = audioRefs.current.get(clip.id);
      if (audio) {
        audio.playbackRate = (clip.speed || 1) * rate;
        audio.play().catch(() => {});
        if (!masterMedia) {
          masterMedia = audio;
          masterClip = clip;
        }
      }
    }

    let cancelled = false;
    let lastTime = performance.now();

    const loop = (time: number) => {
      if (cancelled) return;
      const currentProject = editorStore.getState().project;
      const tracks = currentProject?.tracks ?? [];
      const timelineEnd = currentProject ? getTimelineEnd(tracks) : 0;
      if (masterMedia && masterClip) {
        const timelineTime =
          masterMedia.currentTime - masterClip.sourceIn + masterClip.timelineIn;
        lastPushedRef.current = timelineTime;
        playbackStore.seek(timelineTime);
        if (timelineTime >= timelineEnd - 0.01) {
          playbackStore.pause();
          playbackStore.seek(timelineEnd);
          return;
        }
      } else {
        const delta = (time - lastTime) / 1000;
        lastTime = time;
        if (delta > 0 && delta < 1) {
          playbackStore.tick(delta);
        }
        if (playbackStore.getState().currentTime >= timelineEnd - 0.01) {
          playbackStore.pause();
          playbackStore.seek(timelineEnd);
          return;
        }
      }

      if (!playbackStore.getState().isPlaying) {
        return;
      }
      if (masterMedia && masterClip && masterMedia.ended) {
        playbackStore.pause();
        playbackStore.seek(timelineEnd);
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = undefined;
      }
      for (const video of videoRefs.current.values()) {
        video.pause();
      }
      for (const audio of audioRefs.current.values()) {
        audio.pause();
      }
      lastPushedRef.current = undefined;
    };
  }, [isPlaying, activeVideoClips, activeAudioClips, rate]);

  const getVideoLayerStyle = useCallback(
    (clip: Cut.Clip): React.CSSProperties => {
      const t = resolveClipTransform(clip, currentTime);
      const sx = t.scaleX ?? t.scale;
      const sy = t.scaleY ?? t.scale;
      const effectCss = clipEffectCssMap.get(clip.id);
      const style: React.CSSProperties = {
        transform: `translate(${t.x}px, ${t.y}px) scale(${sx}, ${sy}) rotate(${t.rotation}deg)`,
        opacity: resolveClipOpacity(clip, currentTime),
      };
      if (activeTransition && transitionCss) {
        if (clip.id === activeTransition.outgoingClip?.id) {
          Object.assign(style, transitionCss.outgoingStyle);
        } else if (clip.id === activeTransition.incomingClip?.id) {
          Object.assign(style, transitionCss.incomingStyle);
        }
      }
      // 滤镜轨道按时间生效,作用于所有视频图层;特效仍按片段叠加。
      const filterParts: string[] = [];
      if (filterClipsCss?.filter) filterParts.push(filterClipsCss.filter);
      if (effectCss?.filter) filterParts.push(effectCss.filter);
      if (filterParts.length > 0) {
        style.filter = filterParts.join(" ");
      }
      if (effectCss) {
        if (effectCss.animations.length > 0) {
          style.animation = effectCss.animations.join(", ");
        }
      }
      return style;
    },
    [
      clipEffectCssMap,
      filterClipsCss,
      activeTransition,
      transitionCss,
      currentTime,
    ],
  );

  const setVideoRef = useCallback(
    (clipId: string) => (el: HTMLVideoElement | null) => {
      if (el) {
        videoRefs.current.set(clipId, el);
      } else {
        videoRefs.current.delete(clipId);
      }
    },
    [],
  );

  const setAudioRef = useCallback(
    (clipId: string) => (el: HTMLAudioElement | null) => {
      if (el) {
        audioRefs.current.set(clipId, el);
      } else {
        audioRefs.current.delete(clipId);
      }
    },
    [],
  );

  const computeDropPosition = useCallback(
    (
      clientX: number,
      clientY: number,
    ): { x: number; y: number } | undefined => {
      const el = canvasRef.current;
      if (!el) return undefined;
      const rect = el.getBoundingClientRect();
      return {
        x: clientX - (rect.left + rect.width / 2),
        y: clientY - (rect.top + rect.height / 2),
      };
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!hasOverlayPayload(e) && !hasEffectPayload(e)) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      if (!isDragOver) setIsDragOver(true);
    },
    [isDragOver],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!hasOverlayPayload(e) && !hasEffectPayload(e)) {
        return;
      }
      e.preventDefault();
      setIsDragOver(false);

      if (hasEffectPayload(e)) {
        const effectPayload = readEffectPayload(e);
        if (!effectPayload) return;
        const clip = editorStore.getState().project ? activeClip : undefined;
        if (!clip) {
          sdk.ui.toast.warn(text("cut.effects.noActiveClip"));
          return;
        }
        if (clip.type === "audio") {
          sdk.ui.toast.warn(text("cut.effects.audioNotSupported"));
          return;
        }
        const eid = editorStore.addClipEffect(clip.id, {
          type: effectPayload.effectTypeId,
        });
        if (eid) {
          sdk.ui.toast.success(text("cut.effects.added"));
        }
        return;
      }

      const payload = readOverlayPayload(e);
      if (!payload) return;
      const pos = computeDropPosition(e.clientX, e.clientY);
      const transform = pos ? { x: pos.x, y: pos.y } : undefined;
      if (payload.kind === "text") {
        editorStore.addOverlayClip({
          type: "text",
          text: payload.preset,
          transform,
        });
      } else if (payload.kind === "subtitle") {
        editorStore.addOverlayClip({
          type: "subtitle",
          text: payload.preset,
          transform,
        });
      } else {
        editorStore.addOverlayClip({
          type: "sticker",
          sticker: payload.preset,
          transform,
        });
      }
      const currentProject = editorStore.getState().project;
      if (currentProject) {
        playbackStore.setDuration(getTimelineEnd(currentProject.tracks));
      }
      sdk.ui.toast.success(
        text(
          payload.kind === "text"
            ? "cut.text.added"
            : payload.kind === "subtitle"
              ? "cut.subtitle.added"
              : "cut.stickers.added",
        ),
      );
    },
    [computeDropPosition, sdk, text, activeClip],
  );

  return (
    <div
      ref={containerRef}
      className={`${styles.container}${isDragOver ? ` ${styles.dragOver}` : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        ref={canvasRef}
        className={styles.canvas}
        style={{
          width: canvasSize?.width,
          height: canvasSize?.height,
          backgroundColor: project?.backgroundColor || "#000",
        }}
      >
        {activeVideoClips
          .slice()
          .reverse()
          .map(({ clip }) => {
            if (clip.type === "image") {
              return (
                <img
                  key={clip.id}
                  src={
                    clip.assetRef
                      ? sdk.asset.previewUrl(clip.assetRef.filePath)
                      : undefined
                  }
                  className={styles.videoLayer}
                  style={getVideoLayerStyle(clip)}
                  alt=""
                />
              );
            }
            return (
              <video
                key={clip.id}
                ref={setVideoRef(clip.id)}
                className={styles.videoLayer}
                style={getVideoLayerStyle(clip)}
                playsInline
              />
            );
          })}
        {activeAudioClips.map(({ clip }) => (
          <audio key={clip.id} ref={setAudioRef(clip.id)} />
        ))}
        <VideoTransformLayer />
        <EffectOverlayLayer overlayClasses={allOverlayClasses} />
        <OverlayLayer />
      </div>
      {!hasVideo && (
        <div className={styles.placeholder}>
          {text("cut.preview.placeholder")}
        </div>
      )}
      {isDragOver && (
        <div className={styles.dropHint}>{text("cut.preview.dropHint")}</div>
      )}
    </div>
  );
};

export default PreviewVideo;
