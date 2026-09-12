# fat-cut 视频编辑插件 第二阶段实现计划（续建）

## Context

本计划是 [fat-cut-editor-phase1-plan.md](./fat-cut-editor-phase1-plan.md) 的续篇。phase 1 的**地基（步骤 1）已基本完成**：后端三服务 + `main.py` 注册 9 个 handler、`models/cut.d.ts`、三个 store、utils、hooks、i18n、`Icon`、`FatForm` 均已就位，`plugin.json` 已启用后端，`@dnd-kit` 已装。

**当前阻塞**：`npx tsc --noEmit` 报 2 个 TS 错误，必须先修。**待建**：四个面板（`FunctionArea`/`PreviewWindow`/`TimelinePanel`/`OptionPanel`）仍是空壳，`WorkPage` 顶部无工程管理工具条。本阶段完成 phase 1 计划的步骤 2-7，达成剪映式核心三件套全链路可用。

**核心原则不变**：绝不修改原始素材，只编辑剪辑配置（中间层 JSON）；ffmpeg 通过继承宿主 `FFMPEG_HOME` 调用。

## Current State Analysis（基于实际代码核对）

### 已完成（勿重做）
- 后端：`backend/main.py`（注册 `listProjects/createProject/updateProject/deleteProject/reorderProjects/getProject/saveProject/probeAsset/runFfmpeg` + 保留 `hello/echo/...`）；`backend/service/init/initCutService.py`、`projectService/projectService.py`、`ffmpegUtil/ffmpegUtil.py` 均已实现
- 数据模型：`src/models/cut.d.ts`（`Cut.AssetRef/Clip/Track/CutProject/ProjectItem/...`）
- Stores：`src/reducers/{projectStore,editorStore,playbackStore}.ts` + barrel。`editorStore` 已含 `loadProject/saveProject/addClip/moveClip/trimClip/deleteClip/updateClip/addTrack/deleteTrack/updateTrack/updateProject/setSelection/setZoom/toggleSnap/reset`
- Utils：`src/utils/{time,clip}.ts`（`formatTime/timelineDuration/timelineOut/getTimelineEnd/getActiveClip/findClip/findTrack/snap/collectSnapPoints`）
- Hooks：`src/hooks/{useSdk,useI18n,usePlayback,useActiveClip}.ts`
- i18n：`src/locales/cut/{zh_CN,en_US}.ts`（~80 keys 全覆盖）+ 合并入口 `src/locales/{zh_CN,en_US}.ts`
- 基础组件：`src/components/basic/{Icon,FatForm,InitSdk}` + barrel
- 入口：`src/index.tsx` 已 `registerWorkbenchPage` → `WorkPage`；`WorkPage.tsx` 已用 `Splitter` 布局（上 `MainView`/下 `Bottom`），但无顶部工具条

### 2 个 TS 错误（必须先修）
1. `src/hooks/index.ts:1` — `export { useI18n } from "./useI18n";` 但 `useI18n.ts` 是 `export default useI18n;`（默认导出，非命名导出）
2. `src/reducers/editorStore.ts:386-387` — `addTrack` 创建的 `Track` 含 `createdAt/updatedAt`，但 `cut.d.ts` 的 `Track` 接口（69-79 行）无此两字段。后端 `initCutService._build_default_tracks` 实际也写这俩字段 → 应补到接口

### 待建（本阶段交付）
- `WorkPage` 顶部工程管理工具条（新建/保存/切换工程）+ 无工程空状态
- `FunctionArea` 7 Tabs + `MaterialsPanel`（对接 `sdk.asset`）
- `PreviewWindow` 视频预览 + 控制条
- `TimelinePanel` 剪映式时间线（工具条/标尺/轨道/片段/播放头 + 拖拽/裁剪/缩放/吸附/seek）
- `OptionPanel` 属性编辑（片段/轨道/工程）

## Proposed Changes

按 6 个工作包推进，每包用 `npm run dev` 验证（遵循"尽量少用 npm run build"）。

---

### WP0 — 修复 2 个 TS 错误（解锁编译）

