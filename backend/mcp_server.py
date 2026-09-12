from typing import Any

try:
    from mcp.server.fastmcp import FastMCP
except ImportError as exc:  # pragma: no cover
    raise RuntimeError(
        "Missing dependency 'mcp'. Install backend requirements first."
    ) from exc

from service.aiArrangementService.aiArrangementService import (  # noqa: E402
    build_timeline_from_graph,
    generate_clip_arrangement_config,
)
from service.assetInfoService.assetInfoService import (  # noqa: E402
    read_asset_info,
)

mcp = FastMCP("fat-cut-ai-arrangement")


@mcp.tool()
def generate_clip_arrangement_config_tool(
    prompt: str,
    assets: list[dict[str, Any]],
    plan: dict[str, Any] | None = None,
    project: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Generate a structured clip arrangement config from prompt and asset metadata."""

    return generate_clip_arrangement_config(
        {
            "prompt": prompt,
            "assets": assets,
            "plan": plan,
            "project": project or {},
        }
    )


@mcp.tool()
def build_clip_arrangement_timeline_tool(
    graph: dict[str, Any],
) -> dict[str, Any]:
    """Build timeline tracks and filter clips from a LiteGraph arrangement graph."""

    return build_timeline_from_graph(graph)


@mcp.tool()
def read_asset_info_tool(
    keyword: str | None = None,
    file_type: list[str] | None = None,
    category_id: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    """Read asset info (with parsed description and clipInfos) from the host asset repository.

    Use this to find clips for cutting based on prompts. Each returned asset
    includes a clipInfos array with startTime, endTime, content, and usage fields
    that describe meaningful segments within video/audio assets.
    """

    params: dict[str, Any] = {
        "page": page,
        "page_size": page_size,
    }
    if keyword:
        params["keyword"] = keyword
    if file_type:
        params["file_type"] = file_type
    if category_id:
        params["category_id"] = category_id
    return read_asset_info(params)


if __name__ == "__main__":
    mcp.run()
