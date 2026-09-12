import React, { useCallback, useMemo, useRef } from "react";
import { editorStore, useEditorStore, usePlaybackStore } from "reducers";
import { resolveClipTransform, timelineOut } from "utils";
import styles from "./VideoTransformLayer.less";

const normalizeAngle = (deg: number): number => ((deg % 360) + 360) % 360;

type Axis = "x" | "y";

const VideoTransformLayer: React.FC = () => {
  const { project, selectedClipId } = useEditorStore();
  const { currentTime } = usePlaybackStore();
  const layerRef = useRef<HTMLDivElement>(null);

  // 当前时间活跃的可视片段，按 sortOrder 升序后反转：
  // 时间轴上排在最上面的轨道（sortOrder 最小）在 DOM 中最后渲染，视觉层级最高。
  const activeVideoClips = useMemo(() => {
    if (!project) return [];
    const videoTracks = project.tracks
      .filter((t) => t.type === "video" && !t.hidden)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const result: Cut.Clip[] = [];
    for (const track of videoTracks) {
      for (const clip of track.clips) {
        if (
          (clip.type === "video" || clip.type === "image") &&
          clip.assetRef &&
          currentTime >= clip.timelineIn &&
          currentTime < timelineOut(clip)
        ) {
          result.push(clip);
        }
      }
    }
    return result.reverse();
  }, [project, currentTime]);

  const getCenter = useCallback(
    (clip: Cut.Clip) => {
      const layer = layerRef.current;
      if (!layer) return null;
      const rect = layer.getBoundingClientRect();
      const transform = resolveClipTransform(clip, currentTime);
      return {
        x: rect.left + rect.width / 2 + transform.x,
        y: rect.top + rect.height / 2 + transform.y,
      };
    },
    [currentTime],
  );

  const handleSelect = useCallback((clipId: string, trackId: string) => {
    editorStore.setSelection({ clipId, trackId });
  }, []);

  const handleMoveStart = useCallback(
    (e: React.PointerEvent, clip: Cut.Clip) => {
      e.stopPropagation();
      editorStore.setSelection({ clipId: clip.id, trackId: clip.trackId });
      const startX = e.clientX;
      const startY = e.clientY;
      const transform = resolveClipTransform(clip, currentTime);
      const originX = transform.x;
      const originY = transform.y;
      const clipId = clip.id;
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        editorStore.updateClipMotion(
          clipId,
          {
            x: originX + dx,
            y: originY + dy,
          },
          currentTime,
        );
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [currentTime],
  );

  const handleRotateStart = useCallback(
    (e: React.PointerEvent, clip: Cut.Clip) => {
      e.stopPropagation();
      e.preventDefault();
      editorStore.setSelection({ clipId: clip.id, trackId: clip.trackId });
      const center = getCenter(clip);
      if (!center) return;
      const startAngle =
        (Math.atan2(e.clientY - center.y, e.clientX - center.x) * 180) /
        Math.PI;
      const transform = resolveClipTransform(clip, currentTime);
      const originRotation = transform.rotation;
      const clipId = clip.id;
      const move = (ev: PointerEvent) => {
        const angle =
          (Math.atan2(ev.clientY - center.y, ev.clientX - center.x) * 180) /
          Math.PI;
        const next = normalizeAngle(originRotation + (angle - startAngle));
        editorStore.updateClipMotion(clipId, { rotation: next }, currentTime);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [currentTime, getCenter],
  );

  // 等比缩放（角点手柄）：更新 scale 并清除 scaleX/scaleY，恢复等比
  const handleUniformScaleStart = useCallback(
    (e: React.PointerEvent, clip: Cut.Clip) => {
      e.stopPropagation();
      e.preventDefault();
      editorStore.setSelection({ clipId: clip.id, trackId: clip.trackId });
      const center = getCenter(clip);
      if (!center) return;
      const startDist = Math.hypot(e.clientX - center.x, e.clientY - center.y);
      if (startDist < 1) return;
      const transform = resolveClipTransform(clip, currentTime);
      const originScale = transform.scale;
      const clipId = clip.id;
      const move = (ev: PointerEvent) => {
        const dist = Math.hypot(ev.clientX - center.x, ev.clientY - center.y);
        const ratio = dist / startDist;
        const next = Math.max(0.1, Math.min(10, originScale * ratio));
        editorStore.updateClipMotion(clipId, { scale: next }, currentTime);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [currentTime, getCenter],
  );

  // 单轴缩放（边缘手柄）：将鼠标位移投影到元素本地坐标系（考虑旋转），
  // 沿指定轴计算缩放比例。axis="x" 更新 scaleX，axis="y" 更新 scaleY。
  const handleAxisScaleStart = useCallback(
    (e: React.PointerEvent, clip: Cut.Clip, axis: Axis) => {
      e.stopPropagation();
      e.preventDefault();
      editorStore.setSelection({ clipId: clip.id, trackId: clip.trackId });
      const center = getCenter(clip);
      if (!center) return;
      const transform = resolveClipTransform(clip, currentTime);
      const rad = (transform.rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const project = (cx: number, cy: number) => {
        const dx = cx - center.x;
        const dy = cy - center.y;
        return axis === "x" ? dx * cos + dy * sin : -dx * sin + dy * cos;
      };
      const startLocal = project(e.clientX, e.clientY);
      if (Math.abs(startLocal) < 1) return;
      const originScale =
        axis === "x"
          ? (transform.scaleX ?? transform.scale)
          : (transform.scaleY ?? transform.scale);
      const clipId = clip.id;
      const move = (ev: PointerEvent) => {
        const currentLocal = project(ev.clientX, ev.clientY);
        const ratio = currentLocal / startLocal;
        const next = Math.max(0.1, Math.min(10, originScale * ratio));
        editorStore.updateClipMotion(
          clipId,
          axis === "x" ? { scaleX: next } : { scaleY: next },
          currentTime,
        );
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [currentTime, getCenter],
  );

  if (activeVideoClips.length === 0) return null;

  return (
    <div className={styles.layer} ref={layerRef}>
      {activeVideoClips.map((clip) => {
        const t = resolveClipTransform(clip, currentTime);
        const sx = t.scaleX ?? t.scale;
        const sy = t.scaleY ?? t.scale;
        const isSelected = clip.id === selectedClipId;
        const wrapperStyle: React.CSSProperties = {
          transform: `translate(${t.x}px, ${t.y}px) scale(${sx}, ${sy}) rotate(${t.rotation}deg)`,
        };
        return (
          <div
            key={clip.id}
            className={`${styles.item}${isSelected ? ` ${styles.selected}` : ""}`}
            style={wrapperStyle}
            onPointerDown={(e) => handleMoveStart(e, clip)}
            onClick={() => handleSelect(clip.id, clip.trackId)}
          >
            {isSelected && (
              <div className={styles.handles}>
                <div
                  className={styles.rotateHandle}
                  onPointerDown={(e) => handleRotateStart(e, clip)}
                />
                <div className={styles.rotateLine} />
                <div
                  className={`${styles.scaleHandle} ${styles.tl}`}
                  onPointerDown={(e) => handleUniformScaleStart(e, clip)}
                />
                <div
                  className={`${styles.scaleHandle} ${styles.tr}`}
                  onPointerDown={(e) => handleUniformScaleStart(e, clip)}
                />
                <div
                  className={`${styles.scaleHandle} ${styles.bl}`}
                  onPointerDown={(e) => handleUniformScaleStart(e, clip)}
                />
                <div
                  className={`${styles.scaleHandle} ${styles.br}`}
                  onPointerDown={(e) => handleUniformScaleStart(e, clip)}
                />
                <div
                  className={`${styles.edgeHandle} ${styles.top}`}
                  onPointerDown={(e) => handleAxisScaleStart(e, clip, "y")}
                />
                <div
                  className={`${styles.edgeHandle} ${styles.bottom}`}
                  onPointerDown={(e) => handleAxisScaleStart(e, clip, "y")}
                />
                <div
                  className={`${styles.edgeHandle} ${styles.left}`}
                  onPointerDown={(e) => handleAxisScaleStart(e, clip, "x")}
                />
                <div
                  className={`${styles.edgeHandle} ${styles.right}`}
                  onPointerDown={(e) => handleAxisScaleStart(e, clip, "x")}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default VideoTransformLayer;