**修改 `src/models/cut.d.ts`**（`Track` 接口，69-79 行）：补 `createdAt: string;` 与 `updatedAt: string;`，与 `Clip`/`CutProject` 一致，也与后端 `_build_default_tracks` 实际写入对齐。
```ts
interface Track {
  id: string;
  type: TrackType;
  name: string;
  clips: Clip[];
  muted: boolean;
  locked: boolean;
  hidden: boolean;
  height: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
```

**修改 `src/hooks/index.ts:1`**：`useI18n` 是默认导出，改为别名重导出：
```ts
export { default as useI18n } from "./useI18n";
```

**验证**：`npx tsc --noEmit` 0 错。

---

### WP1 — 工程管理壳（ProjectToolbar + ProjectEditModal + WorkPage 接入）

参考 phase 1 计划 §5.2 与 fat-pen `FictionEditModal` 模式（`FatForm.useForm` + create/update 分支 + `sdk.backend.invoke`）。**采用顶部工具条方案（非 fat-pen 的侧边栏列表）**：工具条含工程名下拉（切换/新建）、新建按钮、保存按钮（dirty 高亮）。

#### 新建文件
- `src/pages/WorkPage/components/ProjectToolbar/ProjectToolbar.tsx` + `.less`
  - 订阅 `useProjectStore()` + `useEditorStore()` + `useSdk()`
  - 左：`<Dropdown>`（工程列表，点击切换 → `editorStore.loadProject(sdk, id)` + `projectStore.selectProject(id)`；底部"＋ 新建工程" → 打开 `ProjectEditModal`）
  - 中：当前工程名（无工程显示占位）
  - 右：`新建` 按钮（`Icon name="plus"`）+ `保存` 按钮（`Icon name="save"`，`dirty` 时高亮，点击 `editorStore.saveProject(sdk)` → toast 成功/失败）
  - `mount` 时 `projectStore.loadProjects(sdk)`
- `src/pages/WorkPage/components/ProjectToolbar/components/ProjectEditModal/ProjectEditModal.tsx` + `.less`
  - `FatForm.useForm<{name, description}>()` + `<FatForm.Item name="name" rules={[{required:true}]}><Input/></FatForm.Item>` + `<FatForm.Item name="description"><TextArea/></FatForm.Item>`
  - 订阅 `useProjectStore()` 的 `isEditModalOpen` + `editingProject`
  - `onOk`：`editingProject` 存在 → `sdk.backend.invoke("updateProject", {id, name, description})` + toast `cut.project.modal.edit.success`；否则 `sdk.backend.invoke("createProject", {name, description})` + toast `cut.project.modal.create.success`
  - 成功后 `projectStore.loadProjects(sdk)` 刷新列表；新建后自动选中新工程 → `editorStore.loadProject(sdk, newId)`
- `src/pages/WorkPage/components/ProjectToolbar/components/index.ts` — barrel

#### 修改文件
- `src/pages/WorkPage/WorkPage.tsx` — 顶部加 `<ProjectToolbar/>`（高 40px），下方保留原 `Splitter`；无 `selectedProjectId` 时 MainView/Bottom 区显示空状态引导（`cut.placeholder.comingSoon` 或新建 CTA）；`mount` 时若 `projectStore.projects` 为空则 `loadProjects`
- `src/pages/WorkPage/components/index.ts` — 加 `export { ProjectToolbar }`
- `src/pages/WorkPage/components/ProjectToolbar/components/ProjectEditModal/ProjectEditModal.less` — 简单表单宽度

#### 交互
- 切换工程：Dropdown 选项 → `editorStore.reset()` → `editorStore.loadProject(sdk, id)` → 成功后 `playbackStore.setDuration(getTimelineEnd(project))` + `playbackStore.seek(0)`
- 删除工程：Dropdown 项右侧 `Icon name="trash"` → `sdk.ui.modal.confirm` → `sdk.backend.invoke("deleteProject", {id})` → 刷新列表；若删的是当前工程 → `editorStore.reset()`

**验证**：新建工程 → 弹窗 → 工程出现 → 选工程进入编辑态 → 检查 `<workspace>/fatCut/projects.json` 与 `projects/<id>/project.json` 生成 → 保存按钮在 dirty 时高亮。

---

### WP2 — 素材 Tab（FunctionArea Tabs + MaterialsPanel）

