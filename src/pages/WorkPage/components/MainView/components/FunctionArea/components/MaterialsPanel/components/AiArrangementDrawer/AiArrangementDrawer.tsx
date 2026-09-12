import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Drawer,
  Dropdown,
  Empty,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import type { MenuProps } from "antd";
import type { AssetItem } from "fat-notes-sdk";
import { useI18n, useSdk } from "hooks";
import { Icon, IconButton } from "components";
import { editorStore, playbackStore, useEditorStore } from "reducers";
import {
  FILTER_CATEGORIES,
  TRANSITION_CATEGORIES,
  createClipNode,
  createFilterNode,
  createTransitionNode,
  extractJsonPayload,
  findArrangementToolIds,
  getTimelineEnd,
  normalizeArrangementGraph,
  parseAssetDescription,
  pickDefaultAiModel,
  removeGraphNode,
  replaceGraphNode,
} from "utils";
import LiteGraphEditor from "./components/LiteGraphEditor/LiteGraphEditor";
import styles from "./AiArrangementDrawer.less";

interface AiArrangementDrawerProps {
  open: boolean;
  onClose: () => void;
  assets: AssetItem[];
}

interface AiArrangementSnapshot {
  name?: string;
  prompt: string;
  arrangement?: Cut.AiArrangementResult;
  planningAssets: Cut.AiPlanningAsset[];
  selectedNodeId?: string;
  statusHint?: string;
  updatedAt: string;
}

interface AiArrangementBackup extends AiArrangementSnapshot {
  id: string;
  name: string;
  createdAt: string;
}

interface AiArrangementProjectConfig {
  current?: AiArrangementSnapshot;
  backups: AiArrangementBackup[];
}

interface AiArrangementPluginConfig {
  aiModelId?: string;
  aiArrangementConfigs?: Record<string, AiArrangementProjectConfig>;
}

interface SavedArrangementOption {
  label: string;
  value: string;
  itemType: "draft" | "backup";
}

const AI_ARRANGEMENT_CONFIG_KEY = "aiArrangementConfigs";

