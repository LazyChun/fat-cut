# fat-cut 视频编辑插件 第三阶段续建计划（WP3 收尾 + WP4-WP6）

## Context

本计划是 [fat-cut-editor-phase2-plan.md](./fat-cut-editor-phase2-plan.md) 的续篇。phase 2 计划的 **WP0/WP1/WP2 已完成**，**WP3 的所有叶子组件已创建**（Clip/Track/TimelineTracks/TimelineRuler/Playhead/TimelineToolbar），但 **WP3 的协调器 `TimelinePanel.tsx` 与 `TimelinePanel/components/index.ts` barrel 尚未完成**，导致时间线骨架未通。WP4/WP5/WP6 整体未启动。

本阶段目标：**收尾 WP3 → 完成 WP4-WP6**，达成剪映式核心三件套全链路可用（素材 → 添加 → 时间线编辑 → 预览 → 属性 → 保存）。

**核心原则不变**：绝不修改原始素材，只编辑剪辑配置（中间层 JSON）；ffmpeg 通过继承宿主 `FFMPEG_HOME` 调用；遵循 AGENTS.md 组件规则（子组件 `ParentComponent/components/ChildComponent/ChildComponent.tsx+.less` + `index.ts` barrel）。

## Current State Analysis（基于实际代码核对）

### 已完成（勿重做）

**WP0（TS 错修复）**：`hooks/index.ts` 别名重导出 `useI18n`；`cut.d.ts` Track 接口补 `createdAt/updatedAt`。

**WP1（工程管理壳）**：`ProjectToolbar.tsx`（顶部工具条 + 工程下拉切换/删除 + 新建/保存按钮，dirty 高亮）；`ProjectEditModal.tsx`（FatForm 创建/编辑）；`WorkPage.tsx` 接入顶部工具条 + 无工程空状态。

**WP2（素材 Tab）**：`FunctionArea.tsx` antd Tabs（7 tab，仅"素材"实装，其余 `PlaceholderPanel`）；`MaterialsPanel.tsx` + `CategoryFilter` + `AssetList` + `AssetCard`，对接 `sdk.asset.list/listCategories/previewUrl`，添加流程：`probeAsset` → 构造 `AssetRef` → `editorStore.addClip({type:"video", assetRef})` → 同步 `playbackStore.setDuration(getTimelineEnd)`。

**WP3 叶子组件（已创建，待协调器接线）**：
- `TimelinePanel/components/TimelineToolbar/TimelineToolbar.tsx` — props: `{snapEnabled, onZoomIn, onZoomOut, onFit}`；内部直调 `editorStore.toggleSnap()` 和 `editorStore.addTrack()`
- `TimelinePanel/components/TimelineRuler/TimelineRuler.tsx` — props: `{duration, pixelsPerSecond, labelWidth, onSeek}`；自适应刻度（1/5/10/30/60s）；mousedown 拖动 seek（已修复 React event pooling）
- `TimelinePanel/components/TimelineTracks/TimelineTracks.tsx` — props: `{tracks, pixelsPerSecond, labelWidth, selectedClipId, contentWidth, onSelectClip, onSelectTrack}`；按 `sortOrder` 渲染 Track 列表
- `TimelinePanel/components/TimelineTracks/components/Track/Track.tsx` — props: `{track, pixelsPerSecond, labelWidth, selectedClipId, contentWidth, onSelectClip, onSelectTrack}`；左侧 sticky 标签 + 右侧 lane（宽 = contentWidth）；hover 显示 mute/eye/lock/trash 按钮（直调 `editorStore.updateTrack/deleteTrack`）
- `TimelinePanel/components/TimelineTracks/components/Track/components/Clip/Clip.tsx` — 绝对定位片段，type 色块，左右裁剪手柄（**WP3 仅渲染不交互**，WP5 实装）
- `TimelinePanel/components/Playhead/Playhead.tsx` — props: `{currentTime, pixelsPerSecond, labelWidth, onSeek}`；`left = labelWidth + currentTime * pps`；mousedown 拖动 seek（用 `parentElement` 算 rect）