参考 phase 1 计划 §5.3。`FunctionArea` 改 antd `Tabs`，7 个 tab：素材/文本/贴纸/特效/转场/字幕/滤镜。仅"素材"实装，其余用 `PlaceholderPanel` 占位。

#### 新建文件
- `src/pages/WorkPage/components/MainView/components/FunctionArea/components/MaterialsPanel/MaterialsPanel.tsx` + `.less`
  - `useSdk()` + `useI18n()` + 本地 state `{categories, selectedCategoryId, keyword, assets, loading, page}`
  - `useEffect` mount → `sdk.asset.listCategories()` 存 categories；`loadAssets()` 调 `sdk.asset.list({file_type:["video/"], category_id: selectedCategoryId, keyword, page, page_size:50})`
  - 布局：上 `CategoryFilter`，下 `AssetList`（滚动）
- `src/pages/WorkPage/components/MainView/components/FunctionArea/components/MaterialsPanel/components/CategoryFilter/CategoryFilter.tsx` + `.less`
  - `Select` 分类（含"全部分类" `cut.materials.allCategories`）+ `Input.Search` 关键词（`cut.materials.searchPlaceholder`）→ 回调 `onChange(categoryId, keyword)`
- `src/pages/WorkPage/components/MainView/components/FunctionArea/components/MaterialsPanel/components/AssetList/AssetList.tsx` + `.less`
  - 网格布局渲染 `AssetCard`；空态 `cut.materials.empty`；加载态 `cut.materials.loading`
  - barrel `components/index.ts`
- `src/pages/WorkPage/components/MainView/components/FunctionArea/components/MaterialsPanel/components/AssetList/components/AssetCard/AssetCard.tsx` + `.less`
  - `<video src={sdk.asset.previewUrl(item.file_path)+"#t=0.1"} muted preload="metadata">` 取首帧缩略图
  - 文件名 + `formatTime`（若有 duration）+ "添加"按钮（`cut.materials.add`）
  - 添加：`sdk.backend.invoke<Cut.ProbeAssetResult>("probeAsset", {filePath: item.file_path})` → 构造 `AssetRef {guid, filePath, fileName, fileType, duration, width, height}` → `editorStore.addClip({type:"video", assetRef})` → toast 成功
- `src/pages/WorkPage/components/MainView/components/FunctionArea/components/PlaceholderPanel/PlaceholderPanel.tsx` + `.less`
  - 居中显示 `cut.placeholder.comingSoon`
- 各级 `components/index.ts` barrel

#### 修改文件
- `src/pages/WorkPage/components/MainView/components/FunctionArea/FunctionArea.tsx` — antd `Tabs` `items=[{key:"materials", label:text("cut.tabs.materials"), children:<MaterialsPanel/>}, {key:"text", label:text("cut.tabs.text"), children:<PlaceholderPanel/>}, ...]`；默认 `activeKey="materials"`
- `src/pages/WorkPage/components/MainView/components/FunctionArea/components/index.ts` — 导出 `MaterialsPanel`/`PlaceholderPanel`

**验证**：进素材 tab → 分类下拉 + 搜索 → 视频缩略图列出 → 点"添加"→ 时间线出现片段（probeAsset 返回时长）。

---

### WP3 — 时间线骨架（静态渲染 + 缩放 + 滚动 + 播放头）

参考 phase 1 计划 §5.5。横轴 = 时间秒 × `pixelsPerSecond`（`editorStore.pixelsPerSecond`）。本 WP 只做静态渲染 + 缩放 + 滚动 + 播放头跟随，拖拽/裁剪留 WP5。

#### 新建文件
- `src/pages/WorkPage/components/Bottom/components/TimelinePanel/components/TimelineToolbar/TimelineToolbar.tsx` + `.less`
  - `Icon name="zoomIn/zoomOut/fit/magnet/plus"` 按钮
  - zoomIn/out → `editorStore.setZoom(pps * 1.2 / pps / 1.2)`；fit → 算 `pps = containerWidth / duration`；magnet → `editorStore.toggleSnap()`（active 高亮）；plus → `editorStore.addTrack("video")`（或下拉选 video/audio）
  - barrel `components/index.ts`
