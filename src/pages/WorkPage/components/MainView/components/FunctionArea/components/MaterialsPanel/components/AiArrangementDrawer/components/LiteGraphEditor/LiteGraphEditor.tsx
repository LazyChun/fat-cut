import React, { useCallback, useEffect, useRef } from "react";
import { LGraph, LGraphCanvas, LGraphNode, LiteGraph } from "litegraph.js";
import { useI18n } from "hooks";
import { FILTER_CATEGORIES, TRANSITION_CATEGORIES } from "utils";
import "litegraph.js/css/litegraph.css";
import styles from "./LiteGraphEditor.less";

interface LiteGraphEditorProps {
  graph: Cut.AiArrangementGraph;
  selectedNodeId?: string;
  onSelectNode: (nodeId?: string) => void;
  onGraphChange: (graph: Cut.AiArrangementGraph) => void;
  getMenuOptions?: (
    nodeId?: string,
  ) => { label: string; onClick: () => void }[];
}

type RuntimeGraph = LGraph & {
  onNodeRemoved?: (node: LGraphNode) => void;
  onConnectionChange?: (node: LGraphNode) => void;
};

type RuntimeNode = LGraphNode & {
  removable?: boolean;
  clonable?: boolean;
};

class ArrangementGraphNode extends LGraphNode {
  constructor() {
    super();
    this.addInput("in", "flow", { nameLocked: true });
    this.addOutput("out", "flow", { nameLocked: true });
    this.size = [220, 92];
    this.resizable = false;
  }

  override onDrawForeground(
    ctx: CanvasRenderingContext2D,
    _canvas: HTMLCanvasElement,
  ) {
    const subtitle = String(this.properties.subtitle ?? "");
    const label = String(this.properties.label ?? "");
    const metrics = [];
    if (typeof this.properties.duration === "number") {
      metrics.push(`${this.properties.duration.toFixed(1)}s`);
    }
    if (typeof this.properties.timelineIn === "number") {
      metrics.push(`t=${this.properties.timelineIn.toFixed(1)}`);
    }
    if (typeof this.properties.trackIndex === "number") {
      metrics.push(
        `${String(this.properties.trackType ?? "video").slice(0, 1)}${this.properties.trackIndex}`,
      );
    }
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = "12px sans-serif";
    if (subtitle) {
      ctx.fillText(subtitle.slice(0, 26), 12, 44);
    }
    if (label && label !== this.title) {
      ctx.fillStyle = "rgba(255,255,255,0.66)";
      ctx.fillText(label.slice(0, 28), 12, 62);
    }
    if (metrics.length > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.fillText(metrics.join("  "), 12, 80);
    }
    ctx.restore();
  }
}

let nodeRegistered = false;

const ensureLiteGraphNode = () => {
  if (!nodeRegistered) {
    LiteGraph.registerNodeType("fatcut/arrangement", ArrangementGraphNode);
    nodeRegistered = true;
  }
};

const applyAppearance = (node: LGraphNode, item: Cut.AiArrangementNode) => {
  const appearanceMap: Record<
    Cut.AiArrangementNodeType,
    { color: string; bgcolor: string; boxcolor: string }
  > = {
    start: {
      color: "#14532d",
      bgcolor: "#166534",
      boxcolor: "#4ade80",
    },
    clip: {
      color: "#1d4ed8",
      bgcolor: "#2563eb",
      boxcolor: "#93c5fd",
    },
    transition: {
      color: "#6d28d9",
      bgcolor: "#7c3aed",
      boxcolor: "#c4b5fd",
    },
    filter: {
      color: "#b45309",
      bgcolor: "#d97706",
      boxcolor: "#fcd34d",
    },
    end: {
      color: "#155e75",
      bgcolor: "#0f766e",
      boxcolor: "#5eead4",
    },
  };
  const current = appearanceMap[item.nodeType];
  node.color = current.color;
  node.bgcolor = current.bgcolor;
  node.boxcolor = current.boxcolor;
};

