# fat-cut 视频编辑插件 第一阶段实现计划

## Context

fat-cut 是 FatNotes 的剪辑插件（Module Federation 加载）。当前 `WorkPage` 骨架已就绪（antd Splitter 布局：上 MainView[FunctionArea|PreviewWindow|OptionPanel] + 下 Bottom[TimelinePanel]），但四个面板都是空壳。`backend.enabled: false`，后端 `main.py`/`plugin_runtime.py` 仅有示例 handler。

本阶段目标：实现剪映式核心三件套 —— **素材面板（对接 fat-notes 资源）+ 预览窗口（视频播放）+ 时间线（多轨道/拖拽/裁剪/缩放/播放头同步）+ 工程保存加载 + OptionPanel 属性编辑**。文本/贴纸/特效/转场/字幕/滤镜 6 个 Tab 先放占位。

**核心原则**：绝不修改原始素材，只编辑剪辑配置（中间层 JSON），引用素材路径 + 源入/出点 + 时间线入点 + 滤镜/特效参数。ffmpeg 操作通过继承宿主 `FFMPEG_HOME` 环境变量调用，不改宿主代码。

## 关键决策（用户已确认）

1. **启用后端**：`plugin.json` 的 `backend.enabled` 改 `true`，参考 fat-pen 的 `@handler` + JSON-RPC + 工作区 JSON 文件模式。
2. **状态管理**：`useSyncExternalStore` 轻量 store（对齐 fat-pen，非 Redux）。
3. **范围**：核心三件套，其余 6 Tab 占位。
4. **时间线交互**：完整（拖拽/裁剪/多轨/缩放/播放头同步/吸附）。

**架构修正**：playhead 的 `currentTime` 归 `playbackStore`（非 editorStore），避免 60fps 全 clip 树重渲染。editorStore 只持结构数据（tracks/clips/selection/zoom，播放期间不变）。

## 参考文件（复用现有模式）

- 后端保存基石：`d:\works\myworks\fat-pen\backend\service\init\initFictionsService.py`（workspace 解析 + 原子写 `tempfile.mkstemp`+`os.replace` + 容忍读 + `host_get_system_paths`）
- 后端 handler 注册：`d:\works\myworks\fat-pen\backend\main.py`
- 前端 store 模式：`d:\works\myworks\fat-pen\src\reducers\fictionStore.ts`（`let state` + `listeners Set` + `emitChange` + `setState` + `subscribe` + `getSnapshot` + `useSyncExternalStore`）
- 编辑 Modal + FatForm：`d:\works\myworks\fat-pen\src\components\biz\FictionEditModal\FictionEditModal.tsx`
- @dnd-kit 拖拽 + 乐观更新：`d:\works\myworks\fat-pen\src\pages\ControlMenusPage\components\FictionList\FictionList.tsx`
- fat-cut 后端运行时（已就绪）：`d:\works\myworks\fat-cut\backend\plugin_runtime.py`（已含 `host_get_system_paths`、`@handler`、`run`）
- SDK 资源 API：`d:\works\myworks\fat-cut\types\fat-notes-sdk.d.ts` 的 `AssetApi`（`list`/`listCategories`/`previewUrl`）
- ffmpeg 路径来源：宿主 `d:\works\myworks\fat-notes\src\services\pluginService\pluginService.py` 启动时设 `os.environ["FFMPEG_HOME"]`，子进程继承

## 1. 数据模型 `src/models/cut.d.ts`

命名空间 `Cut`。核心类型（绝修改原素材，仅引用 + 入出点）：

- `AssetRef`：`{guid, filePath(绝对), fileName, fileType(MIME), duration, width?, height?}`
- `Clip`：`{id, trackId, type:"video"|"audio"|"image"|"text"|"sticker", assetRef?, sourceIn, sourceOut, timelineIn, speed, volume, opacity, transform:{x,y,scale,rotation}, filters:[], effects:[], text?:TextConfig, createdAt, updatedAt}`
  - `sourceIn/sourceOut` = 使用原素材哪段；`timelineIn` = 时间线绝对起点；`timelineOut = timelineIn + (sourceOut-sourceIn)/speed`（派生不存）
- `Track`：`{id, type:"video"|"audio", name, clips, muted, locked, hidden, height, sortOrder}`
- `CutProject`：`{id, name, description, fps, width, height, backgroundColor, tracks, createdAt, updatedAt}`
- `ProjectItem`（列表轻量）：`{id, name, description, thumbnail?, createdAt, updatedAt}`
- 响应：`ProjectListResponse`、`ProjectDetailResponse`、`ProbeAssetResult`