- `src/pages/WorkPage/components/Bottom/components/TimelinePanel/components/TimelineToolbar/components/ZoomControl/ZoomControl.tsx` + `.less` — 缩放滑块（可选，初版用按钮即可，此文件按需建）
- `src/pages/WorkPage/components/Bottom/components/TimelinePanel/components/TimelineRuler/TimelineRuler.tsx` + `.less`
  - 宽 = `duration * pps`；按 pps 自适应刻度密度（每 N 秒一格 + 标 `formatTime`）；点击/拖动 → `playbackStore.seek(x / pps)`
- `src/pages/WorkPage/components/Bottom/components/TimelinePanel/components/TimelineTracks/TimelineTracks.tsx` + `.less`
  - 渲染 `project.tracks`（按 `sortOrder`）→ 每轨一个 `Track`；宽 = `duration * pps`；本 WP 不包 DndContext（WP5 加）
  - barrel `components/index.ts`
- `src/pages/WorkPage/components/Bottom/components/TimelinePanel/components/TimelineTracks/components/Track/Track.tsx` + `.less`
  - 左侧标签区（宽 120px）：名称 + `Icon name="mute/lock/eye"`（点击 `editorStore.updateTrack`）+ 删除按钮
  - 右侧轨道区：固定高 `track.height`，相对定位渲染 `Clip`；空轨显示提示
  - barrel `components/index.ts`
- `src/pages/WorkPage/components/Bottom/components/TimelinePanel/components/TimelineTracks/components/Track/components/Clip/Clip.tsx` + `.less`
  - `position:absolute; left: clip.timelineIn * pps; width: timelineDuration(clip) * pps`
  - 文件名 + 缩略色块；左右 8px 裁剪手柄（WP5 实装交互，本 WP 只渲染）；点击 → `editorStore.setSelection({clipId, trackId})`；选中高亮边框
- `src/pages/WorkPage/components/Bottom/components/TimelinePanel/components/Playhead/Playhead.tsx` + `.less`
  - `position:absolute; left: currentTime * pps`（订阅 `usePlaybackStore`）；拖动 seek
- 各级 `components/index.ts` barrel

#### 修改文件
- `src/pages/WorkPage/components/Bottom/components/TimelinePanel/TimelinePanel.tsx`
  - 订阅 `useEditorStore()` + `usePlaybackStore()`
  - `useEffect` 监听 `project` 变化 → `playbackStore.setDuration(getTimelineEnd(project))`
  - 布局：上 `TimelineToolbar`，下水平滚动区（`TimelineRuler` + `TimelineTracks` + `Playhead` 共享横轴，`position:relative` 容器，宽 = `duration * pps`）
  - 无工程/空轨道时显示 `cut.timeline.empty`
- `src/pages/WorkPage/components/Bottom/components/TimelinePanel/components/index.ts` — 导出子组件

**验证**：有工程后 → 时间线显示轨道 + 标尺 + 播放头 → 缩放按钮改变刻度密度 → 点标尺 seek → 播放头移动。

---

### WP4 — 添加片段 + 预览（PreviewVideo + PreviewControls）

WP2 的 AssetCard 添加已能让片段出现，本 WP 接通预览播放。

#### 新建文件
- `src/pages/WorkPage/components/MainView/components/PreviewWindow/components/PreviewVideo/PreviewVideo.tsx` + `.less`
  - 订阅 `useActiveClip()` + `usePlaybackStore()` + `useEditorStore()`
  - 阶段一播放**播放头所在最上层未隐藏 video 轨活动片段**（`getActiveClip` 已实现）
  - `useRef<HTMLVideoElement>`；`useEffect` 监听 activeClip 变化 → 设 `video.src = sdk.asset.previewUrl(clip.assetRef.filePath)`（仅 type=video/image）
  - `useEffect` 监听 `currentTime` 变化（非播放态，如 seek）→ 反算 `video.currentTime = (currentTime - clip.timelineIn) + clip.sourceIn`
  - `usePlayback()` 启动 rAF；播放时 rAF 读 `video.currentTime` → `playbackStore.seek((video.currentTime - clip.sourceIn) + clip.timelineIn)`（视频驱动时间）；`video.playbackRate = clip.speed * playbackStore.rate`
  - 跨片段：`video.currentTime >= clip.sourceOut` 时切下一片段（rAF 内检测）
  - 无活动片段：显示黑屏 + 占位
  - barrel `components/index.ts`
