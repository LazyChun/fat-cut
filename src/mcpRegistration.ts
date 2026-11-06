/**
 * Fat-Cut MCP 工具注册
 *
 * 将 fat-cut 的工具注册到宿主的 MCP 工具系统中，采用 pyFunc 类型。
 * pyFunc 代码在宿主进程内执行，通过禁用代理的 requests.Session 调用插件后端
 * /app/pluginBackend/invoke 端点，再由宿主代理到 fat-cut 插件后端子进程。
 *
 * 注册后，AI 剪影可通过 readAssetInfo 读取素材描述与 clipInfos，
 * 再根据提示词自动进行剪辑编排。
 */
import type { FatNotesPluginSDK, AiMcpToolItem } from "fat-notes-sdk";

const HOST_API_BASE = "http://127.0.0.1:8022";
const TOOL_ID_PREFIX = "fat-cut.mcp.";

const HANDLERS = {
  readAssetInfo: "readAssetInfo",
  generateArrangement: "generateClipArrangementConfig",
  buildTimeline: "buildClipArrangementTimeline",
} as const;

function buildPyFuncCode(pluginId: string, handler: string): string {
  return (
    "import os\n" +
    "import requests\n" +
    "import json\n" +
    "\n" +
    "def call(params):\n" +
    '    url = "' +
    HOST_API_BASE +
    '/app/pluginBackend/invoke"\n' +
    "    body = {\n" +
    '        "pluginId": "' +
    pluginId +
    '",\n' +
    '        "handler": "' +
    handler +
    '",\n' +
    '        "params": params.get("params", {}) if isinstance(params, dict) else {},\n' +
    "    }\n" +
    "    headers = {\n" +
    '        "Content-Type": "application/json",\n' +
    '        "X-From-Agent": "1",\n' +
    "    }\n" +
    '    token = (os.environ.get("FAT_API_TOKEN") or "").strip()\n' +
    "    if token:\n" +
    '        headers["x-fat-api-token"] = token\n' +
    "    sess = requests.Session()\n" +
    "    sess.trust_env = False\n" +
    "    resp = sess.post(url, json=body, headers=headers, timeout=60)\n" +
    "    try:\n" +
    "        return resp.json()\n" +
    "    except Exception:\n" +
    "        return resp.text\n"
  );
}

function buildToolDef(
  pluginId: string,
  id: string,
  name: string,
  description: string,
  handler: string,
  paramsDesc: string,
): Record<string, unknown> {
  return {
    id,
    name,
    description,
    type: "pyFunc",
    enable: true,
    tags: ["fat-cut", "mcp"],
    conf: {
      entry: "call",
      code: buildPyFuncCode(pluginId, handler),
      inParams: [
        {
          id: "params",
          name: "params",
          dataType: "object",
          value: "{}",
          required: true,
          description: paramsDesc,
        },
      ],
    },
  };
}

function buildAllToolDefs(pluginId: string): Record<string, unknown>[] {
  return [
    buildToolDef(
      pluginId,
      `${TOOL_ID_PREFIX}readAssetInfo`,
      "读取素材信息",
      "读取宿主素材库中的素材信息（含解析后的描述与分段 clipInfos）。AI 剪影可根据提示词调用此工具查找需要剪辑的素材片段。每个素材返回 guid、fileName、filePath、fileType、duration、tags、description 以及 clipInfos 数组（每项含 startTime、endTime、content、usage）。",
      HANDLERS.readAssetInfo,
      '参数对象，可选字段：keyword（搜索关键词）、file_type（类型前缀数组如 ["video/","audio/"]）、category_id、page（默认1）、page_size（默认50）。如 {"keyword": "风景", "file_type": ["video/"]}',
    ),
    buildToolDef(
      pluginId,
      `${TOOL_ID_PREFIX}generateArrangement`,
      "生成剪辑编排",
      "根据用户提示词和素材列表生成结构化的剪辑编排配置（LiteGraph 图 + 时间线草案）。调用前可先用 readAssetInfo 获取素材信息。",
      HANDLERS.generateArrangement,
      '参数对象，需包含 prompt（用户提示词）、assets（素材列表）、可选 plan（AI 返回的规划）、可选 project（当前工程）。如 {"prompt": "快节奏", "assets": [...]}',
    ),
    buildToolDef(
      pluginId,
      `${TOOL_ID_PREFIX}buildTimeline`,
      "构建时间线",
      "根据 LiteGraph 编排图构建时间线轨道与片段。在生成编排后调用此工具得到最终时间线。",
      HANDLERS.buildTimeline,
      '参数对象，需包含 graph（编排图）。如 {"graph": {"nodes": [...], "edges": [...]}}',
    ),
  ];
}

export function getMcpToolIds(): string[] {
  return [
    `${TOOL_ID_PREFIX}readAssetInfo`,
    `${TOOL_ID_PREFIX}generateArrangement`,
    `${TOOL_ID_PREFIX}buildTimeline`,
  ];
}

async function callMcpApi(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<{ code: number; data?: unknown; msg?: string }> {
  const resp = await fetch(`${HOST_API_BASE}/app/mcp/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  }
  return resp.json();
}

export async function registerMcpTools(
  sdk: FatNotesPluginSDK,
): Promise<{ registered: number }> {
  const pluginId = sdk.pluginId;
  const toolDefs = buildAllToolDefs(pluginId);

  let existingTools: AiMcpToolItem[] = [];
  try {
    existingTools = await sdk.ai.getMcpTools();
  } catch {
    // 忽略查询失败，继续尝试注册
  }
  const existingIds = new Set(existingTools.map((t) => t.id));

  let registered = 0;
  for (const toolDef of toolDefs) {
    const toolId = toolDef.id as string;
    try {
      if (existingIds.has(toolId)) {
        await callMcpApi("editTool", toolDef);
      } else {
        await callMcpApi("addTool", toolDef);
      }
      registered++;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[fat-cut] Failed to register MCP tool ${toolId}:`, err);
    }
  }

  return { registered };
}
