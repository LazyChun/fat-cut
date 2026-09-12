import type { AiMcpToolItem, AiModelItem } from "fat-notes-sdk";

const GRAPH_START_ID = "arrangement-start";
const GRAPH_END_ID = "arrangement-end";

const AUTO_MCP_KEYWORDS = [
  "fat-cut",
  "clip",
  "arrangement",
  "timeline",
  "剪辑",
  "编排",
];

const genNodeId = (prefix: string) => {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const toFiniteNumber = (value: unknown, fallback: number) => {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const getClipNodes = (graph: Cut.AiArrangementGraph) => {
  return graph.nodes
    .filter((node) => node.nodeType === "clip")
    .sort(
      (a, b) =>
        toFiniteNumber(a.data.order, 0) - toFiniteNumber(b.data.order, 0),
    );
};

const ensureBoundaryNodes = (nodes: Cut.AiArrangementNode[]) => {
  const normalized = [...nodes];
  if (!normalized.some((node) => node.nodeType === "start")) {
    normalized.unshift({
      id: GRAPH_START_ID,
      nodeType: "start",
      title: "开始",
      subtitle: "AI 剪辑起点",
      x: 24,
      y: 24,
      data: {},
    });
  }
  if (!normalized.some((node) => node.nodeType === "end")) {
    normalized.push({
      id: GRAPH_END_ID,
      nodeType: "end",
      title: "结束",
      subtitle: "时间线输出",
      x: 1120,
      y: 24,
      data: {},
    });
  }
  return normalized;
};

const getTransitionNodeMap = (graph: Cut.AiArrangementGraph) => {
  const map = new Map<string, Cut.AiArrangementNode>();
  graph.nodes
    .filter((node) => node.nodeType === "transition")
    .forEach((node) => {
      if (node.data.afterClipId) {
        map.set(node.data.afterClipId, node);
      }
    });
  return map;
};

export const rebuildArrangementEdges = (
  graph: Cut.AiArrangementGraph,
): Cut.AiArrangementEdge[] => {
  const edges: Cut.AiArrangementEdge[] = [];
  const startNode = graph.nodes.find((node) => node.nodeType === "start");
  const endNode = graph.nodes.find((node) => node.nodeType === "end");
  const clipNodes = getClipNodes(graph);
  const transitionMap = getTransitionNodeMap(graph);

  let previousId = startNode?.id;

  clipNodes.forEach((clipNode, index) => {
    if (previousId) {
      edges.push({
        id: `edge-${previousId}-${clipNode.id}`,
        sourceId: previousId,
        targetId: clipNode.id,
      });
    }

    const transitionNode = transitionMap.get(clipNode.id);
    const nextClip = clipNodes[index + 1];

    if (transitionNode && nextClip) {
      edges.push({
        id: `edge-${clipNode.id}-${transitionNode.id}`,
        sourceId: clipNode.id,
        targetId: transitionNode.id,
      });
      previousId = transitionNode.id;
    } else {
      previousId = clipNode.id;
    }

    graph.nodes
      .filter(
        (node) =>
          node.nodeType === "filter" && node.data.clipId === clipNode.id,
      )
      .forEach((filterNode) => {
        edges.push({
          id: `edge-${clipNode.id}-${filterNode.id}`,
          sourceId: clipNode.id,
          targetId: filterNode.id,
          label: "滤镜",
        });
      });
  });

  if (endNode) {
    if (previousId && previousId !== endNode.id) {
      edges.push({
        id: `edge-${previousId}-${endNode.id}`,
        sourceId: previousId,
        targetId: endNode.id,
      });
    } else if (startNode && previousId === startNode.id) {
      edges.push({
        id: `edge-${startNode.id}-${endNode.id}`,
        sourceId: startNode.id,
        targetId: endNode.id,
      });
    }
  }

  return edges;
};

export const normalizeArrangementGraph = (
  graph?: Cut.AiArrangementGraph,
): Cut.AiArrangementGraph => {
  let clipOrder = 0;
  const nodes = ensureBoundaryNodes(graph?.nodes ?? []).map((node) => {
    if (node.nodeType !== "clip") {
      return node;
    }
    const resolvedOrder =
      typeof node.data.order === "number" && Number.isFinite(node.data.order)
        ? node.data.order
        : clipOrder;
    clipOrder += 1;
    return {
      ...node,
      data: {
        ...node.data,
        order: resolvedOrder,
        duration: toFiniteNumber(node.data.duration, 3),
        timelineIn: toFiniteNumber(node.data.timelineIn, 0),
        sourceIn: toFiniteNumber(node.data.sourceIn, 0),
        sourceOut:
          typeof node.data.sourceOut === "number"
            ? node.data.sourceOut
            : undefined,
        trackIndex: Math.max(
          0,
          Math.round(toFiniteNumber(node.data.trackIndex, 0)),
        ),
      },
    };
  });
  const normalizedGraph = { nodes, edges: graph?.edges ?? [] };
  return {
    nodes,
    edges: rebuildArrangementEdges(normalizedGraph),
  };
};

export const extractJsonPayload = (content: string): unknown => {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      return JSON.parse(fencedMatch[1]);
    }
    const startIndex = trimmed.indexOf("{");
    const endIndex = trimmed.lastIndexOf("}");
    if (startIndex >= 0 && endIndex > startIndex) {
      return JSON.parse(trimmed.slice(startIndex, endIndex + 1));
    }
    throw new Error("AI 返回内容不是有效 JSON");
  }
};