**裁剪语义（剪映式）**：拖左边缘 `sourceIn += Δs 且 timelineIn += Δs`（约束 `sourceIn>=0`）；拖右边缘 `sourceOut += Δs`（约束 `sourceOut<=assetRef.duration`）。

## 2. 后端（启用 + 参考 fat-pen）

### 目录结构
```
<workspace>/fatCut/
  projects.json              # ProjectItem[]（原子写）
  projects/<id>/project.json # 完整 CutProject（原子写）
```

### 新建文件
- `backend/service/init/initCutService.py` — 镜像 `initFictionsService.py`：`get_workspace_root`（缓存 + `lastClosedFolder`→`configAbsolutePath.parent`→`Path.cwd()`）、`get_cut_dir`/`get_projects_file`/`get_projects_data_dir`/`get_project_dir`、`write_projects`（原子写）、`ensure_projects_storage`/`read_projects`/`require_project_record`、`create_project_record`（建记录 + 初始化 project.json，默认含 1 video + 1 audio 空轨）/`update_project_record`/`delete_project_record`（`shutil.rmtree`）/`reorder_projects`
- `backend/service/projectService/projectService.py` — `get_project_file`/`ensure_project_storage`/`read_project`（容忍读，解析失败不覆盖）/`write_project`（原子写）；handlers: `getProject`、`saveProject`（校验存在 + 原子写 + 更新列表 updatedAt/name）
- `backend/service/ffmpegUtil/ffmpegUtil.py` — `get_ffmpeg_path`/`get_ffprobe_path`（`shutil.which` → `FFMPEG_HOME`/`FFMPEG_PATH` 环境变量 → 插件目录）、`probe_asset`（`ffprobe -print_format json -show_format -show_streams`，返回 `{duration,width,height,codec,fileType}`）、`run_ffmpeg(args)`（通用执行器，阶段二导出用）

### handlers 清单（改 `backend/main.py` 注册）
| handler | 参数 | 返回 |
|---|---|---|
| `listProjects` | `{}` | `{items, filePath}` |
| `createProject` | `{name, description?}` | `ProjectItem` |
| `updateProject` | `{id, name?, description?}` | `ProjectItem` |
| `deleteProject` | `{id}` | `ProjectItem` |
| `reorderProjects` | `{ids}` | `ProjectItem[]` |
| `getProject` | `{id}` | `{project, filePath}` |
| `saveProject` | `{project}` | `{project, filePath}` |
| `probeAsset` | `{filePath}` | `ProbeAssetResult` |
| `runFfmpeg` | `{args}` | `{returncode, stdout, stderr}` |

保留现有 `hello/echo/getSystemPaths/...`。`backend/requirements.txt` 无需新增（仅标准库 + ffmpeg 子进程）。

## 3. 前端 Stores（`src/reducers/`，useSyncExternalStore）

模式严格对齐 `fictionStore.ts`。barrel 更新 `src/reducers/index.ts`。

- `projectStore.ts`：`{projects, selectedProjectId, loadingStatus, isEditModalOpen, editingProject}`。actions: `loadProjects(sdk)`（去重 loadingPromise）、`selectProject`、`setProjects`、`setEditModalOpen`、`setEditingProject`
- `editorStore.ts`（编辑会话核心）：`{project?, loadingStatus, selectedClipId?, selectedTrackId?, pixelsPerSecond(默认50), snapEnabled(默认true), dirty}`。actions: `loadProject(sdk,id)`、`addClip`（timelineIn=playhead 当前时间，插入最上层未锁 video 轨，重叠则贴到尾）、`moveClip(clipId,toTrackId,newTimelineIn)`（吸附）、`trimClip(clipId,edge,delta)`、`deleteClip`、`splitClip`、`addTrack`/`deleteTrack`/`updateTrack`、`updateClip(clipId,patch)`、`setSelection`、`setZoom`、`toggleSnap`、`saveProject(sdk)`、`reset`
- `playbackStore.ts`（易失运行时）：`{isPlaying, currentTime, duration, rate}`。actions: `play`/`pause`/`seek`/`tick(dt)`（rAF 驱动）/`setDuration`/`setRate`

**editorStore↔playbackStore 联动**：editorStore.loadProject/addClip/moveClip/trimClip 后，编辑器顶层 `useEffect` 监听 project 变化 → `playbackStore.setDuration(getTimelineEnd(project))`，保持单向，避免 store 互 import。

## 4. Utils 与 Hooks

