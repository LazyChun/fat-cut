/*
 * FatNotes Bespoke Plugin SDK — mirror of
 * `fat-notes/src/views/pluginSdk/types.ts`.
 *
 * Keep this file in sync with the host types when upgrading the CLI.
 */
import type { ComponentType, ReactNode } from "react";

export interface Disposable {
  dispose(): void;
}

export interface HostInfo {
  version: string;
  mode: "dev" | "prod";
}

export interface PluginUser {
  id?: string;
  name?: string;
  email?: string;
  avatar?: string;
  [key: string]: unknown;
}

export interface AuthApi {
  getUser(): PluginUser | null;
  getToken(): string | null;
  onAuthChange(
    cb: (user: PluginUser | null, token: string | null) => void,
  ): Disposable;
}

export interface DataSourceItem {
  id: string;
  name: string;
  type: string;
  [key: string]: unknown;
}

export interface DataSourceApi {
  listDs(): Promise<DataSourceItem[]>;
  getDs(id: string): Promise<DataSourceItem | null>;
}

export interface QueryApi {
  run<T = unknown>(
    queryId: string,
    params?: Record<string, unknown>,
  ): Promise<T>;
  runRaw<T = unknown>(dsId: string, sql: string): Promise<T>;
}

export interface MutationApi {
  run<T = unknown>(
    mutationId: string,
    payload?: Record<string, unknown>,
  ): Promise<T>;
  insert<T = unknown>(
    dsId: string,
    table: string,
    row: Record<string, unknown>,
  ): Promise<T>;
}

