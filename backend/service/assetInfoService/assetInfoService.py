"""
Asset info service — reads asset metadata from the host asset repository
and parses the JSON-encoded description (including clipInfos) so the
AI can use it for clip arrangement.

The host asset list endpoint returns raw description strings; this module
parses them into structured AssetDescriptionData before returning.
"""

import json
import os
from typing import Any, Dict, List, Optional
from urllib import request as _urlrequest
from urllib import error as _urlerror

from plugin_runtime import handler


def _host_base_url() -> str:
    return (os.getenv("FAT_NOTES_PLUGIN_HOST_URL") or "").strip().rstrip("/")


def _safe_str(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    result = str(value).strip()
    return result or fallback


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return fallback
    if result != result:  # NaN
        return fallback
    return result


def _safe_tags(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value:
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        except (json.JSONDecodeError, ValueError):
            pass
    return []


def _parse_clip_info(item: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(item, dict):
        return None
    content = _safe_str(item.get("content"))
    if not content:
        return None
    start_time = _safe_float(item.get("startTime"), 0.0)
    end_time = _safe_float(item.get("endTime"), start_time)
    if end_time < start_time:
        end_time = start_time
    usage = _safe_str(item.get("usage"))
    return {
        "startTime": start_time,
        "endTime": end_time,
        "content": content,
        "usage": usage or None,
    }


def _parse_description(description: Any) -> Dict[str, Any]:
    raw = _safe_str(description)
    if not raw:
        return {"description": "", "clipInfos": []}
    trimmed = raw.strip()
    if not trimmed.startswith("{") and not trimmed.startswith("["):
        return {"description": trimmed, "clipInfos": []}
    try:
        parsed = json.loads(trimmed)
    except (json.JSONDecodeError, ValueError):
        return {"description": trimmed, "clipInfos": []}
    if isinstance(parsed, str):
        return {"description": parsed, "clipInfos": []}
    if isinstance(parsed, dict):
        desc = _safe_str(parsed.get("description"))
        raw_clips = parsed.get("clipInfos")
        clips = []
        if isinstance(raw_clips, list):
            for clip in raw_clips:
                parsed_clip = _parse_clip_info(clip)
                if parsed_clip:
                    clips.append(parsed_clip)
        return {"description": desc, "clipInfos": clips}
    return {"description": trimmed, "clipInfos": []}


def _host_asset_list(query: Dict[str, Any]) -> Dict[str, Any]:
    base = _host_base_url()
    if not base:
        raise RuntimeError("FAT_NOTES_PLUGIN_HOST_URL is not set")
    url = f"{base}/app/asset/list"
    payload = json.dumps(query, ensure_ascii=False).encode("utf-8")
    req = _urlrequest.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    opener = _urlrequest.build_opener(_urlrequest.ProxyHandler({}))
    try:
        with opener.open(req, timeout=15) as resp:
            body = resp.read().decode("utf-8")
    except _urlerror.HTTPError as e:
        err = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Host asset list HTTPError {e.code}: {err}") from e
    except Exception as e:
        raise RuntimeError(f"Host asset list request failed: {e}") from e
    try:
        data = json.loads(body)
    except (json.JSONDecodeError, ValueError) as e:
        raise RuntimeError(f"Host asset list invalid response: {body[:200]}") from e
    if isinstance(data, dict) and data.get("isOk") is False:
        raise RuntimeError(data.get("message") or "Host asset list failed")
    if isinstance(data, dict):
        return data.get("data") or {}
    return {}


def _normalize_asset(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not isinstance(row, dict):
        return None
    guid = _safe_str(row.get("guid"))
    file_path = _safe_str(row.get("file_path"))
    file_name = _safe_str(row.get("file_name"))
    file_type = _safe_str(row.get("file_type"))
    if not guid or not file_path:
        return None
    parsed = _parse_description(row.get("description"))
    return {
        "guid": guid,
        "filePath": file_path,
        "fileName": file_name,
        "fileType": file_type,
        "fileSize": row.get("file_size", 0),
        "duration": _safe_float(row.get("duration"), 0.0),
        "tags": _safe_tags(row.get("tags")),
        "description": parsed["description"],
        "clipInfos": parsed["clipInfos"],
        "categoryId": _safe_str(row.get("category_id")) or None,
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
    }


@handler("readAssetInfo")
def read_asset_info(params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Read asset info from the host asset repository with parsed descriptions.

    Params (all optional):
        keyword: search keyword (matches file_name or description)
        file_type: list of file type prefixes, e.g. ["video/", "audio/"]
        category_id: filter by category id
        page: page number (default 1)
        page_size: page size (default 50)

    Returns:
        { "list": [...], "total": N }
        Each item has guid, filePath, fileName, fileType, duration, tags,
        description (string), clipInfos (list of {startTime, endTime, content, usage}).
    """
    payload = params if isinstance(params, dict) else {}
    query: Dict[str, Any] = {
        "page": int(payload.get("page", 1) or 1),
        "page_size": int(payload.get("page_size", 50) or 50),
    }
    keyword = _safe_str(payload.get("keyword"))
    if keyword:
        query["keyword"] = keyword
    category_id = _safe_str(payload.get("category_id"))
    if category_id:
        query["category_id"] = category_id
    raw_file_type = payload.get("file_type")
    if isinstance(raw_file_type, list) and raw_file_type:
        query["file_type"] = [str(item) for item in raw_file_type if item]

    host_data = _host_asset_list(query)
    raw_list = host_data.get("list") if isinstance(host_data, dict) else None
    if not isinstance(raw_list, list):
        raw_list = []
    total = host_data.get("total", len(raw_list)) if isinstance(host_data, dict) else len(raw_list)

    normalized: List[Dict[str, Any]] = []
    for row in raw_list:
        asset = _normalize_asset(row)
        if asset:
            normalized.append(asset)

    return {"list": normalized, "total": total}