**关键 store 接口（已确认）**：
- `useEditorStore()` → `{project, loadingStatus, selectedClipId, selectedTrackId, pixelsPerSecond, snapEnabled, dirty}`；方法：`setZoom(pps)`/`setSelection({clipId?,trackId?})`/`addTrack`/`toggleSnap`/...
- `usePlaybackStore()` → `{isPlaying, currentTime, duration, rate}`；方法：`seek(t)`/`setDuration(d)`/`play()`/`pause()`/`tick(dt)`/`setRate(r)`
- `getTimelineEnd(tracks)` from `utils/clip` — 计算时间线总时长

### 待建（本阶段交付）

1. **WP3 收尾**：`TimelinePanel.tsx` 协调器 + `components/index.ts` barrel
2. **WP4**：`PreviewWindow` 视频预览 + 控制条
3. **WP5**：时间线交互（@dnd-kit 拖拽 + 自实现 pointer 裁剪）
4. **WP6**：`OptionPanel` 属性编辑（Clip/Track/Project Properties）

## Proposed Changes

按 4 个工作包推进，每包完成后 `npx tsc --noEmit` 验证 0 错，并用 `npm run dev` 配合宿主 `python src/main.py` 联调（遵循"尽量少用 npm run build"）。

---

### WP3-收尾 — TimelinePanel 协调器 + barrel

#### 新建文件

**`d:\works\myworks\fat-cut\src\pages\WorkPage\components\Bottom\components\TimelinePanel\components\index.ts`** — barrel：
```ts
import TimelineToolbar from "./TimelineToolbar/TimelineToolbar";
import TimelineRuler from "./TimelineRuler/TimelineRuler";
import TimelineTracks from "./TimelineTracks/TimelineTracks";
import Playhead from "./Playhead/Playhead";

export { TimelineToolbar, TimelineRuler, TimelineTracks, Playhead };
```

#### 修改文件

**`d:\works\myworks\fat-cut\src\pages\WorkPage\components\Bottom\components\TimelinePanel\TimelinePanel.tsx`** — 协调器：
- 订阅 `useEditorStore()` → `{project, pixelsPerSecond, snapEnabled, selectedClipId}`；`usePlaybackStore()` → `{currentTime, duration}`；`useI18n()`
- 局部常量：`LABEL_WIDTH = 120`
- `containerRef = useRef<HTMLDivElement>(null)` 用于 fit 计算
- `useEffect([project?.id, project?.tracks])`：若 `project` 存在 → `playbackStore.setDuration(getTimelineEnd(project.tracks))`；无 project 不动
- 计算：`timelineDuration = duration`（来自 playbackStore，已同步）；`contentWidth = timelineDuration * pixelsPerSecond`；`trackAreaWidth = LABEL_WIDTH + contentWidth`
- Handlers（useCallback）：
  - `handleZoomIn` → `editorStore.setZoom(pixelsPerSecond * 1.2)`
  - `handleZoomOut` → `editorStore.setZoom(pixelsPerSecond / 1.2)`
  - `handleFit` → `const cw = containerRef.current?.clientWidth ?? 800; editorStore.setZoom(Math.max(5, (cw - LABEL_WIDTH) / Math.max(1, timelineDuration)))`
  - `handleSeek = (t: number) => playbackStore.seek(t)`
  - `handleSelectClip = (clipId, trackId) => editorStore.setSelection({clipId, trackId})`
  - `handleSelectTrack = (trackId) => editorStore.setSelection({trackId})`
- 布局（无 project 或 tracks 全空 → 显示 `cut.timeline.empty` 空态）：
  ```
  <div className={styles.container}>
    <TimelineToolbar snapEnabled onZoomIn onZoomOut onFit />
    {showEmpty ? (
      <div className={styles.empty}>{text("cut.timeline.empty")}</div>
    ) : (
      <div className={styles.scrollArea} ref={containerRef}>
        <div className={styles.trackArea} style={{ width: trackAreaWidth }}>
          <TimelineRuler duration pixelsPerSecond labelWidth onSeek />
          <TimelineTracks tracks pixelsPerSecond labelWidth selectedClipId contentWidth onSelectClip onSelectTrack />
          <Playhead currentTime pixelsPerSecond labelWidth onSeek />
        </div>
      </div>
    )}
  </div>
  ```