- `src/utils/time.ts`：`formatTime(seconds)` → `mm:ss`/`hh:mm:ss`
- `src/utils/clip.ts`：`timelineDuration(clip)`、`timelineOut(clip)`、`getTimelineEnd(tracks)`、`getActiveClip(tracks, currentTime)`（最上层未隐藏 video 片段）、`snap(time, clips, playhead, pps, threshold=0.2)`。更新 `src/utils/index.ts` 导出
- `src/hooks/usePlayback.ts`：rAF 循环，播放时每帧 `playbackStore.tick(dt)`，订阅 isPlaying 控制
- `src/hooks/useActiveClip.ts`：订阅 playbackStore.currentTime + editorStore.project → `getActiveClip`。更新 `src/hooks/index.ts`

## 5. 组件分解（遵循 AGENTS.md：`ParentComponent/components/ChildComponent/ChildComponent.tsx+.less` + index.ts barrel，禁同文件多组件）

### 5.1 基础
- `src/components/basic/Icon/Icon.tsx+.less` — 内联 SVG 图标集（play/pause/plus/zoomIn/zoomOut/scissors/trash/save/lock/unlock/eye）。**不引 `@ant-design/icons`**（规避 MF shared 协商风险）。更新 `src/components/index.ts`

### 5.2 WorkPage 顶部工具条
- 改 `WorkPage.tsx`：顶部加 `ProjectToolbar`（高 40px），下方保留 Splitter；无工程显示空状态引导新建
- `components/ProjectToolbar/ProjectToolbar.tsx+.less` — 工程名 + 新建 + 保存（dirty 高亮，调 `editorStore.saveProject(sdk)`）
- `components/ProjectToolbar/components/ProjectEditModal/` — FatForm（name/description），调 `createProject`/`updateProject`

### 5.3 FunctionArea（左侧 Tabs）
- 改 `FunctionArea.tsx`：antd Tabs，7 tab
- `components/MaterialsPanel/`（核心）：
  - `MaterialsPanel.tsx` — `useEffect` 调 `sdk.asset.listCategories()` + `sdk.asset.list({file_type:["video/"], category_id, keyword, page:1, page_size:50})`
  - `components/CategoryFilter/` — 分类下拉 + 关键词搜索
  - `components/AssetList/` — 素材网格
    - `components/AssetCard/` — `<video src={sdk.asset.previewUrl(filePath)}#t=0.1 muted>` 取首帧 + 文件名 + 时长 + "添加"按钮 → `invoke<ProbeAssetResult>("probeAsset",{filePath})` → `editorStore.addClip({type:"video", assetRef:{...}})`
- `components/PlaceholderPanel/` — 复用占位（Text/Stickers/Effects/Transitions/Subtitles/Filters 6 tab）

### 5.4 PreviewWindow（预览）
- 改 `PreviewWindow.tsx`：视频区 + 控制条
- `components/PreviewVideo/` — 阶段一播放**播放头所在最上层 video 轨活动片段**（`getActiveClip`）：
  - `video.src = sdk.asset.previewUrl(clip.assetRef.filePath)`；`video.currentTime = (currentTime - clip.timelineIn) + clip.sourceIn`；`video.playbackRate = clip.speed * playbackStore.rate`
  - rAF 读 `video.currentTime` → `playbackStore.currentTime = (video.currentTime - clip.sourceIn) + clip.timelineIn`（视频驱动时间）
  - 跨片段：`video.currentTime >= clip.sourceOut` 时切换下一片段
  - seek：反算 `video.currentTime = (target - activeClip.timelineIn) + activeClip.sourceIn`
  - 多轨合成留阶段二（canvas/WebGL）
- `components/PreviewControls/` — 播放/暂停（订阅 isPlaying）+ `formatTime(currentTime)/formatTime(duration)` + 倍速下拉

### 5.5 TimelinePanel（剪映式核心）
- 改 `TimelinePanel.tsx`：容器 = 工具条 + 水平滚动区（标尺+轨道+播放头共享横轴像素系）
- 横轴 = 时间秒 × `pixelsPerSecond`（editorStore.zoom）。Playhead `position:absolute; left: currentTime*pps`
- `components/TimelineToolbar/` — 缩放+/-、适应、吸附开关、添加/删除轨道
  - `components/ZoomControl/`
- `components/TimelineRuler/` — 自适应刻度密度，点击/拖动 → `playbackStore.seek(x/pps)`
- `components/TimelineTracks/` — @dnd-kit DndContext 包裹
  - `components/Track/` — 固定高，左侧标签（名称/静音/锁定/隐藏），droppable
    - `components/Clip/` — 宽=`timelineDuration*pps`，左=`timelineIn*pps`，文件名+缩略图条，左右 8px 裁剪手柄，点击选中高亮，draggable（drag overlay 半透明）