- `src/pages/WorkPage/components/MainView/components/PreviewWindow/components/PreviewControls/PreviewControls.tsx` + `.less`
  - `Icon name="play/pause"`（订阅 `isPlaying`）→ `playbackStore.play()`/`pause()`
  - `formatTime(currentTime)` / `formatTime(duration)`
  - 倍速 `Select`（0.5/1/1.5/2）→ `playbackStore.setRate()`
  - barrel `components/index.ts`

#### 修改文件
- `src/pages/WorkPage/components/MainView/components/PreviewWindow/PreviewWindow.tsx` — 上 `PreviewVideo`（flex:1），下 `PreviewControls`（高 40px）
- `src/pages/WorkPage/components/MainView/components/PreviewWindow/components/index.ts` — 导出

**验证**：添加视频片段 → 播放 → 视频播放 + Playhead 跟随 → 跨片段切换 → 点标尺 seek → 视频跳转 → 暂停/倍速正常。

---

### WP5 — 时间线交互（选中 + 拖拽 + 裁剪 + seek）

参考 phase 1 计划 §6。用 `@dnd-kit` 做片段拖拽移动（PointerSensor `distance:6` 区分点击/拖拽），自实现 pointer events 做裁剪（dnd-kit 不擅长 resize）。

#### 修改文件
- `TimelineTracks.tsx` — 包 `<DndContext sensors={[PointerSensor({activationConstraint:{distance:6}})]} onDragEnd={...}>` + `<DragOverlay>`（半透明 Clip 预览）
  - `onDragEnd`：`delta.x / pps = Δs`；`editorStore.moveClip(clipId, toTrackId, clip.timelineIn + Δs)`（moveClip 内已含吸附 + 跨轨类型校验 + 锁定轨拒绝）
- `Track.tsx` — `useDroppable({id: track.id})`；锁定轨 `disabled`
- `Clip.tsx` — `useDraggable({id: clip.id})`；`listeners`/`attributes` 绑到片段主体（非手柄）；选中态高亮；`DragOverlay` 渲染半透明副本
  - 裁剪手柄：左/右各 8px，`onPointerDown` → `setPointerCapture` + 本地 state `trimming:{edge, startX, origSourceIn, origSourceOut, origTimelineIn}` → `onPointerMove` 算 `Δs = (e.clientX - startX) / pps`，本地预览（直接改 style，不刷 store）+ 吸附 → `onPointerUp` 提交 `editorStore.trimClip(clipId, edge, Δs)`；`minDur=0.1s`
- `TimelineRuler.tsx` — 已在 WP3 实装 seek
- `Playhead.tsx` — 拖动 seek（pointer events，`onPointerDown` → capture → `onPointerMove` → `playbackStore.seek(x/pps)`）

**关键约束**：
- 拖拽移动：`moveClip` 已处理吸附 + 跨轨（仅同类型）+ 锁定轨拒绝
- 裁剪：左边缘 `sourceIn += Δs 且 timelineIn += Δs`（约束 `sourceIn>=0`）；右边缘 `sourceOut += Δs`（约束 `sourceOut<=assetRef.duration`）。`trimClip` 已实装此语义
- 点击 vs 拖拽：PointerSensor `distance:6` 区分；纯点击 → `setSelection`

**验证**：点片段选中 → OptionPanel 切 ClipProperties → 拖片段移动（吸附 + 跨轨）→ 拖左右手柄裁剪（sourceIn/sourceOut 变化，预览对应）→ 拖播放头 seek → 拖标尺 seek。

---

### WP6 — OptionPanel + 保存收尾

参考 phase 1 计划 §5.6。

#### 新建文件
- `src/pages/WorkPage/components/MainView/components/OptionPanel/components/EmptyState/EmptyState.tsx` + `.less` — `cut.option.empty` + `cut.option.emptyHint`
- `src/pages/WorkPage/components/MainView/components/OptionPanel/components/ClipProperties/ClipProperties.tsx` + `.less`
  - 订阅 `useEditorStore()` 取 `selectedClipId` → `findClip` 得 clip
  - `FatForm` 受控：sourceIn/sourceOut/timelineIn（`InputNumber`，单位 `cut.common.seconds`）、duration（只读 = `timelineDuration`）、volume/opacity（`Slider` 0-1）、speed（`InputNumber`）、transform.scale/rotation/x/y
  - `type==="text"` 额外 `TextConfig`（content/fontFamily/fontSize/color/bold/italic/align）
  - `onChange` → `editorStore.updateClip(clipId, patch)`（dirty 自动置位）