export const pickDefaultAiModel = (
  models: AiModelItem[],
  preferredId?: string,
) => {
  if (preferredId) {
    const preferred = models.find((item) => item.id === preferredId);
    if (preferred) {
      return preferred;
    }
  }
  return models.find((item) => item.isDefault) ?? models[0] ?? null;
};

export const pickRecognitionModel = (
  models: AiModelItem[],
  preferredId?: string,
) => {
  const imageModels = models.filter(
    (item) => item.supportImages === true,
  );
  if (preferredId) {
    const preferred = imageModels.find((item) => item.id === preferredId);
    if (preferred) {
      return preferred;
    }
  }
  return (
    imageModels.find((item) => item.isDefault) ?? imageModels[0] ?? null
  );
};

export const findArrangementToolIds = (tools: AiMcpToolItem[]) => {
  return tools
    .filter((tool) => {
      const haystack =
        `${tool.id} ${tool.name ?? ""} ${tool.description ?? ""}`.toLowerCase();
      return AUTO_MCP_KEYWORDS.some((keyword) => haystack.includes(keyword));
    })
    .map((tool) => tool.id);
};

export const createClipNode = (
  asset?: Cut.AiPlanningAsset,
): Cut.AiArrangementNode => {
  const clipType = asset?.fileType?.startsWith("audio/")
    ? "audio"
    : asset?.fileType?.startsWith("image/")
      ? "image"
      : "video";
  return {
    id: genNodeId("clip"),
    nodeType: "clip",
    title: asset?.fileName ?? "新片段",
    subtitle: asset?.description ?? "手动新增片段",
    x: 180,
    y: 160,
    data: {
      label: asset?.fileName ?? "新片段",
      assetGuid: asset?.guid,
      filePath: asset?.filePath,
      fileName: asset?.fileName,
      fileType: asset?.fileType,
      clipType,
      trackType: clipType === "audio" ? "audio" : "video",
      trackIndex: 0,
      timelineIn: 0,
      duration: asset?.duration ?? 3,
      sourceIn: 0,
      sourceOut: asset?.duration,
      tags: asset?.tags ?? [],
    },
  };
};

export const createFilterNode = (clipId?: string): Cut.AiArrangementNode => {
  return {
    id: genNodeId("filter"),
    nodeType: "filter",
    title: "滤镜节点",
    subtitle: "作用于片段画面",
    x: 420,
    y: 300,
    data: {
      clipId,
      filterType: "vivid",
      duration: 3,
      timelineIn: 0,
      params: { intensity: 1 },
    },
  };
};

export const createTransitionNode = (
  afterClipId?: string,
): Cut.AiArrangementNode => {
  return {
    id: genNodeId("transition"),
    nodeType: "transition",
    title: "转场节点",
    subtitle: "连接前后片段",
    x: 320,
    y: 80,
    data: {
      afterClipId,
      transitionType: "fade",
      duration: 0.8,
      params: { intensity: 1 },
    },
  };
};

export const replaceGraphNode = (
  graph: Cut.AiArrangementGraph,
  nextNode: Cut.AiArrangementNode,
) => {
  return normalizeArrangementGraph({
    nodes: graph.nodes.map((node) =>
      node.id === nextNode.id ? nextNode : node,
    ),
    edges: graph.edges,
  });
};

export const removeGraphNode = (
  graph: Cut.AiArrangementGraph,
  nodeId: string,
) => {
  const removedNode = graph.nodes.find((node) => node.id === nodeId);
  return normalizeArrangementGraph({
    nodes: graph.nodes.filter((node) => {
      if (node.id === nodeId) {
        return false;
      }
      if (
        removedNode?.nodeType === "clip" &&
        (node.data.clipId === nodeId || node.data.afterClipId === nodeId)
      ) {
        return false;
      }
      return true;
    }),
    edges: graph.edges.filter(
      (edge) => edge.sourceId !== nodeId && edge.targetId !== nodeId,
    ),
  });
};