- `components/Playhead/` — 订阅 currentTime，`left=currentTime*pps`，拖动 seek

### 5.6 OptionPanel（随选择动态切换）
- 改 `OptionPanel.tsx`：`{selectedClipId, selectedTrackId, project} = useEditorStore()`，优先 ClipProperties → TrackProperties → EmptyState/ProjectProperties
- `components/EmptyState/`、`components/ClipProperties/`（FatForm：sourceIn/sourceOut/timelineIn/duration(只读)/volume/opacity/speed/transform；type==="text" 额外 TextConfig）、`components/TrackProperties/`、`components/ProjectProperties/`（fps/width/height/backgroundColor）。onChange → `editorStore.updateClip`/`updateTrack`/`updateProject`

## 6. 关键交互

- **添加素材**：AssetCard"添加"→`probeAsset`→`editorStore.addClip`（timelineIn=playhead 当前；重叠贴同轨尾；插最上层未锁 video 轨）→同步 playbackStore.duration
- **预览-时间线同步**：播放时 rAF 读 video.currentTime 写 playbackStore.currentTime → Playhead 跟随；点标尺/拖播放头 → playbackStore.seek → PreviewVideo 反算 video.currentTime
- **片段拖拽**（@dnd-kit，PointerSensor `distance:6` 区分点击/拖拽）：Track=droppable，Clip=draggable，drag overlay 半透明；onDragEnd `Δs=delta.x/pps`，吸附后 `editorStore.moveClip`；锁定轨拒绝 drop
- **片段裁剪**（自实现 pointer events，dnd-kit 不擅长 resize）：手柄 `setPointerCapture` + 本地 state 预览（避免刷 store）+ 按裁剪语义 + 吸附 + `onPointerUp` 提交 `editorStore.trimClip`；`minDur=0.1s`
- **保存/加载**：选中工程→`editorStore.loadProject`(`getProject`)→set project+`playbackStore.setDuration+seek(0)`；保存按钮→`editorStore.saveProject`(`saveProject`)→成功 toast+dirty=false

## 7. 依赖与 i18n

### 新增 npm 依赖（`package.json`，**不**加入 webpack shared）
```
@dnd-kit/core ^6.3.1
@dnd-kit/modifiers ^9.0.0
@dnd-kit/sortable ^10.0.0
@dnd-kit/utilities ^3.2.2
```
（与 fat-pen 版本对齐。原生 `<video>`，无视频库。无 Python 新依赖。）

### i18n（`src/locales/cut/zh_CN.ts` + `en_US.ts`，合并入口）
keys 覆盖：`cut.title`、`cut.toolbar.*`（new/save/saved/saveFailed/unsaved/projectName）、`cut.project.*`（createTitle/editTitle/form.*/modal.*/confirmDelete）、`cut.tabs.*`（materials/text/stickers/effects/transitions/subtitles/filters）、`cut.materials.*`（searchPlaceholder/allCategories/empty/add/loading/duration/loadFailed）、`cut.placeholder.comingSoon`、`cut.preview.*`（play/pause/mute）、`cut.timeline.*`（zoomIn/zoomOut/fit/snap/addTrack/addVideoTrack/addAudioTrack/deleteTrack/lockTrack/hideTrack/track.video/track.audio/empty）、`cut.clip.*`（trim/delete/split）、`cut.option.*`（empty/clip/track/project/sourceIn/sourceOut/timelineIn/duration/volume/opacity/speed/transform/scale/rotation/x/y/trackName/muted/locked/hidden/height/fps/width/backgroundColor）、`cut.common.seconds`

## 8. 实施顺序（子阶段，每步用 `npm run dev` 验证，遵循"尽量少用 npm run build"）

1. **地基**：plugin.json 启用后端 → 后端三服务 + main.py 注册 → `models/cut.d.ts` → i18n → utils(time/clip) → 三 store
2. **工程管理壳**：Icon → ProjectToolbar + ProjectEditModal → WorkPage 接入 → 验证 list/create/save/load/delete 全链路
3. **素材 Tab**：FunctionArea Tabs → MaterialsPanel + CategoryFilter + AssetList + AssetCard → 验证 sdk.asset 列出视频
4. **时间线骨架**：TimelineToolbar + ZoomControl + TimelineRuler + TimelineTracks + Track + Playhead → 静态渲染 + 缩放 + 滚动 + 播放头
5. **添加片段 + 预览**：AssetCard 添加 → probeAsset → addClip → 片段出现 → PreviewVideo + PreviewControls 播放/暂停/seek
6. **时间线交互**：Clip 选中 → OptionPanel 切 ClipProperties → @dnd-kit 拖拽移动(吸附/跨轨) → pointer 裁剪 → 标尺/播放头 seek
7. **OptionPanel + 保存收尾**：ClipProperties/TrackProperties/ProjectProperties(FatForm 联动) → 保存 dirty 指示全链路