export interface ToastApi {
  success(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  info(msg: string): void;
}

export interface ModalApi {
  confirm(options: {
    title: string;
    content?: string;
    okText?: string;
    cancelText?: string;
  }): Promise<boolean>;
}

export interface ThemeApi {
  get(): "light" | "dark" | string;
  onChange(cb: (theme: string) => void): Disposable;
}

export interface I18nApi {
  t(key: string, values?: Record<string, string | number>): string;
  locale: string;
  onChange(cb: (locale: string) => void): Disposable;
}

export interface UiApi {
  toast: ToastApi;
  modal: ModalApi;
  theme: ThemeApi;
  i18n: I18nApi;
}

export interface CommandsApi {
  register(
    id: string,
    handler: (...args: unknown[]) => unknown | Promise<unknown>,
  ): Disposable;
  execute<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
}

export interface StoreApi {
  select<T>(selector: (state: unknown) => T): T;
  subscribe<T>(
    selector: (state: unknown) => T,
    cb: (value: T) => void,
  ): Disposable;
}

export type SidebarSlot = "primary" | "secondary";

export interface ActivityBarItemDef {
  id: string;
  title: string;
  icon: string;
  onClick?: () => void;
  primarySidebarViewId?: string;
}

export interface SidebarViewDef {
  id: string;
  title: string;
  render: () => ReactNode;
}

export interface PanelTabDef {
  id: string;
  title: string | ReactNode;
  render: () => ReactNode;
  sortIndex?: number;
}

export interface FooterItemDef {
  id: string;
  render: () => ReactNode;
  align?: "left" | "right";
}

export interface RoutePageDef {
  path: string;
  title: string;
  render: () => ReactNode;
}

export interface WidgetTypeDef {
  type: string;
  title: string;
  icon?: string;
  iconUrl?: string;
  category?: string;
  render: (props: { config: unknown }) => ReactNode;
  defaultSize?: {
    w?: number;
    h?: number;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
  };
}

export interface SettingsPageDef {
  id: string;
  title: string;
  render: () => ReactNode;
}

export interface WorkbenchPageDef {
  id: string;
  render: () => ReactNode;
}

export interface MenuItemDef {
  command: string;
  title?: string;
  when?: string;
}

export interface WidgetDisplayConfigDef {
  id: string;
  widgetType: string;
  render: () => ReactNode;
}

export interface ContributionsApi {
  registerActivityBarItem(def: ActivityBarItemDef): Disposable;
  /** Register the plugin's primary sidebar contribution using only a render callback. */
  registerPrimarySidebar(render: () => ReactNode): Disposable;
  /**
   * NOTE: writes to the `"secondary"` slot are reserved for the Chat block
   * and will be rejected by the host.
   */
  registerSidebarView(slot: SidebarSlot, def: SidebarViewDef): Disposable;
  registerPanelTab(def: PanelTabDef): Disposable;
  registerFooterItem(def: FooterItemDef): Disposable;
  registerRoutePage(def: RoutePageDef): Disposable;
  registerWorkbenchPage(def: WorkbenchPageDef): Disposable;
  registerWidgetType(def: WidgetTypeDef): Disposable;
  registerWidgetDisplayConfig(def: WidgetDisplayConfigDef): Disposable;
  registerSettingsPage(def: SettingsPageDef): Disposable;
  registerMenu(target: string, items: MenuItemDef[]): Disposable;
  /**
   * Request the host to hide the secondary sidebar while this registration
   * is active. Disposing the returned `Disposable` restores the previous
   * visibility. Multiple plugins can request hiding simultaneously; the
   * sidebar stays hidden until all disposables are disposed.
   */
  registerHideSecondarySidebar(): Disposable;
  /**
   * Request the host to hide the bottom panel while this registration is
   * active. Disposing the returned `Disposable` restores the previous
   * visibility. Multiple plugins can request hiding simultaneously; the
   * panel stays hidden until all disposables are disposed.
   */
  registerHidePanel(): Disposable;
}

export interface EventsApi {
  on(name: string, cb: (payload: unknown) => void): Disposable;
  emit(name: string, payload?: unknown): void;
}

/**
 * Backend API — allows the frontend plugin to invoke Python handler functions
 * running in the plugin's backend subprocess.
 *
 * Only available when `plugin.json` has `backend.enabled: true`.
 * If the plugin has no backend, `invoke()` rejects immediately.
 */
export interface BackendApi {
  /**
   * Call a named handler registered in the plugin backend.
   * @param handler - Handler name (decorated with `@handler(name)` in Python).
   * @param params - Optional JSON-serializable payload.
   * @returns The handler's return value.
   */
  invoke<T = unknown>(
    handler: string,
    params?: Record<string, unknown>,
  ): Promise<T>;
  /** Check if the backend process is currently running. */
  isRunning(): Promise<boolean>;
  /** Restart the backend process (stop + start). */
  restart(): Promise<void>;
}

export interface PluginConfigApi {
  get<T = Record<string, unknown>>(): Promise<T>;
  set<T = Record<string, unknown>>(
    config: T,
    options?: {
      merge?: boolean;
    },
  ): Promise<T>;
}

// ── AI ────────────────────────────────────────────────────────

/**
 * Sanitized view of a host-configured AI model.
 * `apiKey` is intentionally omitted — plugins must invoke models via
 * `AiApi.chat()` so the host handles authentication.
 */
export interface AiModelItem {
  id: string;
  name: string;
  model?: string;
  url?: string;
  supportImages?: boolean;
  isDefault?: boolean;
  apiType?: string;
  customParams?: Record<string, unknown>;
}

export interface AiChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface AiSkillRef {
  type: "mcp" | "tool";
  objId: string;
  name?: string;
}

export interface AiChatInput {
  modelId: string;
  messages: AiChatMessage[];
  sysPrompt?: string;
  skills?: AiSkillRef[];
  toolIds?: string[];
  autoMcp?: boolean;
  toolChoice?: unknown;
  maxIterations?: number;
}

export interface AiToolStep {
  iteration: number;
  toolCalls: unknown[];
  toolResults: unknown[];
}

export interface AiChatResult {
  content: string;
  model: string;
  toolSteps: AiToolStep[];
  iterations: number;
  terminatedBy?: string;
}

// ── Knowledge Base / Vector Store ─────────────────────────────

export interface AiKnowledgeBaseStorage {
  type: string;
  path?: string;
  indexName?: string;
  namespace?: string;
  customParams?: Record<string, unknown>;
}

export interface AiKnowledgeBaseEmbedding {
  modelId: string;
  dims?: number;
  normalize?: boolean;
  batchSize?: number;
  customParams?: Record<string, unknown>;
}

export interface AiKnowledgeBaseItem {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  langs?: string[];
  visibility?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  storage: AiKnowledgeBaseStorage;
  embedding: AiKnowledgeBaseEmbedding;
  stats?: Record<string, unknown>;
}

// ── MCP Tool ───────────────────────────────────────────────────

export interface AiMcpToolItem {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  tags?: string[];
  langs?: string[];
  type?: string;
  enable?: boolean;
}

// ── Skill ──────────────────────────────────────────────────────

export interface AiSkillItem {
  id: string;
  name?: string;
  description?: string;
  icon?: string;
  tags?: string[];
  langs?: string[];
  enable?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiApi {
  /** List all configured models (apiKey stripped). */
  getModels(): Promise<AiModelItem[]>;
  /** Fetch a single model by id (apiKey stripped). */
  getModel(id: string): Promise<AiModelItem | null>;
  /** Invoke the host's chat completion endpoint. */
  chat(input: AiChatInput): Promise<AiChatResult>;
  /** List all knowledge bases (vector stores) configured in the host. */
  getKnowledgeBases(): Promise<AiKnowledgeBaseItem[]>;
  /** List all MCP tools configured in the host (sanitized, no conf). */
  getMcpTools(): Promise<AiMcpToolItem[]>;
  /** List all skills configured in the host (sanitized). */
  getSkills(): Promise<AiSkillItem[]>;
}

export interface PluginBoardDependency {
  id: string;
  type: string;
  version?: string;
  [key: string]: unknown;
}

export interface PluginBoardDetail<TWidget = unknown> {
  boardId: string;
  uniqueKey: string;
  name: string;
  type: string;
  widgets: TWidget[];
  config: Record<string, unknown>;
  dependencies: PluginBoardDependency[];
}

export interface PluginBoardSaveInput<TWidget = unknown> {
  name?: string;
  type?: string;
  widgets: TWidget[];
}

export interface PluginBoardWidgetInput {
  id?: string;
  boardId?: string;
  name?: string;
  type?: string;
  defaultName?: string;
  showName?: boolean;
  parentId?: string | null;
  reqParams?: unknown;
  properties?: unknown;
  aiMarks?: unknown;
  pos?: {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    minW?: number;
    minH?: number;
  };
}

export interface PluginBoardsApi {
  getBoard<T = Record<string, unknown>>(uniqueKey: string): Promise<T>;
  setBoard<T = Record<string, unknown>>(
    uniqueKey: string,
    config: T,
    options?: {
      merge?: boolean;
    },
  ): Promise<T>;
  getDependencies(uniqueKey: string): Promise<PluginBoardDependency[]>;
  getBoardWidgets(uniqueKey: string): Promise<unknown[]>;
  getBoardDetail<TWidget = unknown>(
    uniqueKey: string,
  ): Promise<PluginBoardDetail<TWidget>>;
  setDependencies(
    uniqueKey: string,
    dependencies: PluginBoardDependency[],
    options?: {
      merge?: boolean;
    },
  ): Promise<PluginBoardDependency[]>;
  addConfigCard(
    uniqueKey: string,
    options?: {
      title?: string;
      type?: string;
      layout?: { x?: number; y?: number; w?: number; h?: number };
      dependencies?: PluginBoardDependency[];
    },
  ): Promise<Record<string, unknown>>;
  saveBoardDetail<TWidget = unknown>(
    uniqueKey: string,
    input: PluginBoardSaveInput<TWidget>,
  ): Promise<PluginBoardDetail<TWidget>>;
  createWidget<T = Record<string, unknown>>(
    uniqueKey: string,
    widget: PluginBoardWidgetInput,
  ): Promise<T>;
  updateWidget<T = Record<string, unknown>>(
    uniqueKey: string,
    widget: PluginBoardWidgetInput,
  ): Promise<T>;
  deleteWidget(uniqueKey: string, widgetId: string): Promise<void>;
}

export interface PluginWidgetBoxBoardApi<TWidget = unknown> {
  loadBoard?: () => Promise<{
    name?: string;
    type?: string;
    widgets?: TWidget[];
  } | null>;
  saveBoard?: (input: PluginBoardSaveInput<TWidget>) => Promise<unknown>;
  createCard?: (widget: PluginBoardWidgetInput) => Promise<unknown>;
  updateCard?: (widget: PluginBoardWidgetInput) => Promise<unknown>;
  deleteCard?: (widgetId: string) => Promise<void>;
}

export interface FlowLike {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  nodes?: unknown[];
  lines?: unknown[];
  zoom?: number;
  zoomType?: string;
  [key: string]: unknown;
}

export interface FlowSummaryItem {
  id: string;
  name?: string;
  description?: string;
  tags?: string[];
  version?: string;
  boardId?: string;
  widgetId?: string;
  widgetType?: string;
  flowType?: string;
  [key: string]: unknown;
}

export interface FlowExecuteInput<TFlow = FlowLike> {
  flowId?: string;
  flow?: TFlow;
  inputs?: Record<string, unknown>;
}

export interface FlowExecuteResult {
  session_id?: string;
  success: boolean;
  outputs: Record<string, unknown>;
  error?: string | null;
  duration_ms?: number;
  execution_path?: string[];
  [key: string]: unknown;
}

export interface FlowApi {
  list(): Promise<FlowSummaryItem[]>;
  get<TFlow = FlowLike>(flowId: string): Promise<TFlow | null>;
  execute<
    TResult extends FlowExecuteResult = FlowExecuteResult,
    TFlow = FlowLike,
  >(
    input: FlowExecuteInput<TFlow>,
  ): Promise<TResult>;
}

export interface ThinkFlowComponentProps<TFlow = FlowLike> {
  flow?: TFlow;
  className?: string;
  minHeight?: number | string;
  showToolbar?: boolean;
  flowToolbar?: Record<string, unknown>;
  flowStyle?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  autoRun?: boolean;
  /**
   * Controls the ordering (and filtering) of node categories shown in the
   * "add node" panel. When omitted, the host uses the Think-card default
   * (`think, logic, flow, ...`). Pass the etlDag order
   * (`logic, flow, inAndOut, spider, data, ...`) to get the data-processing
   * card's add-option order — the `think` and `static` categories will be
   * omitted and `spider` will appear before `data`.
   */
  categoriesSort?: string[];
  onChange?: (flow: TFlow) => void;
  onSave?: (flow: TFlow) => void | Promise<unknown>;
  onEndOutput?: (result: FlowExecuteResult) => void;
}

export interface WidgetConfigCommonApi {
  DisplayBox: unknown;
  DisplayHighLight: unknown;
  WidgetName: unknown;
  DisplayCollapse: unknown;
  PanelDisplay: unknown;
  DisplayMulitHighLightInput: unknown;
  LegendDisplay: unknown;
  GraphTheme: unknown;
  TooltipDisplay: unknown;
  BoxPadding: unknown;
  BoxBordersRadius: unknown;
  BoxBordersWidth: unknown;
  QueryFormatsDisplay: unknown;
  SimpleInputBox: unknown;
  ShowCount: unknown;
  DisplayValues: unknown;
  ChartDisplay: unknown;
  GradientColorsDisplay: unknown;
  ColorationSelector: unknown;
  ChartSort: unknown;
  VMLegendDisplay: unknown;
  FlowToolbarDisplay: unknown;
  FlowStyleDisplay: unknown;
  FlowRunningStyleDisplay: unknown;
  ValidateRulesSelector: unknown;
  InputStyleDisplay: unknown;
  VarNameInput: unknown;
  SelectOptionsDisplay: unknown;
  ModalFooterDisplay: unknown;
  DrawerFooterDisplay: unknown;
  RelateLabelDisplay: unknown;
  AiMarksDisplay: unknown;
}

export interface TimeSelectorProps {
  startTime?: string;
  endTime?: string;
  relativeTime?: string;
  showRefresh?: boolean;
  autoRefresh?: boolean;
  /** Triggered when the user picks a new time range. */
  onUpdateTime: (
    relativeTime: string,
    startTime: string,
    endTime: string,
  ) => void;
}

export interface RemoteComponentsApi {
  PluginWidgetBox: ComponentType<{
    widgets?: unknown[];
    boardId?: string;
    minHeight?: number;
    className?: string;
    boardApi?: PluginWidgetBoxBoardApi;
  }>;
  /** Host think-flow editor/runner for plugin-managed workflow configs. */
  ThinkFlow: ComponentType<ThinkFlowComponentProps>;
  WidgetConfigCommon: WidgetConfigCommonApi;
  /** Host time-range selector for bespoke plugins. */
  TimeSelector: ComponentType<TimeSelectorProps>;
}

// ── Asset Repository ─────────────────────────────────────────

export interface AssetCategory {
  id: string;
  name: string;
  parentId?: string;
  description?: string;
  target_folder: string;
  target_folders?: string[];
  tags?: string[];
}

export interface AssetItem {
  guid: string;
  file_path: string;
  file_type: string;
  file_name: string;
  file_size: number;
  created_at: number;
  updated_at?: number;
  category_id?: string;
  description?: string;
  tags?: string[];
}

export interface AssetListQuery {
  category_id?: string;
  file_type?: string[];
  keyword?: string;
  tags?: string[];
  page?: number;
  page_size?: number;
}

export interface AssetListResult {
  list: AssetItem[];
  total: number;
}

export interface AssetUploadInput {
  category_id: string;
  target_folder?: string;
  file: File | Blob;
  filename?: string;
}

export interface AssetPasteInput {
  category_id: string;
  target_folder?: string;
}

export interface AssetCreateFolderInput {
  category_id: string;
  target_folder?: string;
  folder_name: string;
}

export interface AssetUpdateInput {
  description?: string;
  tags?: string[];
}

export interface AssetRevision {
  revision: number;
}

/**
 * Asset repository API — exposes the host's resource library
 * (`/app/asset/*` endpoints) to bespoke plugins so they can list, upload,
 * rename, move, and otherwise manage asset files inside host-configured
 * category folders.
 */
export interface AssetApi {
  /** List all configured asset categories. */
  listCategories(): Promise<AssetCategory[]>;
  /** Create or update a category. If `id` is empty, a new category is created. */
  saveCategory(category: Partial<AssetCategory>): Promise<AssetCategory>;
  /** Delete a category by id. */
  deleteCategory(id: string): Promise<void>;
  /** Paginated, filtered list of assets. */
  list(query: AssetListQuery): Promise<AssetListResult>;
  /** Upload a file into a category folder. */
  upload(input: AssetUploadInput): Promise<void>;
  /** Force re-sync of the asset index (optionally for a single category). */
  refresh(category_id?: string): Promise<AssetRevision>;
  /** Get current revision counter (use for change detection polling). */
  getRevision(category_id?: string): Promise<AssetRevision>;
  /** Delete an asset by guid. */
  delete(guid: string): Promise<void>;
  /** Rename an asset file. */
  rename(guid: string, new_name: string): Promise<void>;
  /** Update asset metadata (description, tags). */
  update(guid: string, payload: AssetUpdateInput): Promise<void>;
  /** Copy an asset to the clipboard. */
  copy(guid: string): Promise<void>;
  /** Cut an asset to the clipboard. */
  cut(guid: string): Promise<void>;
  /** Paste clipboard contents into a category folder. */
  paste(input: AssetPasteInput): Promise<{ copied: number }>;
  /** Create a new subfolder inside a category folder. */
  createFolder(input: AssetCreateFolderInput): Promise<void>;
  /** Move an asset to a different folder. */
  move(guid: string, target_folder: string): Promise<void>;
  /**
   * Build an absolute URL that streams the asset file. Suitable for use as
   * `<img src>` / `<video src>` etc.
   */
  previewUrl(filePath: string): string;
}

export interface FatNotesPluginSDK {
  host: HostInfo;
  pluginId: string;
  auth: AuthApi;
  dataSource: DataSourceApi;
  query: QueryApi;
  mutation: MutationApi;
  ui: UiApi;
  commands: CommandsApi;
  store: StoreApi;
  contributions: ContributionsApi;
  events: EventsApi;
  /** Backend API — only functional if plugin has `backend.enabled: true`. */
  backend: BackendApi;
  /** Per-plugin runtime config stored by host (`confs/bespokePlugins.json`). */
  config: PluginConfigApi;
  /** Host workflow list/read/execute APIs. */
  flow: FlowApi;
  /** Per-plugin board configs stored under `confs/boards/<uniqueKey>/`. */
  boards: PluginBoardsApi;
  /** Host remote components available to bespoke plugins. */
  remoteComponents: RemoteComponentsApi;
  /** Host AI models and chat completion. */
  ai: AiApi;
  /** Host asset repository (categories + files). */
  asset: AssetApi;
}

export interface PluginModule {
  activate(sdk: FatNotesPluginSDK): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