- `src/pages/WorkPage/components/MainView/components/OptionPanel/components/TrackProperties/TrackProperties.tsx` + `.less`
  - trackName/muted/locked/hidden/height → `editorStore.updateTrack`
- `src/pages/WorkPage/components/MainView/components/OptionPanel/components/ProjectProperties/ProjectProperties.tsx` + `.less`
  - fps/width/height/backgroundColor → `editorStore.updateProject`
- 各级 `components/index.ts` barrel

#### 修改文件
- `src/pages/WorkPage/components/MainView/components/OptionPanel/OptionPanel.tsx`
  - 订阅 `useEditorStore()`；优先级：`selectedClipId` → `ClipProperties`；否则 `selectedTrackId` → `TrackProperties`；否则 `project` → `ProjectProperties`；无 project → `EmptyState`
- `src/pages/WorkPage/components/MainView/components/OptionPanel/components/index.ts` — 导出

#### 保存收尾
- `ProjectToolbar` 保存按钮已在 WP1 实装（`editorStore.saveProject(sdk)` → toast + `dirty=false`）
- 全链路验证：改片段属性 → dirty 高亮 → 保存 → 重载工程数据恢复

**验证**：选中片段 → ClipProperties 显示 → 改 volume → 时间线/预览响应 → dirty 高亮 → 保存 → 重载恢复。

---

## Assumptions & Decisions

1. **工程管理用顶部工具条**（非 fat-pen 侧边栏列表）：phase 1 计划 §5.2 已定，本计划遵循。工程切换用 Dropdown。
2. **Track 接口补 `createdAt/updatedAt`**：与 `Clip`/`CutProject` 一致，且后端实际写入这俩字段，是正确的数据模型对齐（非新增功能）。
3. **`useI18n` 改别名重导出**：保留 `useI18n.ts` 的 `export default`，只改 barrel，最小改动。
4. **WP3 时间线骨架先不含 DndContext**：避免静态渲染阶段引入复杂度，WP5 再包。Clip 的裁剪手柄 WP3 只渲染不交互。
5. **WP4 预览只播放最上层活动 video 片段**：多轨合成（canvas/WebGL）留阶段二，phase 1 计划已明确。
6. **不新增 npm 依赖**：`@dnd-kit` 已装，antd/ahooks/lodash 已有，原生 `<video>`。
7. **i18n keys 已全**：phase 1 已覆盖 ~80 keys，本阶段无需新增（除非交互中发现缺失，届时补 zh_CN/en_US 两份）。
8. **遵循 AGENTS.md 组件规则**：所有子组件按 `ParentComponent/components/ChildComponent/ChildComponent.tsx+.less` + `index.ts` barrel，禁同文件多组件。
9. **FatForm 用于所有属性表单**（WP1 Modal + WP6 Properties），遵循 workspace 规则。
10. **请求用 `sdk.backend.invoke`**（非 `$.post`，因为是插件后端 JSON-RPC，非 fat-notes 主应用 `/app/*` 路由）。

## Verification（end-to-end，对应 phase 1 计划 §9）

1. `cd d:\works\myworks\fat-cut && npm run dev`（watch）
2. 宿主 `set PY_MODE=dev && python src/main.py`，活动栏点 fat-cut
3. **WP0**：`npx tsc --noEmit` 0 错
4. **WP1**：新建工程 → 弹窗 → 工程出现 → 选工程进入编辑态 → 检查 `<workspace>/fatCut/projects.json` + `projects/<id>/project.json`
5. **WP2**：素材 tab → 分类 + 搜索 → 视频缩略图列出
6. **WP3**：时间线显示轨道 + 标尺 + 播放头 → 缩放 → 点标尺 seek
7. **WP4**：添加片段 → 播放 → Playhead 跟随 → 跨片段切换 → seek 视频跳转
8. **WP5**：拖片段移动（吸附 + 跨轨）→ 拖手柄裁剪 → dirty 高亮
9. **WP6**：ClipProperties 改属性 → 保存 → 重载恢复
10. **ffmpeg**：probeAsset 返回时长/分辨率（验证 `FFMPEG_HOME` 继承）