**`d:\works\myworks\fat-cut\src\pages\WorkPage\components\Bottom\components\TimelinePanel\TimelinePanel.less`**（当前为空，需新建内容）：
- `.container` — flex column，height 100%，背景 #fff
- `.empty` — flex 居中，color #8c8c8c，font 13px
- `.scrollArea` — `flex: 1; overflow-x: auto; overflow-y: hidden; position: relative;`
- `.trackArea` — `position: relative; min-width: 100%;`（宽由 inline style 控制）

**关键设计点**：
- `trackArea` 用 `position: relative` 作为 Playhead 的定位上下文（Playhead.tsx 用 `parentElement` 取 rect）
- `scrollArea` 横向滚动，`trackArea` 宽 = `labelWidth + contentWidth`，让标尺/轨道/播放头共享横轴
- 轨道标签和标尺角块用 `position: sticky; left: 0` 在横向滚动时保持可见（叶子组件已实装）

**验证**：选工程后 → 时间线显示轨道 + 标尺 + 播放头 → 缩放按钮改变刻度密度 → 点标尺 seek → 播放头跟随 → 拖播放头 seek。`npx tsc --noEmit` 0 错。

---

### WP4 — PreviewWindow 预览（PreviewVideo + PreviewControls）

参考 phase 2 计划 §WP4。阶段一播放**播放头所在最上层未隐藏 video 轨活动片段**（`getActiveClip` 已实装）。

#### 新建文件

**`d:\works\myworks\fat-cut\src\pages\WorkPage\components\MainView\components\PreviewWindow\components\PreviewVideo\PreviewVideo.tsx` + `.less`**
- 订阅 `useActiveClip()` + `usePlaybackStore()` + `useSdk()`
- `videoRef = useRef<HTMLVideoElement>(null)`
- `useEffect([activeClip?.id])`：若 `activeClip && activeClip.type === "video" && activeClip.assetRef` → `videoRef.current.src = sdk.asset.previewUrl(activeClip.assetRef.filePath)`；无活动片段 → 清空 src
- `useEffect([currentTime, isPlaying])`（非播放态，如 seek）：若 activeClip 存在 → `videoRef.current.currentTime = (currentTime - clip.timelineIn) + clip.sourceIn`（clamp 到 `[sourceIn, sourceOut]`）
- `usePlayback()` 启动 rAF；播放时：`video.play()`，rAF 读 `video.currentTime` → `playbackStore.seek((video.currentTime - clip.sourceIn) + clip.timelineIn)`（视频驱动时间）；`video.playbackRate = clip.speed * playbackStore.rate`
- 跨片段检测：`video.currentTime >= clip.sourceOut` → 由 `getActiveClip` 在下一帧自然切换（activeClip 变 → useEffect 切 src）
- 无活动片段：显示黑屏 + 占位文字 `cut.preview.placeholder`（需补 i18n key）
- barrel `components/index.ts`

**`d:\works\myworks\fat-cut\src\pages\WorkPage\components\MainView\components\PreviewWindow\components\PreviewControls\PreviewControls.tsx` + `.less`**
- 订阅 `usePlaybackStore()` + `useI18n()`
- 左：`Icon name={isPlaying ? "pause" : "play"}` 按钮 → `playbackStore.play()`/`pause()`
- 中：`formatTime(currentTime) / formatTime(duration)` 文本
- 右：倍速 `Select`（0.5/1/1.5/2）→ `playbackStore.setRate()`
- barrel `components/index.ts`

**`d:\works\myworks\fat-cut\src\pages\WorkPage\components\MainView\components\PreviewWindow\components\index.ts`** — 导出 PreviewVideo/PreviewControls

#### 修改文件

- **`d:\works\myworks\fat-cut\src\pages\WorkPage\components\MainView\components\PreviewWindow\PreviewWindow.tsx`** — 上 `PreviewVideo`（flex:1）+ 下 `PreviewControls`（高 40px）
- **`d:\works\myworks\fat-cut\src\locales\cut\{zh_CN,en_US}.ts`** — 补 `cut.preview.placeholder`（"无视频画面"/"No video frame"）