const LiteGraphEditor: React.FC<LiteGraphEditorProps> = ({
  graph,
  selectedNodeId,
  onSelectNode,
  onGraphChange,
  getMenuOptions,
}) => {
  const { text } = useI18n();

  const getFilterName = useCallback(
    (key: string) => {
      for (const cat of FILTER_CATEGORIES) {
        const f = cat.filters.find((x) => x.id === key);
        if (f) {
          return text(f.nameKey);
        }
      }
      return key;
    },
    [text],
  );

  const getTransitionName = useCallback(
    (key: string) => {
      for (const cat of TRANSITION_CATEGORIES) {
        const t = cat.transitions.find((x) => x.id === key);
        if (t) {
          return text(t.nameKey);
        }
      }
      return key;
    },
    [text],
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<RuntimeGraph>();
  const graphCanvasRef = useRef<LGraphCanvas>();
  const latestGraphRef = useRef(graph);
  const latestSelectedNodeIdRef = useRef(selectedNodeId);
  const onSelectNodeRef = useRef(onSelectNode);
  const onGraphChangeRef = useRef(onGraphChange);
  const getMenuOptionsRef = useRef(getMenuOptions);
  const isInternalUpdateRef = useRef(false);
  const isRebuildingRef = useRef(false);

  latestGraphRef.current = graph;
  latestSelectedNodeIdRef.current = selectedNodeId;
  onSelectNodeRef.current = onSelectNode;
  onGraphChangeRef.current = onGraphChange;
  getMenuOptionsRef.current = getMenuOptions;

  useEffect(() => {
    ensureLiteGraphNode();
    if (!canvasRef.current) {
      return;
    }
    const currentGraph = new LGraph() as RuntimeGraph;
    const currentCanvas = new LGraphCanvas(canvasRef.current, currentGraph);

    // High DPI canvas support
    const dpr = window.devicePixelRatio || 1;
    if (dpr > 1) {
      const originalResize = currentCanvas.resize.bind(currentCanvas);
      currentCanvas.resize = function (width?: number, height?: number) {
        originalResize(width, height);
        const parent = this.canvas.parentNode as HTMLElement;
        const w = width || parent?.offsetWidth || 0;
        const h = height || parent?.offsetHeight || 0;

        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;

        if (this.bgcanvas && this.bgcanvas !== this.canvas) {
          this.bgcanvas.width = w * dpr;
          this.bgcanvas.height = h * dpr;
          this.bgcanvas.style.width = `${w}px`;
          this.bgcanvas.style.height = `${h}px`;
        }
      };

      const originalToCanvasContext = currentCanvas.ds.toCanvasContext.bind(
        currentCanvas.ds,
      );
      currentCanvas.ds.toCanvasContext = function (
        ctx: CanvasRenderingContext2D,
      ) {
        ctx.scale(dpr, dpr);
        originalToCanvasContext(ctx);
      };
    }

    currentCanvas.background_image = "";
    currentCanvas.render_canvas_border = false;
    currentCanvas.allow_searchbox = false;
    currentCanvas.show_info = false;
    currentCanvas.onNodeSelected = (node) => {
      onSelectNodeRef.current(String(node.properties.nodeId ?? ""));
    };
    currentCanvas.onSelectionChange = (nodes) => {
      const selected = Object.values(nodes ?? {})[0];
      onSelectNodeRef.current(
        selected ? String(selected.properties.nodeId ?? "") : undefined,
      );
    };
    currentCanvas.getNodeMenuOptions = function (node) {
      const nodeId = node?.properties?.nodeId
        ? String(node.properties.nodeId)
        : undefined;
      return (getMenuOptionsRef.current?.(nodeId) ?? []).map((opt) => ({
        content: opt.label,
        callback: opt.onClick,
      }));
    };
    currentCanvas.getMenuOptions = function () {
      return (getMenuOptionsRef.current?.() ?? []).map((opt) => ({
        content: opt.label,
        callback: opt.onClick,
      }));
    };

    const emitGraphChange = () => {
      if (isRebuildingRef.current) return;
      const prevGraph = latestGraphRef.current;
      const nodes = currentGraph.findNodesByType("fatcut/arrangement") || [];
      const nextNodes: Cut.AiArrangementNode[] = [];
      const nextEdges: Cut.AiArrangementEdge[] = [];

      nodes.forEach((node) => {
        const nodeId = node.properties.nodeId;
        const originalNode = prevGraph.nodes.find((n) => n.id === nodeId);
        if (originalNode) {
          nextNodes.push({
            ...originalNode,
            x: node.pos[0],
            y: node.pos[1],
          });
        }
      });

      Object.values(currentGraph.links || {}).forEach((link) => {
        if (!link) return;
        const originNode = currentGraph.getNodeById(link.origin_id);
        const targetNode = currentGraph.getNodeById(link.target_id);
        if (originNode && targetNode) {
          nextEdges.push({
            id: String(link.id),
            sourceId: String(originNode.properties.nodeId),
            targetId: String(targetNode.properties.nodeId),
          });
        }
      });

      isInternalUpdateRef.current = true;
      onGraphChangeRef.current({
        ...prevGraph,
        nodes: nextNodes,
        edges: nextEdges,
      });
    };

    currentCanvas.onNodeMoved = () => emitGraphChange();
    currentGraph.onNodeRemoved = () => emitGraphChange();
    currentGraph.onConnectionChange = () => emitGraphChange();

    graphRef.current = currentGraph;
    graphCanvasRef.current = currentCanvas;

    const resizeObserver = new ResizeObserver(() => {
      currentCanvas.resize();
    });
    if (canvasRef.current.parentElement) {
      resizeObserver.observe(canvasRef.current.parentElement);
    }

    return () => {
      resizeObserver.disconnect();
      currentCanvas.clear();
      currentCanvas.unbindEvents();
      currentGraph.clear();
    };
  }, []);

  useEffect(() => {
    if (isInternalUpdateRef.current) {
      isInternalUpdateRef.current = false;
      return;
    }

    const currentGraph = graphRef.current;
    if (!currentGraph) {
      return;
    }

    isRebuildingRef.current = true;
    currentGraph.clear();
    const nodeMap = new Map<string, LGraphNode>();

    graph.nodes.forEach((item) => {
      const node = LiteGraph.createNode("fatcut/arrangement") as RuntimeNode;
      let title = item.title;
      if (item.nodeType === "filter" && item.data.filterType) {
        const key = item.data.filterType;
        if (title.endsWith(`· ${key}`)) {
          title = title.slice(0, -key.length) + getFilterName(key);
        }
      } else if (item.nodeType === "transition" && item.data.transitionType) {
        const key = item.data.transitionType;
        if (title.endsWith(`· ${key}`)) {
          title = title.slice(0, -key.length) + getTransitionName(key);
        }
      }
      node.title = title;
      node.pos = [item.x, item.y];
      node.properties = {
        ...item.data,
        nodeId: item.id,
        nodeType: item.nodeType,
        subtitle: item.subtitle,
        label: item.data.label,
      };
      node.clonable = false;
      if (item.nodeType === "start" && node.inputs?.length) {
        node.removeInput(0);
      }
      if (item.nodeType === "end" && node.outputs?.length) {
        node.removeOutput(0);
      }
      if (item.nodeType === "start" || item.nodeType === "end") {
        node.removable = false;
        node.clonable = false;
      }
      applyAppearance(node, item);
      currentGraph.add(node);
      nodeMap.set(item.id, node);
    });

    graph.edges.forEach((edge) => {
      const sourceNode = nodeMap.get(edge.sourceId);
      const targetNode = nodeMap.get(edge.targetId);
      if (
        !sourceNode ||
        !targetNode ||
        !sourceNode.outputs?.length ||
        !targetNode.inputs?.length
      ) {
        return;
      }
      try {
        sourceNode.connect(0, targetNode, 0);
      } catch {
        // Ignore invalid reconnects while the graph is re-rendering.
      }
    });

    const currentCanvas = graphCanvasRef.current;
    if (currentCanvas) {
      currentCanvas.deselectAllNodes();
      if (latestSelectedNodeIdRef.current) {
        const selectedNode = nodeMap.get(latestSelectedNodeIdRef.current);
        if (selectedNode) {
          currentCanvas.selectNode(selectedNode);
        }
      }
      currentCanvas.draw(true, true);
    }
    isRebuildingRef.current = false;
  }, [graph]);

  return (
    <div className={styles.wrapper}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
};

export default LiteGraphEditor;