const genSavedArrangementId = () => {
  return `arrangement-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const sortBackups = (backups: AiArrangementBackup[]) => {
  return [...backups].sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
};

const normalizeProjectConfig = (
  config?: AiArrangementProjectConfig,
): AiArrangementProjectConfig => {
  return {
    current: config?.current,
    backups: sortBackups(config?.backups ?? []),
  };
};

const formatSavedTime = (value?: string) => {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
};

const trimSavedName = (value: string, maxLength = 18) => {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
};

const createArrangementSnapshot = ({
  name,
  prompt,
  arrangement,
  planningAssets,
  selectedNodeId,
  statusHint,
}: {
  name?: string;
  prompt: string;
  arrangement?: Cut.AiArrangementResult;
  planningAssets: Cut.AiPlanningAsset[];
  selectedNodeId?: string;
  statusHint?: string;
}): Omit<AiArrangementSnapshot, "updatedAt"> | undefined => {
  const nextPrompt = prompt.trim();
  const nextPlanningAssets =
    planningAssets.length > 0
      ? planningAssets
      : (arrangement?.usedAssets ?? []);
  const nextArrangement = arrangement
    ? {
        ...arrangement,
        prompt,
        graph: normalizeArrangementGraph(arrangement.graph),
        usedAssets:
          arrangement.usedAssets.length > 0
            ? arrangement.usedAssets
            : nextPlanningAssets,
      }
    : undefined;
  if (!nextPrompt && !nextArrangement && nextPlanningAssets.length === 0) {
    return undefined;
  }
  return {
    name,
    prompt,
    arrangement: nextArrangement,
    planningAssets: nextPlanningAssets,
    selectedNodeId,
    statusHint,
  };
};

const isSameSnapshotContent = (
  existing: AiArrangementSnapshot | undefined,
  next: Omit<AiArrangementSnapshot, "updatedAt"> | undefined,
) => {
  if (!existing && !next) {
    return true;
  }
  if (!existing || !next) {
    return false;
  }
  return (
    existing.name === next.name &&
    existing.prompt === next.prompt &&
    existing.selectedNodeId === next.selectedNodeId &&
    existing.statusHint === next.statusHint &&
    JSON.stringify(existing.arrangement ?? null) ===
      JSON.stringify(next.arrangement ?? null) &&
    JSON.stringify(existing.planningAssets) ===
      JSON.stringify(next.planningAssets)
  );
};

const createEmptyArrangement = (
  prompt: string,
  usedAssets: Cut.AiPlanningAsset[],
  summary: string,
): Cut.AiArrangementResult => ({
  prompt,
  summary,
  warnings: [],
  graph: normalizeArrangementGraph(),
  timeline: {
    tracks: [],
    filterClips: [],
    duration: 0,
  },
  usedAssets,
});

const inferClipType = (fileType: string): Cut.ClipType => {
  if (fileType.startsWith("audio/")) {
    return "audio";
  }
  if (fileType.startsWith("image/")) {
    return "image";
  }
  return "video";
};

const AiArrangementDrawer: React.FC<AiArrangementDrawerProps> = ({
  open,
  onClose,
  assets,
}) => {
  const sdk = useSdk();
  const { text } = useI18n();
  const { project } = useEditorStore();
  const [prompt, setPrompt] = useState("");
  const [arrangement, setArrangement] = useState<Cut.AiArrangementResult>();
  const [planningAssets, setPlanningAssets] = useState<Cut.AiPlanningAsset[]>(
    [],
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [statusHint, setStatusHint] = useState<string>();
  const [savedProjectConfig, setSavedProjectConfig] =
    useState<AiArrangementProjectConfig>({
      backups: [],
    });
  const [selectedSavedKey, setSelectedSavedKey] = useState<string>();
  const [configReadyProjectId, setConfigReadyProjectId] = useState<string>();
  const probeCacheRef = useRef<Map<string, Cut.AiPlanningAsset>>(new Map());
  const isHydratingConfigRef = useRef(false);

  const transitionOptions = useMemo(
    () =>
      TRANSITION_CATEGORIES.flatMap((category) =>
        category.transitions.map((transition) => ({
          label: text(transition.nameKey),
          value: transition.id,
        })),
      ),
    [text],
  );

  const filterOptions = useMemo(
    () =>
      FILTER_CATEGORIES.flatMap((category) =>
        category.filters.map((filter) => ({
          label: text(filter.nameKey),
          value: filter.id,
        })),
      ),
    [text],
  );

  const clipNodes = useMemo(
    () =>
      arrangement?.graph.nodes.filter((node) => node.nodeType === "clip") ?? [],
    [arrangement],
  );

  const selectedNode = useMemo(
    () => arrangement?.graph.nodes.find((node) => node.id === selectedNodeId),
    [arrangement, selectedNodeId],
  );

  const applySavedSnapshot = useCallback((snapshot?: AiArrangementSnapshot) => {
    setPrompt(snapshot?.prompt ?? "");
    setArrangement(
      snapshot?.arrangement
        ? {
            ...snapshot.arrangement,
            graph: normalizeArrangementGraph(snapshot.arrangement.graph),
          }
        : undefined,
    );
    setPlanningAssets(
      snapshot?.planningAssets ?? snapshot?.arrangement?.usedAssets ?? [],
    );
    setSelectedNodeId(snapshot?.selectedNodeId);
    setStatusHint(snapshot?.statusHint);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!project?.id) {
      setConfigReadyProjectId(undefined);
      setSavedProjectConfig({ backups: [] });
      setSelectedSavedKey(undefined);
      applySavedSnapshot(undefined);
      return;
    }
    isHydratingConfigRef.current = true;
    void sdk.config
      .get<AiArrangementPluginConfig>()
      .then((config) => {
        if (cancelled) {
          return;
        }
        const nextProjectConfig = normalizeProjectConfig(
          config?.[AI_ARRANGEMENT_CONFIG_KEY]?.[project.id],
        );
        setSavedProjectConfig(nextProjectConfig);
        setSelectedSavedKey(
          nextProjectConfig.current
            ? "draft"
            : nextProjectConfig.backups[0]
              ? `backup:${nextProjectConfig.backups[0].id}`
              : undefined,
        );
        applySavedSnapshot(nextProjectConfig.current);
        setConfigReadyProjectId(project.id);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setSavedProjectConfig({ backups: [] });
        setSelectedSavedKey(undefined);
        applySavedSnapshot(undefined);
        setConfigReadyProjectId(project.id);
      })
      .finally(() => {
        if (!cancelled) {
          isHydratingConfigRef.current = false;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applySavedSnapshot, project?.id, sdk.config]);

  useEffect(() => {
    if (!project?.id || configReadyProjectId !== project.id) {
      return;
    }
    if (isHydratingConfigRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      const nextSnapshot = createArrangementSnapshot({
        name: savedProjectConfig.current?.name,
        prompt,
        arrangement,
        planningAssets,
        selectedNodeId,
        statusHint,
      });
      setSavedProjectConfig((prev) => {
        if (isSameSnapshotContent(prev.current, nextSnapshot)) {
          return prev;
        }
        return {
          ...prev,
          current: nextSnapshot
            ? {
                ...nextSnapshot,
                name: prev.current?.name,
                updatedAt: new Date().toISOString(),
              }
            : undefined,
        };
      });
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [
    arrangement,
    configReadyProjectId,
    planningAssets,
    project?.id,
    prompt,
    selectedNodeId,
    statusHint,
  ]);

  useEffect(() => {
    if (!project?.id || configReadyProjectId !== project.id) {
      return;
    }
    const timer = window.setTimeout(() => {
      void sdk.config
        .get<AiArrangementPluginConfig>()
        .then((config) => {
          const currentConfigs = config?.[AI_ARRANGEMENT_CONFIG_KEY] ?? {};
          const nextConfigs = { ...currentConfigs };
          const normalizedProjectConfig =
            normalizeProjectConfig(savedProjectConfig);
          if (
            normalizedProjectConfig.current ||
            normalizedProjectConfig.backups.length > 0
          ) {
            nextConfigs[project.id] = normalizedProjectConfig;
          } else {
            delete nextConfigs[project.id];
          }
          return sdk.config.set(
            { [AI_ARRANGEMENT_CONFIG_KEY]: nextConfigs },
            { merge: true },
          );
        })
        .catch((error) => {
          console.error(error);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [configReadyProjectId, project?.id, savedProjectConfig, sdk.config]);

  useEffect(() => {
    if (!selectedNodeId || !arrangement) {
      return;
    }
    const exists = arrangement.graph.nodes.some(
      (node) => node.id === selectedNodeId,
    );
    if (!exists) {
      setSelectedNodeId(undefined);
    }
  }, [arrangement, selectedNodeId]);

  const getPlanningAssets = useCallback(async () => {
    const results = await Promise.all(
      assets.map(async (item) => {
        const cached = probeCacheRef.current.get(item.guid);
        if (cached) {
          return cached;
        }
        const parsed = parseAssetDescription(item.description);
        try {
          const probed = await sdk.backend.invoke<Cut.ProbeAssetResult>(
            "probeAsset",
            { filePath: item.file_path },
          );
          const nextAsset: Cut.AiPlanningAsset = {
            guid: item.guid,
            filePath: item.file_path,
            fileName: item.file_name,
            fileType: item.file_type,
            description: parsed.description,
            tags: item.tags ?? [],
            duration:
              probed?.duration ?? (item.file_type.startsWith("image/") ? 3 : 5),
            width: probed?.width,
            height: probed?.height,
            clipInfos: parsed.clipInfos,
          };
          probeCacheRef.current.set(item.guid, nextAsset);
          return nextAsset;
        } catch {
          const fallbackAsset: Cut.AiPlanningAsset = {
            guid: item.guid,
            filePath: item.file_path,
            fileName: item.file_name,
            fileType: item.file_type,
            description: parsed.description,
            tags: item.tags ?? [],
            duration: item.file_type.startsWith("image/") ? 3 : 5,
            clipInfos: parsed.clipInfos,
          };
          probeCacheRef.current.set(item.guid, fallbackAsset);
          return fallbackAsset;
        }
      }),
    );
    setPlanningAssets(results);
    return results;
  }, [assets, sdk.backend]);

  const updateArrangementGraph = useCallback(
    (updater: (graph: Cut.AiArrangementGraph) => Cut.AiArrangementGraph) => {
      setArrangement((prev) =>
        prev
          ? {
              ...prev,
              graph: updater(prev.graph),
            }
          : prev,
      );
    },
    [],
  );

  const ensureDraftArrangement = useCallback(
    async (summaryKey: string) => {
      const nextPlanningAssets =
        planningAssets.length > 0 ? planningAssets : await getPlanningAssets();
      const nextArrangement =
        arrangement ??
        createEmptyArrangement(prompt, nextPlanningAssets, text(summaryKey));
      setArrangement(nextArrangement);
      return nextArrangement;
    },
    [arrangement, getPlanningAssets, planningAssets, prompt, text],
  );

  const handleGenerate = useCallback(async () => {
    if (!project) {
      sdk.ui.toast.warn(text("cut.ai.noProject"));
      return;
    }
    if (!prompt.trim()) {
      sdk.ui.toast.warn(text("cut.ai.noPrompt"));
      return;
    }
    const nextPlanningAssets = await getPlanningAssets();
    if (nextPlanningAssets.length === 0) {
      sdk.ui.toast.warn(text("cut.ai.noAssets"));
      return;
    }
    setGenerating(true);
    try {
      let plan: Cut.AiArrangementPlan | undefined;
      let nextStatusHint = text("cut.ai.modelFallback");
      try {
        const config = await sdk.config.get<Cut.AiConfig>();
        const models = await sdk.ai.getModels();
        const model = pickDefaultAiModel(models, config?.aiModelId);
        if (model) {
          const tools = findArrangementToolIds(await sdk.ai.getMcpTools());
          const aiResult = await sdk.ai.chat({
            modelId: model.id,
            messages: [
              {
                role: "user",
                content: JSON.stringify(
                  {
                    prompt,
                    assets: nextPlanningAssets,
                  },
                  null,
                  2,
                ),
              },
            ],
            sysPrompt:
              '你是 fat-cut 的 AI 剪辑编排助手。请根据用户提示词和素材列表，返回严格 JSON，不要 markdown。格式为 {"summary":string,"segments":[{"assetGuid":string,"title":string,"reason":string,"duration":number,"sourceIn":number,"sourceOut":number,"trackType":"video"|"audio","trackIndex":number,"timelineIn":number,"transitionType"?:string,"transitionDuration"?:number,"filterType"?:string,"filterDuration"?:number}] }。优先使用素材 description、tags、fileName 以及 clipInfos（视频/音频的分段描述，含 startTime、endTime、content、usage）进行镜头规划。当素材有 clipInfos 时，应优先从中挑选与提示词匹配的片段，sourceIn/sourceOut 使用 clipInfo 的 startTime/endTime。',
            toolIds: tools.length > 0 ? tools : undefined,
            autoMcp: tools.length > 0,
            maxIterations: tools.length > 0 ? 6 : 2,
          });
          const parsed = extractJsonPayload(aiResult.content);
          if (parsed && typeof parsed === "object") {
            plan = parsed as Cut.AiArrangementPlan;
          }
          nextStatusHint =
            tools.length > 0
              ? text("cut.ai.mcpUsed", {
                  model: model.name,
                  count: tools.length,
                })
              : text("cut.ai.modelUsed", { model: model.name });
        }
      } catch (error) {
        nextStatusHint = text("cut.ai.modelFallback");
        console.error(error);
      }

      const result = await sdk.backend.invoke<Cut.AiArrangementResult>(
        "generateClipArrangementConfig",
        {
          prompt,
          assets: nextPlanningAssets,
          plan,
          project,
        },
      );
      const normalizedGraph = normalizeArrangementGraph(result.graph);
      const nextArrangement = {
        ...result,
        graph: normalizedGraph,
      };
      setArrangement(nextArrangement);
      setSelectedNodeId(
        normalizedGraph.nodes.find((node) => node.nodeType === "clip")?.id,
      );
      setStatusHint(nextStatusHint);
      sdk.ui.toast.success(text("cut.ai.generateSuccess"));
    } catch (error) {
      sdk.ui.toast.error(
        text("cut.ai.generateFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setGenerating(false);
    }
  }, [getPlanningAssets, project, prompt, sdk, text]);

  const handleApplyTimeline = useCallback(async () => {
    if (!arrangement?.graph) {
      sdk.ui.toast.warn(text("cut.ai.noArrangement"));
      return;
    }
    setApplying(true);
    try {
      const timeline = await sdk.backend.invoke<Cut.AiTimelineBuildResult>(
        "buildClipArrangementTimeline",
        {
          graph: arrangement.graph,
        },
      );
      editorStore.updateProject({
        tracks: timeline.tracks,
        filterClips: timeline.filterClips,
      });
      playbackStore.seek(0);
      playbackStore.setDuration(
        timeline.duration || getTimelineEnd(timeline.tracks),
      );
      sdk.ui.toast.success(text("cut.ai.applySuccess"));
    } catch (error) {
      sdk.ui.toast.error(
        text("cut.ai.applyFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setApplying(false);
    }
  }, [arrangement, sdk.ui.toast, text]);

  const handleAddClipNode = useCallback(async () => {
    const nextArrangement = await ensureDraftArrangement(
      "cut.ai.manualSummary",
    );
    const asset = planningAssets[0] ?? nextArrangement.usedAssets[0];
    const nextNode = createClipNode(asset);
    nextNode.data.order = clipNodes.length;
    nextNode.data.trackType =
      inferClipType(nextNode.data.fileType ?? "") === "audio"
        ? "audio"
        : "video";
    updateArrangementGraph((graph) =>
      normalizeArrangementGraph({
        nodes: [...graph.nodes, nextNode],
        edges: graph.edges,
      }),
    );
    setSelectedNodeId(nextNode.id);
  }, [
    clipNodes.length,
    ensureDraftArrangement,
    planningAssets,
    updateArrangementGraph,
  ]);

  const handleAddFilterNode = useCallback(async () => {
    const nextArrangement = await ensureDraftArrangement(
      "cut.ai.manualSummary",
    );
    const clipId =
      selectedNode?.nodeType === "clip"
        ? selectedNode.id
        : nextArrangement.graph.nodes.find((node) => node.nodeType === "clip")
            ?.id;
    const nextNode = createFilterNode(clipId);
    updateArrangementGraph((graph) =>
      normalizeArrangementGraph({
        nodes: [...graph.nodes, nextNode],
        edges: graph.edges,
      }),
    );
    setSelectedNodeId(nextNode.id);
  }, [ensureDraftArrangement, selectedNode, updateArrangementGraph]);

  const handleAddTransitionNode = useCallback(async () => {
    const nextArrangement = await ensureDraftArrangement(
      "cut.ai.manualSummary",
    );
    const clipId =
      selectedNode?.nodeType === "clip"
        ? selectedNode.id
        : nextArrangement.graph.nodes.find((node) => node.nodeType === "clip")
            ?.id;
    const nextNode = createTransitionNode(clipId);
    updateArrangementGraph((graph) =>
      normalizeArrangementGraph({
        nodes: [...graph.nodes, nextNode],
        edges: graph.edges,
      }),
    );
    setSelectedNodeId(nextNode.id);
  }, [ensureDraftArrangement, selectedNode, updateArrangementGraph]);

  const handleDeleteNode = useCallback(() => {
    if (
      !arrangement ||
      !selectedNode ||
      selectedNode.nodeType === "start" ||
      selectedNode.nodeType === "end"
    ) {
      return;
    }
    updateArrangementGraph((graph) => removeGraphNode(graph, selectedNode.id));
    setSelectedNodeId(undefined);
  }, [arrangement, selectedNode, updateArrangementGraph]);

  const handleNodeChange = useCallback(
    (patch: Partial<Cut.AiArrangementNode>) => {
      if (!arrangement || !selectedNode) {
        return;
      }
      const nextNode = {
        ...selectedNode,
        ...patch,
        data: {
          ...selectedNode.data,
          ...(patch.data ?? {}),
        },
      };
      updateArrangementGraph((graph) => replaceGraphNode(graph, nextNode));
    },
    [arrangement, selectedNode, updateArrangementGraph],
  );

  const handleAssetChange = useCallback(
    (assetGuid: string) => {
      const asset = planningAssets.find((item) => item.guid === assetGuid);
      if (!asset || !selectedNode) {
        return;
      }
      handleNodeChange({
        title: asset.fileName,
        subtitle: asset.description,
        data: {
          ...selectedNode.data,
          assetGuid: asset.guid,
          filePath: asset.filePath,
          fileName: asset.fileName,
          fileType: asset.fileType,
          clipType: inferClipType(asset.fileType),
          trackType:
            inferClipType(asset.fileType) === "audio" ? "audio" : "video",
          duration: asset.duration,
          sourceOut: asset.duration,
          tags: asset.tags,
        },
      });
    },
    [handleNodeChange, planningAssets, selectedNode],
  );

  const nodeTypeTag = useMemo(() => {
    if (!selectedNode) {
      return null;
    }
    const colorMap: Record<Cut.AiArrangementNodeType, string> = {
      start: "green",
      clip: "blue",
      transition: "purple",
      filter: "orange",
      end: "cyan",
    };
    return (
      <Tag color={colorMap[selectedNode.nodeType]}>
        {text(`cut.ai.nodeType.${selectedNode.nodeType}`)}
      </Tag>
    );
  }, [selectedNode, text]);

  const getMenuOptions = useCallback(
    (nodeId?: string) => {
      const options: { label: string; onClick: () => void }[] = [
        {
          label: text("cut.ai.addClipNode"),
          onClick: () => void handleAddClipNode(),
        },
        {
          label: text("cut.ai.addFilterNode"),
          onClick: () => void handleAddFilterNode(),
        },
        {
          label: text("cut.ai.addTransitionNode"),
          onClick: () => void handleAddTransitionNode(),
        },
      ];

      const targetNode = arrangement?.graph.nodes.find((n) => n.id === nodeId);
      if (
        targetNode &&
        targetNode.nodeType !== "start" &&
        targetNode.nodeType !== "end"
      ) {
        options.push({
          label: text("cut.ai.deleteNode"),
          onClick: () => {
            updateArrangementGraph((graph) =>
              removeGraphNode(graph, targetNode.id),
            );
            if (selectedNodeId === targetNode.id) {
              setSelectedNodeId(undefined);
            }
          },
        });
      }
      return options;
    },
    [
      arrangement,
      handleAddClipNode,
      handleAddFilterNode,
      handleAddTransitionNode,
      selectedNodeId,
      text,
      updateArrangementGraph,
    ],
  );

  const addNodeItems = useMemo<MenuProps["items"]>(
    () => [
      {
        key: "clip",
        label: text("cut.ai.addClipNode"),
        onClick: () => void handleAddClipNode(),
      },
      {
        key: "filter",
        label: text("cut.ai.addFilterNode"),
        onClick: () => void handleAddFilterNode(),
      },
      {
        key: "transition",
        label: text("cut.ai.addTransitionNode"),
        onClick: () => void handleAddTransitionNode(),
      },
    ],
    [handleAddClipNode, handleAddFilterNode, handleAddTransitionNode, text],
  );

  const savedArrangementOptions = useMemo<SavedArrangementOption[]>(() => {
    const options: SavedArrangementOption[] = [];
    if (savedProjectConfig.current) {
      options.push({
        label: `${savedProjectConfig.current.name || text("cut.ai.currentDraft")} · ${text("cut.ai.autoSaved")} · ${formatSavedTime(savedProjectConfig.current.updatedAt)}`,
        value: "draft",
        itemType: "draft",
      });
    }
    savedProjectConfig.backups.forEach((item) => {
      options.push({
        label: `${item.name} · ${formatSavedTime(item.updatedAt)}`,
        value: `backup:${item.id}`,
        itemType: "backup",
      });
    });
    return options;
  }, [savedProjectConfig, text]);

  const selectedSavedSnapshot = useMemo(() => {
    if (!selectedSavedKey) {
      return undefined;
    }
    if (selectedSavedKey === "draft") {
      return savedProjectConfig.current;
    }
    const backupId = selectedSavedKey.replace("backup:", "");
    return savedProjectConfig.backups.find((item) => item.id === backupId);
  }, [savedProjectConfig, selectedSavedKey]);

  const handleLoadSavedArrangement = useCallback(() => {
    if (!selectedSavedSnapshot) {
      sdk.ui.toast.warn(text("cut.ai.noSavedSelection"));
      return;
    }
    applySavedSnapshot(selectedSavedSnapshot);
    sdk.ui.toast.success(text("cut.ai.loadSavedSuccess"));
  }, [applySavedSnapshot, sdk.ui.toast, selectedSavedSnapshot, text]);

  const handleRenameSavedArrangement = useCallback(
    (targetKey: string) => {
      const targetDraft =
        targetKey === "draft" ? savedProjectConfig.current : undefined;
      const targetBackup = targetKey.startsWith("backup:")
        ? savedProjectConfig.backups.find(
            (item) => item.id === targetKey.replace("backup:", ""),
          )
        : undefined;
      const fallbackName = targetDraft?.name || text("cut.ai.currentDraft");
      const nextName = window
        .prompt(text("cut.ai.renamePrompt"), targetBackup?.name || fallbackName)
        ?.trim();
      if (!nextName) {
        return;
      }
      const updatedAt = new Date().toISOString();
      setSavedProjectConfig((prev) => ({
        ...prev,
        current:
          targetKey === "draft" && prev.current
            ? {
                ...prev.current,
                name: nextName,
                updatedAt,
              }
            : prev.current,
        backups: sortBackups(
          prev.backups.map((item) =>
            item.id === targetBackup?.id
              ? {
                  ...item,
                  name: nextName,
                  updatedAt,
                }
              : item,
          ),
        ),
      }));
      sdk.ui.toast.success(text("cut.ai.renameSuccess"));
    },
    [
      savedProjectConfig.backups,
      savedProjectConfig.current,
      sdk.ui.toast,
      text,
    ],
  );

  const handleDeleteSavedArrangement = useCallback(
    (targetKey: string) => {
      const deletingDraft = targetKey === "draft";
      const confirmed = window.confirm(
        text(
          deletingDraft
            ? "cut.ai.deleteDraftConfirm"
            : "cut.ai.deleteBackupConfirm",
        ),
      );
      if (!confirmed) {
        return;
      }
      if (deletingDraft) {
        setSavedProjectConfig((prev) => ({
          ...prev,
          current: undefined,
        }));
        setSelectedSavedKey(
          savedProjectConfig.backups[0]
            ? `backup:${savedProjectConfig.backups[0].id}`
            : undefined,
        );
        applySavedSnapshot(undefined);
      } else {
        const targetBackup = savedProjectConfig.backups.find(
          (item) => item.id === targetKey.replace("backup:", ""),
        );
        if (!targetBackup) {
          return;
        }
        const remainingBackups = savedProjectConfig.backups.filter(
          (item) => item.id !== targetBackup.id,
        );
        setSavedProjectConfig((prev) => ({
          ...prev,
          backups: prev.backups.filter((item) => item.id !== targetBackup.id),
        }));
        if (selectedSavedKey === targetKey) {
          setSelectedSavedKey(
            savedProjectConfig.current
              ? "draft"
              : remainingBackups[0]
                ? `backup:${remainingBackups[0].id}`
                : undefined,
          );
        }
      }
      sdk.ui.toast.success(text("cut.ai.deleteSavedSuccess"));
    },
    [
      applySavedSnapshot,
      savedProjectConfig.backups,
      savedProjectConfig.current,
      sdk.ui.toast,
      selectedSavedKey,
      text,
    ],
  );

  const handleBackupArrangement = useCallback(() => {
    if (!arrangement) {
      sdk.ui.toast.warn(text("cut.ai.noArrangement"));
      return;
    }
    const nextSnapshot = createArrangementSnapshot({
      prompt,
      arrangement,
      planningAssets,
      selectedNodeId,
      statusHint,
    });
    if (!nextSnapshot) {
      sdk.ui.toast.warn(text("cut.ai.noArrangement"));
      return;
    }
    const now = new Date().toISOString();
    const baseName =
      arrangement.summary.trim() ||
      prompt.trim() ||
      text("cut.ai.backupNameFallback");
    const backup: AiArrangementBackup = {
      ...nextSnapshot,
      id: genSavedArrangementId(),
      name: `${trimSavedName(baseName)} · ${formatSavedTime(now)}`,
      createdAt: now,
      updatedAt: now,
    };
    setSavedProjectConfig((prev) => ({
      ...prev,
      current: prev.current
        ? prev.current
        : {
            ...nextSnapshot,
            updatedAt: now,
          },
      backups: sortBackups([backup, ...prev.backups]).slice(0, 50),
    }));
    setSelectedSavedKey(`backup:${backup.id}`);
    sdk.ui.toast.success(text("cut.ai.backupSuccess"));
  }, [
    arrangement,
    planningAssets,
    prompt,
    sdk.ui.toast,
    selectedNodeId,
    statusHint,
    text,
  ]);

  return (
    <Drawer
      width={1200}
      title={text("cut.ai.title")}
      open={open}
      onClose={onClose}
      destroyOnClose={false}
      className={styles.drawer}
    >
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.promptBox}>
            <div className={styles.promptHeader}>
              <div className={styles.sectionLabel}>
                {text("cut.ai.promptLabel")}
              </div>
              <Button
                size="small"
                type="primary"
                loading={generating}
                onClick={() => void handleGenerate()}
              >
                {text("cut.ai.generate")}
              </Button>
            </div>
            <Input.TextArea
              value={prompt}
              rows={3}
              placeholder={text("cut.ai.promptPlaceholder")}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </div>
        </div>

        <div className={styles.infoRow}>
          <div className={styles.summaryBlock}>
            <Typography.Text strong>{text("cut.ai.summary")}</Typography.Text>
            <Space className={styles.summaryActions} size={12}>
              <Dropdown menu={{ items: addNodeItems }} trigger={["hover"]}>
                <span>
                  <IconButton type={"icon"} size={24}>
                    <PlusOutlined />
                  </IconButton>
                </span>
              </Dropdown>
            </Space>
          </div>
          <Space className={styles.savedActions} size={6} wrap>
            <Button
              size="small"
              type="primary"
              style={{ marginRight: 24 }}
              loading={applying}
              onClick={() => void handleApplyTimeline()}
            >
              {text("cut.ai.applyTimeline")}
            </Button>
            <Typography.Text className={styles.savedLabel}>
              {text("cut.ai.arrangementList")}
            </Typography.Text>
            <Select
              size="small"
              className={styles.savedSelect}
              value={selectedSavedKey}
              placeholder={text("cut.ai.savedEmpty")}
              options={savedArrangementOptions}
              onChange={setSelectedSavedKey}
              disabled={savedArrangementOptions.length === 0}
              optionRender={(option) => {
                const item = savedArrangementOptions.find(
                  (savedOption) => savedOption.value === String(option.value),
                );
                if (!item) {
                  return option.label;
                }
                return (
                  <div className={styles.savedOption}>
                    <span className={styles.savedOptionLabel}>
                      {item.label}
                    </span>
                    <span className={styles.savedOptionActions}>
                      <button
                        type="button"
                        className={styles.optionIconButton}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleRenameSavedArrangement(item.value);
                        }}
                      >
                        <EditOutlined />
                      </button>
                      <button
                        type="button"
                        className={styles.optionIconButton}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleDeleteSavedArrangement(item.value);
                        }}
                      >
                        <DeleteOutlined />
                      </button>
                    </span>
                  </div>
                );
              }}
            />
            <Button
              size="small"
              onClick={handleLoadSavedArrangement}
              disabled={!selectedSavedSnapshot}
            >
              {text("cut.ai.loadArrangement")}
            </Button>
            <Button
              size="small"
              onClick={handleBackupArrangement}
              disabled={!arrangement}
            >
              {text("cut.ai.backupArrangement")}
            </Button>
          </Space>
        </div>

        {statusHint && (
          <Alert
            className={styles.alert}
            type="info"
            showIcon
            title={statusHint}
          />
        )}

        {!!arrangement?.warnings?.length && (
          <Alert
            className={styles.alert}
            type="warning"
            showIcon
            title={text("cut.ai.warnings")}
            description={arrangement.warnings.join("；")}
          />
        )}

        <div className={styles.content}>
          <div className={styles.graphPanel}>
            {arrangement ? (
              <LiteGraphEditor
                graph={arrangement.graph}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                getMenuOptions={getMenuOptions}
                onGraphChange={(graph) =>
                  setArrangement((prev) =>
                    prev
                      ? {
                          ...prev,
                          graph: normalizeArrangementGraph(graph),
                        }
                      : prev,
                  )
                }
              />
            ) : (
              <div className={styles.emptyWrap}>
                <Empty description={text("cut.ai.graphEmpty")} />
              </div>
            )}
          </div>

          <div className={styles.inspector}>
            <div className={styles.sectionLabel}>
              {text("cut.ai.nodeInspector")}
            </div>
            {!selectedNode ? (
              <div className={styles.emptyInspector}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={text("cut.ai.selectNode")}
                />
              </div>
            ) : (
              <div className={styles.form}>
                <div className={styles.row}>
                  <span className={styles.fieldLabel}>
                    {text("cut.ai.nodeType")}
                  </span>
                  <div>{nodeTypeTag}</div>
                </div>
                <div className={styles.row}>
                  <span className={styles.fieldLabel}>
                    {text("cut.ai.nodeTitle")}
                  </span>
                  <Input
                    value={selectedNode.title}
                    onChange={(event) =>
                      handleNodeChange({ title: event.target.value })
                    }
                  />
                </div>
                <div className={styles.row}>
                  <span className={styles.fieldLabel}>
                    {text("cut.ai.nodeSubtitle")}
                  </span>
                  <Input.TextArea
                    rows={2}
                    value={selectedNode.subtitle}
                    onChange={(event) =>
                      handleNodeChange({ subtitle: event.target.value })
                    }
                  />
                </div>

                {selectedNode.nodeType === "clip" && (
                  <>
                    <div className={styles.row}>
                      <span className={styles.fieldLabel}>
                        {text("cut.ai.asset")}
                      </span>
                      <Select
                        showSearch
                        optionFilterProp="label"
                        value={selectedNode.data.assetGuid}
                        options={planningAssets.map((asset) => ({
                          label: asset.fileName,
                          value: asset.guid,
                        }))}
                        onChange={handleAssetChange}
                      />
                    </div>
                    <div className={styles.row}>
                      <span className={styles.fieldLabel}>
                        {text("cut.ai.nodeReason")}
                      </span>
                      <Input.TextArea
                        rows={2}
                        value={selectedNode.data.reason}
                        onChange={(event) =>
                          handleNodeChange({
                            data: {
                              ...selectedNode.data,
                              reason: event.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div className={styles.twoCols}>
                      <div className={styles.row}>
                        <span className={styles.fieldLabel}>
                          {text("cut.ai.order")}
                        </span>
                        <InputNumber
                          min={0}
                          value={selectedNode.data.order}
                          onChange={(value) =>
                            handleNodeChange({
                              data: {
                                ...selectedNode.data,
                                order: Number(value ?? 0),
                              },
                            })
                          }
                        />
                      </div>
                      <div className={styles.row}>
                        <span className={styles.fieldLabel}>
                          {text("cut.ai.trackType")}
                        </span>
                        <Select
                          value={selectedNode.data.trackType}
                          options={[
                            {
                              label: text("cut.timeline.track.video"),
                              value: "video",
                            },
                            {
                              label: text("cut.timeline.track.audio"),
                              value: "audio",
                            },
                          ]}
                          onChange={(value) =>
                            handleNodeChange({
                              data: { ...selectedNode.data, trackType: value },
                            })
                          }
                        />
                      </div>
                      <div className={styles.row}>
                        <span className={styles.fieldLabel}>
                          {text("cut.ai.trackIndex")}
                        </span>
                        <InputNumber
                          min={0}
                          value={selectedNode.data.trackIndex}
                          onChange={(value) =>
                            handleNodeChange({
                              data: {
                                ...selectedNode.data,
                                trackIndex: Number(value ?? 0),
                              },
                            })
                          }
                        />
                      </div>
                      <div className={styles.row}>
                        <span className={styles.fieldLabel}>
                          {text("cut.ai.timelineIn")}
                        </span>
                        <InputNumber
                          min={0}
                          step={0.1}
                          value={selectedNode.data.timelineIn}
                          onChange={(value) =>
                            handleNodeChange({
                              data: {
                                ...selectedNode.data,
                                timelineIn: Number(value ?? 0),
                              },
                            })
                          }
                        />
                      </div>
                      <div className={styles.row}>
                        <span className={styles.fieldLabel}>
                          {text("cut.ai.duration")}
                        </span>
                        <InputNumber
                          min={0.1}
                          step={0.1}
                          value={selectedNode.data.duration}
                          onChange={(value) =>
                            handleNodeChange({
                              data: {
                                ...selectedNode.data,
                                duration: Number(value ?? 0.1),
                              },
                            })
                          }
                        />
                      </div>
                      <div className={styles.row}>
                        <span className={styles.fieldLabel}>
                          {text("cut.ai.sourceIn")}
                        </span>
                        <InputNumber
                          min={0}
                          step={0.1}
                          value={selectedNode.data.sourceIn}
                          onChange={(value) =>
                            handleNodeChange({
                              data: {
                                ...selectedNode.data,
                                sourceIn: Number(value ?? 0),
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  </>
                )}

                {selectedNode.nodeType === "transition" && (
                  <>
                    <div className={styles.row}>
                      <span className={styles.fieldLabel}>
                        {text("cut.ai.afterClip")}
                      </span>
                      <Select
                        value={selectedNode.data.afterClipId}
                        options={clipNodes.map((node) => ({
                          label: node.title,
                          value: node.id,
                        }))}
                        onChange={(value) =>
                          handleNodeChange({
                            data: { ...selectedNode.data, afterClipId: value },
                          })
                        }
                      />
                    </div>
                    <div className={styles.row}>
                      <span className={styles.fieldLabel}>
                        {text("cut.ai.transitionType")}
                      </span>
                      <Select
                        value={selectedNode.data.transitionType}
                        options={transitionOptions}
                        onChange={(value) =>
                          handleNodeChange({
                            title: `${text("cut.ai.nodeType.transition")} · ${value}`,
                            data: {
                              ...selectedNode.data,
                              transitionType: value,
                            },
                          })
                        }
                      />
                    </div>
                    <div className={styles.row}>
                      <span className={styles.fieldLabel}>
                        {text("cut.ai.duration")}
                      </span>
                      <InputNumber
                        min={0.1}
                        step={0.1}
                        value={selectedNode.data.duration}
                        onChange={(value) =>
                          handleNodeChange({
                            data: {
                              ...selectedNode.data,
                              duration: Number(value ?? 0.8),
                            },
                          })
                        }
                      />
                    </div>
                  </>
                )}

                {selectedNode.nodeType === "filter" && (
                  <>
                    <div className={styles.row}>
                      <span className={styles.fieldLabel}>
                        {text("cut.ai.bindClip")}
                      </span>
                      <Select
                        value={selectedNode.data.clipId}
                        options={clipNodes.map((node) => ({
                          label: node.title,
                          value: node.id,
                        }))}
                        onChange={(value) =>
                          handleNodeChange({
                            data: { ...selectedNode.data, clipId: value },
                          })
                        }
                      />
                    </div>
                    <div className={styles.row}>
                      <span className={styles.fieldLabel}>
                        {text("cut.ai.filterType")}
                      </span>
                      <Select
                        value={selectedNode.data.filterType}
                        options={filterOptions}
                        onChange={(value) =>
                          handleNodeChange({
                            title: `${text("cut.ai.nodeType.filter")} · ${value}`,
                            data: { ...selectedNode.data, filterType: value },
                          })
                        }
                      />
                    </div>
                    <div className={styles.twoCols}>
                      <div className={styles.row}>
                        <span className={styles.fieldLabel}>
                          {text("cut.ai.timelineIn")}
                        </span>
                        <InputNumber
                          min={0}
                          step={0.1}
                          value={selectedNode.data.timelineIn}
                          onChange={(value) =>
                            handleNodeChange({
                              data: {
                                ...selectedNode.data,
                                timelineIn: Number(value ?? 0),
                              },
                            })
                          }
                        />
                      </div>
                      <div className={styles.row}>
                        <span className={styles.fieldLabel}>
                          {text("cut.ai.duration")}
                        </span>
                        <InputNumber
                          min={0.1}
                          step={0.1}
                          value={selectedNode.data.duration}
                          onChange={(value) =>
                            handleNodeChange({
                              data: {
                                ...selectedNode.data,
                                duration: Number(value ?? 0.1),
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
};

export default AiArrangementDrawer;
