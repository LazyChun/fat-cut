# fat-cut MCP

`backend/mcp_server.py` 暴露了两个 MCP 工具：

- `generate_clip_arrangement_config_tool`
- `build_clip_arrangement_timeline_tool`

本地注册示例：

```json
{
  "name": "fat-cut-ai-arrangement",
  "transport": "stdio",
  "command": "python",
  "args": ["backend/mcp_server.py"],
  "cwd": "d:/work/github/fat-cut"
}
```

注册后，宿主或 AI 客户端可直接调用该工具生成剪辑编排配置，再由插件前端渲染为 LiteGraph.js 流程图并生成时间线。