## 9. 验证方式（end-to-end）

1. `cd d:\works\myworks\fat-cut && npm run dev`（watch 模式，宿主 dev 模式加载 dist/remoteEntry.js）
2. 宿主启动 fat-notes（`set PY_MODE=dev && python src/main.py`），活动栏点 fat-cut 图标进入工作台
3. **工程管理**：ProjectToolbar 新建工程 → 弹窗输入名称 → 工程出现在列表 → 工作区进入编辑态 → 检查 `<workspace>/fatCut/projects.json` 与 `projects/<id>/project.json` 生成
4. **素材**：MaterialsPanel 选分类 + 搜索 → 视频缩略图列出（用 `sdk.asset.previewUrl`）
5. **添加片段**：点 AssetCard"添加"→ 时间线出现片段（probeAsset 返回时长）→ OptionPanel 显示片段属性
6. **预览**：PreviewWindow 播放/暂停 → Playhead 跟随 → 跨片段切换 → 点标尺 seek → 视频跳转
7. **时间线交互**：拖片段移动（吸附 + 跨轨）→ 拖左右手柄裁剪（sourceIn/sourceOut 变化，预览对应）→ 缩放+/- → 适应
8. **保存**：改片段 → 保存按钮高亮（dirty）→ 点保存 → toast 成功 → 检查 `project.json` 更新 → 重载工程数据恢复
9. **ffmpeg**：后端 `probeAsset` 正常返回时长/分辨率（验证 FFMPEG_HOME 继承生效）

## 10. 关键文件清单

### 修改
- `d:\works\myworks\fat-cut\plugin.json`（backend.enabled → true）
- `d:\works\myworks\fat-cut\backend\main.py`（注册 9 个 handler）
- `d:\works\myworks\fat-cut\package.json`（加 @dnd-kit）
- `d:\works\myworks\fat-cut\src\pages\WorkPage\WorkPage.tsx`（顶部工具条 + 空状态）
- `d:\works\myworks\fat-cut\src\pages\WorkPage\components\index.ts`
- `d:\works\myworks\fat-cut\src\pages\WorkPage\components\MainView\components\FunctionArea\FunctionArea.tsx`（Tabs）
- `d:\works\myworks\fat-cut\src\pages\WorkPage\components\MainView\components\PreviewWindow\PreviewWindow.tsx`
- `d:\works\myworks\fat-cut\src\pages\WorkPage\components\MainView\components\OptionPanel\OptionPanel.tsx`
- `d:\works\myworks\fat-cut\src\pages\WorkPage\components\Bottom\components\TimelinePanel\TimelinePanel.tsx`
- `d:\works\myworks\fat-cut\src\locales\zh_CN.ts` / `en_US.ts`
- `d:\works\myworks\fat-cut\src\reducers\index.ts` / `src\utils\index.ts` / `src\hooks\index.ts` / `src\components\index.ts`

### 新建（后端）
- `d:\works\myworks\fat-cut\backend\service\init\initCutService.py`
- `d:\works\myworks\fat-cut\backend\service\projectService\projectService.py`
- `d:\works\myworks\fat-cut\backend\service\ffmpegUtil\ffmpegUtil.py`
- 各 `__init__.py`

### 新建（前端 model/store/utils/hooks/i18n）
- `src\models\cut.d.ts`
- `src\reducers\{projectStore,editorStore,playbackStore}.ts`
- `src\utils\{time,clip}.ts`
- `src\hooks\{usePlayback,useActiveClip}.ts`
- `src\locales\cut\{zh_CN,en_US}.ts`

### 新建（前端组件）
- `src\components\basic\Icon\Icon.tsx+.less`
- WorkPage：`ProjectToolbar\` + `ProjectToolbar\components\ProjectEditModal\`
- FunctionArea：`components\MaterialsPanel\`（含 `CategoryFilter\`、`AssetList\`、`AssetList\components\AssetCard\`）+ `components\PlaceholderPanel\`
- PreviewWindow：`components\PreviewVideo\` + `components\PreviewControls\`
- TimelinePanel：`components\TimelineToolbar\`（含 `components\ZoomControl\`）+ `components\TimelineRuler\` + `components\TimelineTracks\`（含 `components\Track\`、`Track\components\Clip\`）+ `components\Playhead\`
- OptionPanel：`components\{EmptyState,ClipProperties,TrackProperties,ProjectProperties}\`
- 各级 `components\index.ts` barrel
