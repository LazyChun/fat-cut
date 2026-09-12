import React, { useCallback, useMemo, useRef } from "react";
import { useEditorStore, usePlaybackStore, editorStore } from "reducers";
import { getActiveOverlays, resolveClipOpacity, resolveClipTransform } from "utils";
import styles from "./OverlayLayer.less";

const buildTextStyle = (tc: Cut.TextConfig): React.CSSProperties => {
  const style: React.CSSProperties = {
    fontFamily: tc.fontFamily,
    fontSize: tc.fontSize,
    color: tc.color,
    fontWeight: tc.bold ? 700 : 400,
    fontStyle: tc.italic ? "italic" : "normal",
    textAlign: tc.align,
    whiteSpace: "pre-wrap",
    lineHeight: 1.2,
  };
  if (tc.strokeWidth && tc.strokeWidth > 0) {
    style.WebkitTextStroke = `${tc.strokeWidth}px ${tc.strokeColor ?? "#000000"}`;
  }
  if (tc.shadow) {
    style.textShadow = "0 2px 6px rgba(0,0,0,0.65)";
  }
  if (tc.backgroundColor) {
    style.background = tc.backgroundColor;
    style.padding = "4px 10px";
    style.borderRadius = 4;
  }
  return style;
};

const normalizeAngle = (deg: number): number => ((deg % 360) + 360) % 360;

const OverlayLayer: React.FC = () => {
  const { project, selectedClipId } = useEditorStore();
  const { currentTime } = usePlaybackStore();
  const layerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    clipId: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const overlays = useMemo(() => {
    if (!project) return [];
    return getActiveOverlays(project.tracks, currentTime);
  }, [project, currentTime]);

  const getOverlayCenter = useCallback((clip: Cut.Clip) => {
    const layer = layerRef.current;
    if (!layer) return null;
    const rect = layer.getBoundingClientRect();
    const transform = resolveClipTransform(clip, currentTime);
    return {
      x: rect.left + rect.width / 2 + transform.x,
      y: rect.top + rect.height / 2 + transform.y,
    };
  }, [currentTime]);

  const handleSelect = useCallback((clipId: string, trackId: string) => {
    editorStore.setSelection({ clipId, trackId });
  }, []);

  const handleMoveStart = useCallback(
    (e: React.PointerEvent, clip: Cut.Clip) => {
      e.stopPropagation();
      editorStore.setSelection({ clipId: clip.id, trackId: clip.trackId });
      dragRef.current = {
        clipId: clip.id,
        startX: e.clientX,
        startY: e.clientY,
        originX: resolveClipTransform(clip, currentTime).x,
        originY: resolveClipTransform(clip, currentTime).y,
      };
      const move = (ev: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const dx = ev.clientX - drag.startX;
        const dy = ev.clientY - drag.startY;
        editorStore.updateClipMotion(
          drag.clipId,
          {
            x: drag.originX + dx,
            y: drag.originY + dy,
          },
          currentTime,
        );
      };
      const up = () => {
        dragRef.current = null;
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
      const center = getOverlayCenter(clip);
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
    [currentTime, getOverlayCenter],
  );

  const handleScaleStart = useCallback(
    (e: React.PointerEvent, clip: Cut.Clip) => {
      e.stopPropagation();
      e.preventDefault();
      editorStore.setSelection({ clipId: clip.id, trackId: clip.trackId });
      const center = getOverlayCenter(clip);
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
    [currentTime, getOverlayCenter],
  );

  if (!overlays.length) return null;

  return (
    <div className={styles.layer} ref={layerRef}>
      {overlays.map((clip) => {
        const t = resolveClipTransform(clip, currentTime);
        const sx = t.scaleX ?? t.scale;
        const sy = t.scaleY ?? t.scale;
        const wrapperStyle: React.CSSProperties = {
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) translate(${t.x}px, ${t.y}px) scale(${sx}, ${sy}) rotate(${t.rotation}deg)`,
          opacity: resolveClipOpacity(clip, currentTime),
        };
        const isSelected = clip.id === selectedClipId;

        let content: React.ReactNode = null;
        if ((clip.type === "text" || clip.type === "subtitle") && clip.text) {
          content = (
            <div style={buildTextStyle(clip.text)}>{clip.text.content}</div>
          );
        } else if (clip.type === "sticker" && clip.sticker) {
          const sc = clip.sticker;
          content =
            sc.stickerType === "emoji" ? (
              <span
                style={{
                  fontSize: sc.size,
                  lineHeight: 1,
                  display: "inline-block",
                }}
              >
                {sc.content}
              </span>
            ) : (
              <img
                src={sc.filePath}
                alt=""
                style={{ width: sc.size, height: sc.size }}
                draggable={false}
              />
            );
        } else {
          return null;
        }

        return (
          <div
            key={clip.id}
            className={`${styles.item}${isSelected ? ` ${styles.selected}` : ""}`}
            style={wrapperStyle}
            onPointerDown={(e) => handleMoveStart(e, clip)}
            onClick={() => handleSelect(clip.id, clip.trackId)}
          >
            {content}
            {isSelected && (
              <div className={styles.handles}>
                <div
                  className={styles.rotateHandle}
                  onPointerDown={(e) => handleRotateStart(e, clip)}
                />
                <div className={styles.rotateLine} />
                <div
                  className={`${styles.scaleHandle} ${styles.tl}`}
                  onPointerDown={(e) => handleScaleStart(e, clip)}
                />
                <div
                  className={`${styles.scaleHandle} ${styles.tr}`}
                  onPointerDown={(e) => handleScaleStart(e, clip)}
                />
                <div
                  className={`${styles.scaleHandle} ${styles.bl}`}
                  onPointerDown={(e) => handleScaleStart(e, clip)}
                />
                <div
                  className={`${styles.scaleHandle} ${styles.br}`}
                  onPointerDown={(e) => handleScaleStart(e, clip)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default OverlayLayer;