**验证**：添加视频片段 → 播放 → 视频播放 + Playhead 跟随 → 跨片段切换 → 点标尺 seek → 视频跳转 → 暂停/倍速正常。`npx tsc --noEmit` 0 错。

---

### WP5 — 时间线交互（@dnd-kit 拖拽 + pointer 裁剪）

参考 phase 2 计划 §WP5。`@dnd-kit` 已装。

#### 修改文件

**`d:\works\myworks\fat-cut\src\pages\WorkPage\components\Bottom\components\TimelinePanel\components\TimelineTracks\TimelineTracks.tsx`** — 包 `DndContext`：
- `import { DndContext, PointerSensor, useSensor, useSensors, DragOverlay } from "@dnd-kit/core"`
- `sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))` 区分点击/拖拽
- `activeClip state`（拖拽中）；`onDragStart` → `setActiveClip(findClip(tracks, active.id))`；`onDragEnd` → 算 `Δs = delta.x / pixelsPerSecond` → `editorStore.moveClip(clipId, toTrackId, clip.timelineIn + Δs)`；`setActiveClip(null)`
- `<DragOverlay>` 渲染半透明 Clip 副本（仅 activeClip 存在时）
- droppable 容器在 Track 层

**`d:\works\myworks\fat-cut\src\pages\WorkPage\components\Bottom\components\TimelinePanel\components\TimelineTracks\components\Track\Track.tsx`** — 加 `useDroppable({id: track.id})`；锁定轨 `disabled`；`ref={setNodeRef}` 绑到 lane

**`d:\works\myworks\fat-cut\src\pages\WorkPage\components\Bottom\components\TimelinePanel\components\TimelineTracks\components\Track\components\Clip\Clip.tsx`** — 加 `useDraggable({id: clip.id})`；`listeners`/`attributes`/`setNodeRef` 绑到片段主体（非手柄）；选中态高亮
- 裁剪手柄（左右 8px）`onPointerDown`：
  - `e.stopPropagation()` 防触发拖拽
  - `setPointerCapture` + 本地 ref `trimming = {edge, startX: e.clientX, origSourceIn, origSourceOut, origTimelineIn, origPps}`
  - `onPointerMove`：`Δs = (e.clientX - startX) / pps`；本地预览（直接改 `style.left`/`style.width`，不刷 store）+ 若 `snapEnabled` 调 `snap()`；`onPointerUp`：提交 `editorStore.trimClip(clipId, edge, Δs)` + 清状态
  - `minDur = 0.1s`（trimClip 内已含约束）
- 左/右手柄用 `data-edge="left"/"right"` 区分（已渲染）

**`d:\works\myworks\fat-cut\src\pages\WorkPage\components\Bottom\components\TimelinePanel\components\Playhead\Playhead.tsx`** — 已在 WP3 实装拖动 seek（用 `parentElement` 算 rect），WP5 无需改

**关键约束**：
- 拖拽移动：`editorStore.moveClip` 已处理吸附 + 跨轨（仅同类型）+ 锁定轨拒绝
- 裁剪：左边缘 `sourceIn += Δs 且 timelineIn += Δs`（约束 `sourceIn>=0`）；右边缘 `sourceOut += Δs`（约束 `sourceOut<=assetRef.duration`）。`trimClip` 已实装此语义
- 点击 vs 拖拽：PointerSensor `distance:6` 区分；纯点击 → `setSelection`

**验证**：点片段选中 → OptionPanel 切 ClipProperties（WP6 实装）→ 拖片段移动（吸附 + 跨轨）→ 拖左右手柄裁剪（sourceIn/sourceOut 变化，预览对应）→ 拖播放头 seek → 拖标尺 seek。`npx tsc --noEmit` 0 错。

---

### WP6 — OptionPanel + 保存收尾

参考 phase 2 计划 §WP6。

#### 新建文件

**`d:\works\myworks\fat-cut\src\pages\WorkPage\components\MainView\components\OptionPanel\components\EmptyState\EmptyState.tsx` + `.less`** — `cut.option.empty` + `cut.option.emptyHint`

