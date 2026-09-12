declare namespace Cut {
  // ── 素材引用（绝不修改原文件，仅记录路径与探测元数据）──
  interface AssetRef {
    guid: string;
    filePath: string;
    fileName: string;
    fileType: string;
    duration: number;
    width?: number;
    height?: number;
  }

  type ClipType = "video" | "audio" | "image" | "text" | "sticker" | "subtitle";

  interface ClipTransform {
    x: number;
    y: number;
    scale: number;
    scaleX?: number;
    scaleY?: number;
    rotation: number;
  }

  type ClipKeyframeProperty =
    | "transform.x"
    | "transform.y"
    | "transform.scale"
    | "transform.scaleX"
    | "transform.scaleY"
    | "transform.rotation"
    | "opacity";

  interface ClipKeyframe {
    id: string;
    time: number;
    value: number;
  }

  interface ClipKeyframeTrack {
    property: ClipKeyframeProperty;
    keyframes: ClipKeyframe[];
  }

  interface TextConfig {
    content: string;
    fontFamily: string;
    fontSize: number;
    color: string;
    bold: boolean;
    italic: boolean;
    align: "left" | "center" | "right";
    strokeColor?: string;
    strokeWidth?: number;
    shadow?: boolean;
    backgroundColor?: string;
  }

  interface StickerConfig {
    content: string;
    stickerType: "emoji" | "image";
    size: number;
    filePath?: string;
  }

  // 滤镜片段:独立于 clip 的轨道片段,拥有自己的时间范围。
  // 在 [timelineIn, timelineIn + duration] 区间内对整个画面生效,
  // 用户可在时间线上拖拽移动、拉伸边缘来调整作用范围。
  interface FilterClip {
    id: string;
    type: string;
    timelineIn: number;
    duration: number;
    params: Record<string, unknown>;
  }

  interface EffectConfig {
    id: string;
    type: string;
    params: Record<string, unknown>;
  }

  type TransitionDirection =
    | "left"
    | "right"
    | "top"
    | "bottom"
    | "tl"
    | "tr"
    | "bl"
    | "br"
    | "center";

  interface TransitionConfig {
    id: string;
    type: string;
    duration: number;
    params: Record<string, unknown>;
  }

  // ── 片段：时间线最小单元 ──
  // sourceIn/sourceOut = 使用原素材的哪一段
  // timelineIn = 时间线绝对起点
  // timelineOut = timelineIn + (sourceOut - sourceIn) / speed（派生不存）
  interface Clip {
    id: string;
    trackId: string;
    type: ClipType;
    assetRef?: AssetRef;
    sourceIn: number;
    sourceOut: number;
    timelineIn: number;
    speed: number;
    volume: number;
    opacity: number;
    transform: ClipTransform;
    keyframes?: ClipKeyframeTrack[];
    effects: EffectConfig[];
    transitionIn?: TransitionConfig;
    transitionOut?: TransitionConfig;
    text?: TextConfig;
    sticker?: StickerConfig;
    createdAt: string;
    updatedAt: string;
  }

  type TrackType = "video" | "audio";

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

  interface CutProject {
    id: string;
    name: string;
    description: string;
    fps: number;
    width: number;
    height: number;
    backgroundColor: string;
    tracks: Track[];
    filterClips: FilterClip[];
    createdAt: string;
    updatedAt: string;
  }

  interface ProjectItem {
    id: string;
    name: string;
    description: string;
    thumbnail?: string;
    createdAt: string;
    updatedAt: string;
  }

  interface ProjectListResponse {
    items: ProjectItem[];
    filePath: string;
  }

  interface ProjectDetailResponse {
    project: CutProject;
    filePath: string;
  }

  interface ProbeAssetResult {
    duration: number;
    width: number;
    height: number;
    codec?: string;
    fileType: string;
  }

  interface AiPlanningAsset {
    guid: string;
    filePath: string;
    fileName: string;
    fileType: string;
    description?: string;
    tags: string[];
    duration: number;
    width?: number;
    height?: number;
    clipInfos?: AssetClipInfo[];
  }

  // 素材描述中的分段信息，仅用于视频/音频素材。
  // 序列化为 JSON 字符串后存入素材 meta 的 description 字段，供 AI 剪影读取。
  interface AssetClipInfo {
    startTime: number;
    endTime: number;
    content: string;
    usage?: string;
  }

  // 素材描述数据结构，整体 description + 视频/音频分段 clipInfos。
  // 以 JSON 字符串形式保存在素材 meta 的 description 字段。
  interface AssetDescriptionData {
    description: string;
    clipInfos?: AssetClipInfo[];
  }

  type AiArrangementNodeType =
    | "start"
    | "clip"
    | "transition"
    | "filter"
    | "end";

  interface AiArrangementNodeData {
    order?: number;
    label?: string;
    summary?: string;
    reason?: string;
    assetGuid?: string;
    filePath?: string;
    fileName?: string;
    fileType?: string;
    clipType?: ClipType;
    trackType?: TrackType;
    trackIndex?: number;
    timelineIn?: number;
    duration?: number;
    sourceIn?: number;
    sourceOut?: number;
    transitionType?: string;
    filterType?: string;
    params?: Record<string, unknown>;
    afterClipId?: string;
    clipId?: string;
    tags?: string[];
  }

  interface AiArrangementNode {
    id: string;
    nodeType: AiArrangementNodeType;
    title: string;
    subtitle?: string;
    x: number;
    y: number;
    data: AiArrangementNodeData;
  }

  interface AiArrangementEdge {
    id: string;
    sourceId: string;
    targetId: string;
    label?: string;
  }

  interface AiArrangementGraph {
    nodes: AiArrangementNode[];
    edges: AiArrangementEdge[];
  }

  interface AiArrangementPlanSegment {
    assetGuid?: string;
    filePath?: string;
    fileName?: string;
    title?: string;
    reason?: string;
    duration?: number;
    sourceIn?: number;
    sourceOut?: number;
    trackType?: TrackType;
    trackIndex?: number;
    timelineIn?: number;
    transitionType?: string;
    transitionDuration?: number;
    filterType?: string;
    filterDuration?: number;
    tags?: string[];
  }

  interface AiArrangementPlan {
    summary?: string;
    style?: string;
    segments?: AiArrangementPlanSegment[];
  }

  interface AiTimelineBuildResult {
    tracks: Track[];
    filterClips: FilterClip[];
    duration: number;
  }

  interface AiArrangementResult {
    prompt: string;
    summary: string;
    warnings: string[];
    graph: AiArrangementGraph;
    timeline: AiTimelineBuildResult;
    usedAssets: AiPlanningAsset[];
  }

  type ExportFormat = "mp4" | "mov" | "webm";

  interface ExportOptions {
    outputPath: string;
    format: ExportFormat;
    width?: number;
    height?: number;
  }

  type ExportStatus =
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "unknown";

  interface ExportProgress {
    status: ExportStatus;
    progress: number; // 0-100
    message?: string;
    outputPath?: string;
  }

  interface ExportResult {
    exportId: string;
    outputPath: string;
  }

  interface DefaultExportPathResult {
    outputPath: string;
    exportsDir: string;
  }

  /** Global AI configuration persisted via sdk.config. */
  interface AiConfig {
    /** Default model id for material/asset recognition (must support images). */
    recognitionModelId?: string;
    /** Default model id for AI clip arrangement / video editing. */
    aiModelId?: string;
  }
}