## 实施顺序

WP0（修 TS 错）→ WP1（工程管理壳）→ WP2（素材 Tab）→ WP3（时间线骨架）→ WP4（添加片段+预览）→ WP5（时间线交互）→ WP6（OptionPanel+保存收尾）。每 WP 完成后 `npm run dev` 验证，遵循"尽量少用 npm run build"。

## 关键文件清单

### 修改（WP0）
- `d:\works\myworks\fat-cut\src\models\cut.d.ts`（Track 接口补 createdAt/updatedAt）
- `d:\works\myworks\fat-cut\src\hooks\index.ts`（useI18n 别名重导出）

### 新建（WP1 工程管理壳）
- `src\pages\WorkPage\components\ProjectToolbar\ProjectToolbar.tsx`+.less
- `src\pages\WorkPage\components\ProjectToolbar\components\ProjectEditModal\ProjectEditModal.tsx`+.less
- `src\pages\WorkPage\components\ProjectToolbar\components\index.ts`

### 修改（WP1）
- `src\pages\WorkPage\WorkPage.tsx`（顶部工具条 + 空状态）
- `src\pages\WorkPage\components\index.ts`

### 新建（WP2 素材 Tab）
- `src\pages\WorkPage\components\MainView\components\FunctionArea\components\MaterialsPanel\MaterialsPanel.tsx`+.less
- `...\MaterialsPanel\components\CategoryFilter\CategoryFilter.tsx`+.less
- `...\MaterialsPanel\components\AssetList\AssetList.tsx`+.less + `components\index.ts`
- `...\AssetList\components\AssetCard\AssetCard.tsx`+.less
- `...\FunctionArea\components\PlaceholderPanel\PlaceholderPanel.tsx`+.less
- 各级 `components\index.ts`

### 修改（WP2）
- `src\pages\WorkPage\components\MainView\components\FunctionArea\FunctionArea.tsx`（Tabs）
- `src\pages\WorkPage\components\MainView\components\FunctionArea\components\index.ts`

### 新建（WP3 时间线骨架）
- `src\pages\WorkPage\components\Bottom\components\TimelinePanel\components\TimelineToolbar\TimelineToolbar.tsx`+.less + `components\index.ts`
- `...\TimelineRuler\TimelineRuler.tsx`+.less
- `...\TimelineTracks\TimelineTracks.tsx`+.less + `components\index.ts`
- `...\TimelineTracks\components\Track\Track.tsx`+.less + `components\index.ts`
- `...\Track\components\Clip\Clip.tsx`+.less
- `...\TimelinePanel\components\Playhead\Playhead.tsx`+.less
- `...\TimelinePanel\components\index.ts`

### 修改（WP3）
- `src\pages\WorkPage\components\Bottom\components\TimelinePanel\TimelinePanel.tsx`

### 新建（WP4 预览）
- `src\pages\WorkPage\components\MainView\components\PreviewWindow\components\PreviewVideo\PreviewVideo.tsx`+.less + `components\index.ts`
- `...\PreviewControls\PreviewControls.tsx`+.less
- `...\PreviewWindow\components\index.ts`

### 修改（WP4）
- `src\pages\WorkPage\components\MainView\components\PreviewWindow\PreviewWindow.tsx`

### 修改（WP5 交互）
- `TimelineTracks.tsx`（DndContext）、`Track.tsx`（droppable）、`Clip.tsx`（draggable + 裁剪手柄）、`Playhead.tsx`（拖动 seek）

### 新建（WP6 OptionPanel）
- `src\pages\WorkPage\components\MainView\components\OptionPanel\components\{EmptyState,ClipProperties,TrackProperties,ProjectProperties}\*.tsx`+.less
- 各级 `components\index.ts`

### 修改（WP6）
- `src\pages\WorkPage\components\MainView\components\OptionPanel\OptionPanel.tsx`
- `src\pages\WorkPage\components\MainView\components\OptionPanel\components\index.ts`