**`d:\works\myworks\fat-cut\src\pages\WorkPage\components\MainView\components\OptionPanel\components\ClipProperties\ClipProperties.tsx` + `.less`**
- 订阅 `useEditorStore()` → `selectedClipId` → `findClip(project.tracks, id)` 得 clip
- `FatForm` 受控：sourceIn/sourceOut/timelineIn（`InputNumber`，单位 `cut.common.seconds`）、duration（只读 = `timelineDuration`）、volume/opacity（`Slider` 0-1）、speed（`InputNumber` 0.25-4）、transform.scale/rotation/x/y
- `type==="text"` 额外 `TextConfig`（content/fontFamily/fontSize/color/bold/italic/align）— 当前 phase 仅 video，text 字段保留接口
- `onValuesChange` → `editorStore.updateClip(clipId, patch)`（dirty 自动置位）

**`d:\works\myworks\fat-cut\src\pages\WorkPage\components\MainView\components\OptionPanel\components\TrackProperties\TrackProperties.tsx` + `.less`**
- trackName（`Input`）/muted/locked/hidden（`Switch`）/height（`InputNumber` 40-200）→ `editorStore.updateTrack`

**`d:\works\myworks\fat-cut\src\pages\WorkPage\components\MainView\components\OptionPanel\components\ProjectProperties\ProjectProperties.tsx` + `.less`**
- fps（`InputNumber` 24/30/60）/width/height（`InputNumber`）/backgroundColor（`Input.Color`）→ `editorStore.updateProject`

**各级 `components/index.ts` barrel**

#### 修改文件

**`d:\works\myworks\fat-cut\src\pages\WorkPage\components\MainView\components\OptionPanel\OptionPanel.tsx`**
- 订阅 `useEditorStore()`；优先级：`selectedClipId` → `ClipProperties`；否则 `selectedTrackId` → `TrackProperties`；否则 `project` → `ProjectProperties`；无 project → `EmptyState`

#### 保存收尾

- `ProjectToolbar` 保存按钮已在 WP1 实装（`editorStore.saveProject(sdk)` → toast + `dirty=false`）
- 全链路验证：改片段属性 → dirty 高亮 → 保存 → 重载工程数据恢复

**验证**：选中片段 → ClipProperties 显示 → 改 volume → 时间线/预览响应 → dirty 高亮 → 保存 → 重载恢复。`npx tsc --noEmit` 0 错。

---

## Assumptions & Decisions

1. **本计划严格遵循 phase 2 计划的 WP4-WP6 设计**，仅补充 WP3 收尾的具体协调器实现细节（phase 2 计划已描述，本计划具象化）。
2. **WP3 收尾的 `trackArea` 用 `position: relative` 作为 Playhead 定位上下文**：Playhead.tsx 用 `parentElement` 取 rect，必须保证 parent 是相对定位的 trackArea。
3. **`LABEL_WIDTH = 120` 常量**：与 Track.less/Playhead.less 的设计一致，可后续抽到 const.ts。
4. **WP4 预览只播放最上层活动 video 片段**：多轨合成（canvas/WebGL）留阶段二，phase 1 计划已明确。
5. **WP5 裁剪本地预览直接改 style 不刷 store**：避免拖动中频繁 setState 卡顿，pointerup 才提交 `trimClip`。
6. **WP6 OptionPanel 用 FatForm 受控 + `onValuesChange`**：每次改字段都 `updateClip`/`updateTrack`/`updateProject`，dirty 自动置位，与 phase 2 计划一致。
7. **不新增 npm 依赖**：`@dnd-kit` 已装，antd/ahooks/lodash 已有，原生 `<video>`。
8. **遵循 AGENTS.md 组件规则**：所有子组件按 `ParentComponent/components/ChildComponent/ChildComponent.tsx+.less` + `index.ts` barrel，禁同文件多组件。
9. **FatForm 用于所有属性表单**（WP6 Properties），遵循 workspace 规则。
10. **请求用 `sdk.backend.invoke`**（非 `$.post`，因为是插件后端 JSON-RPC，非 fat-notes 主应用 `/app/*` 路由）。
11. **i18n 新增 key**：仅需补 `cut.preview.placeholder`（WP4）；WP5/WP6 无新增 key（已有覆盖）。

## Verification（end-to-end）

1. `cd d:\works\myworks\fat-cut && npx tsc --noEmit` — 0 错（每个 WP 完成后都验证）
2. `cd d:\works\myworks\fat-cut && npm run dev`（watch）
3. 宿主 `set PY_MODE=dev && python src/main.py`，活动栏点 fat-cut
4. **WP3 收尾**：选工程后 → 时间线显示轨道 + 标尺 + 播放头 → 缩放按钮改变刻度密度 → 点标尺 seek → 播放头跟随 → 拖播放头 seek
5. **WP4**：添加视频片段 → 播放 → 视频播放 + Playhead 跟随 → 跨片段切换 → 点标尺 seek → 视频跳转 → 暂停/倍速正常
6. **WP5**：点片段选中 → 拖片段移动（吸附 + 跨轨）→ 拖左右手柄裁剪（sourceIn/sourceOut 变化，预览对应）→ 拖播放头 seek
7. **WP6**：选中片段 → ClipProperties 显示 → 改 volume → 时间线/预览响应 → dirty 高亮 → 保存 → 重载恢复
8. **ffmpeg**：probeAsset 返回时长/分辨率（验证 `FFMPEG_HOME` 继承，WP2 已验证）

## 实施顺序

**WP3 收尾**（协调器 + barrel）→ **WP4**（PreviewVideo + PreviewControls）→ **WP5**（DndContext + droppable + draggable + 裁剪手柄交互）→ **WP6**（OptionPanel + EmptyState/ClipProperties/TrackProperties/ProjectProperties）。

每 WP 完成后 `npx tsc --noEmit` 验证 0 错，再进下一 WP。全部完成后做 end-to-end 验证。

## 关键文件清单

### 新建（WP3 收尾）
- `src\pages\WorkPage\components\Bottom\components\TimelinePanel\components\index.ts`（barrel）

### 修改（WP3 收尾）
- `src\pages\WorkPage\components\Bottom\components\TimelinePanel\TimelinePanel.tsx`（协调器）
- `src\pages\WorkPage\components\Bottom\components\TimelinePanel\TimelinePanel.less`（当前空，需补样式）

### 新建（WP4 预览）
- `src\pages\WorkPage\components\MainView\components\PreviewWindow\components\PreviewVideo\PreviewVideo.tsx`+.less + `components\index.ts`
- `src\pages\WorkPage\components\MainView\components\PreviewWindow\components\PreviewControls\PreviewControls.tsx`+.less
- `src\pages\WorkPage\components\MainView\components\PreviewWindow\components\index.ts`

### 修改（WP4）
- `src\pages\WorkPage\components\MainView\components\PreviewWindow\PreviewWindow.tsx`
- `src\locales\cut\zh_CN.ts` + `en_US.ts`（补 `cut.preview.placeholder`）

### 修改（WP5 交互）
- `src\pages\WorkPage\components\Bottom\components\TimelinePanel\components\TimelineTracks\TimelineTracks.tsx`（DndContext）
- `src\pages\WorkPage\components\Bottom\components\TimelinePanel\components\TimelineTracks\components\Track\Track.tsx`（useDroppable）
- `src\pages\WorkPage\components\Bottom\components\TimelinePanel\components\TimelineTracks\components\Track\components\Clip\Clip.tsx`（useDraggable + 裁剪手柄交互）

### 新建（WP6 OptionPanel）
- `src\pages\WorkPage\components\MainView\components\OptionPanel\components\EmptyState\EmptyState.tsx`+.less
- `src\pages\WorkPage\components\MainView\components\OptionPanel\components\ClipProperties\ClipProperties.tsx`+.less
- `src\pages\WorkPage\components\MainView\components\OptionPanel\components\TrackProperties\TrackProperties.tsx`+.less
- `src\pages\WorkPage\components\MainView\components\OptionPanel\components\ProjectProperties\ProjectProperties.tsx`+.less
- 各级 `components\index.ts`

### 修改（WP6）
- `src\pages\WorkPage\components\MainView\components\OptionPanel\OptionPanel.tsx`
- `src\pages\WorkPage\components\MainView\components\OptionPanel\components\index.ts`
