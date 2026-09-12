import copy
from datetime import datetime, timezone
from uuid import uuid4

from plugin_runtime import handler


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:10]}"


def _safe_str(value, fallback: str = "") -> str:
    if value is None:
        return fallback
    return str(value).strip() or fallback


def _safe_float(value, fallback: float = 0.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return fallback
    if result != result:  # NaN
        return fallback
    return result


def _safe_int(value, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _safe_tags(value) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _clip_type_from_file_type(file_type: str) -> str:
    if file_type.startswith("audio/"):
        return "audio"
    if file_type.startswith("image/"):
        return "image"
    return "video"


def _default_clip_duration(asset: dict, prompt: str) -> float:
    clip_type = _clip_type_from_file_type(_safe_str(asset.get("fileType")))
    duration = max(0.1, _safe_float(asset.get("duration"), 0.0))
    fast_keywords = ["快节奏", "节奏快", "rapid", "fast"]
    slow_keywords = ["慢节奏", "舒缓", "slow", "calm"]
    if clip_type == "audio":
        return max(1.0, duration)
    if clip_type == "image":
        base = 3.0
    else:
        base = min(max(duration, 2.0), 6.0)
    if any(keyword in prompt for keyword in fast_keywords):
        base = min(base, 2.5)
    if any(keyword in prompt for keyword in slow_keywords):
        base = max(base, 4.0)
    return max(1.0, min(base, duration if duration > 0 else base))


def _pick_filter_type(prompt: str) -> str | None:
    lowered = prompt.lower()
    if "复古" in prompt or "vintage" in lowered:
        return "kodak"
    if "电影" in prompt or "cinematic" in lowered:
        return "cinemaOrange"
    if "清新" in prompt or "fresh" in lowered:
        return "fresh"
    if "黑白" in prompt or "noir" in lowered:
        return "noir"
    return None


def _normalize_asset(raw: dict) -> dict | None:
    if not isinstance(raw, dict):
        return None
    guid = _safe_str(raw.get("guid"))
    file_path = _safe_str(raw.get("filePath") or raw.get("file_path"))
    file_name = _safe_str(raw.get("fileName") or raw.get("file_name"))
    file_type = _safe_str(raw.get("fileType") or raw.get("file_type"))
    if not file_path or not file_name or not file_type:
        return None
    return {
        "guid": guid or _new_id("asset"),
        "filePath": file_path,
        "fileName": file_name,
        "fileType": file_type,
        "description": _safe_str(raw.get("description")),
        "tags": _safe_tags(raw.get("tags")),
        "duration": max(0.1, _safe_float(raw.get("duration"), 3.0)),
        "width": _safe_int(raw.get("width"), 0) or None,
        "height": _safe_int(raw.get("height"), 0) or None,
        "clipInfos": _normalize_clip_infos(raw.get("clipInfos")),
    }


def _normalize_clip_infos(raw) -> list[dict]:
    if not isinstance(raw, list):
        return []
    result: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        content = _safe_str(item.get("content"))
        if not content:
            continue
        start_time = _safe_float(item.get("startTime"), 0.0)
        end_time = _safe_float(item.get("endTime"), start_time)
        if end_time < start_time:
            end_time = start_time
        usage = _safe_str(item.get("usage"))
        result.append({
            "startTime": start_time,
            "endTime": end_time,
            "content": content,
            "usage": usage or None,
        })
    return result


def _build_asset_index(assets: list[dict]) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for asset in assets:
        for key in [asset.get("guid"), asset.get("filePath"), asset.get("fileName")]:
            normalized_key = _safe_str(key)
            if normalized_key:
                index[normalized_key] = asset
    return index


def _resolve_asset(asset_index: dict[str, dict], segment: dict) -> dict | None:
    keys = [
        segment.get("assetGuid"),
        segment.get("guid"),
        segment.get("filePath"),
        segment.get("file_path"),
        segment.get("fileName"),
        segment.get("file_name"),
    ]
    for key in keys:
        normalized_key = _safe_str(key)
        if normalized_key and normalized_key in asset_index:
            return asset_index[normalized_key]
    return None


def _normalize_plan_segments(
    plan: dict | None,
    assets: list[dict],
    prompt: str,
    warnings: list[str],
) -> list[dict]:
    asset_index = _build_asset_index(assets)
    raw_segments = plan.get("segments") if isinstance(plan, dict) else None
    if not isinstance(raw_segments, list) or len(raw_segments) == 0:
        visual_assets = [
            asset for asset in assets if _clip_type_from_file_type(asset["fileType"]) != "audio"
        ]
        audio_assets = [
            asset for asset in assets if _clip_type_from_file_type(asset["fileType"]) == "audio"
        ]
        segments: list[dict] = []
        current_time = 0.0
        filter_type = _pick_filter_type(prompt)
        for index, asset in enumerate(visual_assets):
            duration = _default_clip_duration(asset, prompt)
            segments.append(
                {
                    "asset": asset,
                    "title": asset["fileName"],
                    "reason": asset.get("description") or "根据素材信息自动生成的镜头规划",
                    "duration": duration,
                    "sourceIn": 0.0,
                    "sourceOut": duration,
                    "trackType": "video",
                    "trackIndex": 0,
                    "timelineIn": current_time,
                    "transitionType": "fade" if index < len(visual_assets) - 1 else None,
                    "transitionDuration": 0.8,
                    "filterType": filter_type if index == 0 else None,
                    "filterDuration": duration,
                }
            )
            current_time += duration
        if audio_assets and current_time > 0:
            audio_asset = audio_assets[0]
            segments.append(
                {
                    "asset": audio_asset,
                    "title": audio_asset["fileName"],
                    "reason": "作为背景音乐铺底",
                    "duration": min(audio_asset["duration"], current_time),
                    "sourceIn": 0.0,
                    "sourceOut": min(audio_asset["duration"], current_time),
                    "trackType": "audio",
                    "trackIndex": 0,
                    "timelineIn": 0.0,
                    "transitionType": None,
                    "transitionDuration": None,
                    "filterType": None,
                    "filterDuration": None,
                }
            )
        if not segments:
            warnings.append("没有可用于编排的素材")
        return segments

    normalized_segments: list[dict] = []
    track_timeline: dict[str, float] = {}

    for raw_segment in raw_segments:
        if not isinstance(raw_segment, dict):
            continue
        asset = _resolve_asset(asset_index, raw_segment)
        if not asset:
            warnings.append(
                f"未匹配到素材: {_safe_str(raw_segment.get('assetGuid') or raw_segment.get('fileName') or raw_segment.get('filePath'))}"
            )
            continue
        clip_type = _clip_type_from_file_type(asset["fileType"])
        track_type = _safe_str(raw_segment.get("trackType"), "audio" if clip_type == "audio" else "video")
        track_index = max(0, _safe_int(raw_segment.get("trackIndex"), 0))
        duration = max(
            0.1,
            _safe_float(raw_segment.get("duration"), _default_clip_duration(asset, prompt)),
        )
        source_in = max(0.0, _safe_float(raw_segment.get("sourceIn"), 0.0))
        source_out = _safe_float(raw_segment.get("sourceOut"), source_in + duration)
        if source_out <= source_in:
            source_out = source_in + duration
        duration = max(0.1, source_out - source_in)
        timeline_key = f"{track_type}:{track_index}"
        timeline_in = _safe_float(raw_segment.get("timelineIn"), track_timeline.get(timeline_key, 0.0))
        track_timeline[timeline_key] = max(track_timeline.get(timeline_key, 0.0), timeline_in + duration)
        normalized_segments.append(
            {
                "asset": asset,
                "title": _safe_str(raw_segment.get("title"), asset["fileName"]),
                "reason": _safe_str(raw_segment.get("reason"), asset.get("description", "")),
                "duration": duration,
                "sourceIn": source_in,
                "sourceOut": source_out,
                "trackType": track_type,
                "trackIndex": track_index,
                "timelineIn": timeline_in,
                "transitionType": _safe_str(raw_segment.get("transitionType")) or None,
                "transitionDuration": _safe_float(raw_segment.get("transitionDuration"), 0.8),
                "filterType": _safe_str(raw_segment.get("filterType")) or None,
                "filterDuration": max(
                    0.1,
                    _safe_float(raw_segment.get("filterDuration"), duration),
                ),
            }
        )
    if not normalized_segments:
        warnings.append("AI 返回的规划为空，已回退到自动编排")
        return _normalize_plan_segments(None, assets, prompt, warnings)
    return normalized_segments


def _build_edges(nodes: list[dict]) -> list[dict]:
    edges: list[dict] = []
    start_node = next((node for node in nodes if node["nodeType"] == "start"), None)
    end_node = next((node for node in nodes if node["nodeType"] == "end"), None)
    clip_nodes = sorted(
        [node for node in nodes if node["nodeType"] == "clip"],
        key=lambda item: _safe_float(item.get("data", {}).get("order"), 0.0),
    )
    transition_map = {
        node.get("data", {}).get("afterClipId"): node
        for node in nodes
        if node["nodeType"] == "transition" and node.get("data", {}).get("afterClipId")
    }

    previous_id = start_node["id"] if start_node else None

    for index, clip_node in enumerate(clip_nodes):
        if previous_id:
            edges.append(
                {
                    "id": f"edge-{previous_id}-{clip_node['id']}",
                    "sourceId": previous_id,
                    "targetId": clip_node["id"],
                }
            )
        transition_node = transition_map.get(clip_node["id"])
        next_clip = clip_nodes[index + 1] if index + 1 < len(clip_nodes) else None
        if transition_node and next_clip:
            edges.append(
                {
                    "id": f"edge-{clip_node['id']}-{transition_node['id']}",
                    "sourceId": clip_node["id"],
                    "targetId": transition_node["id"],
                }
            )
            previous_id = transition_node["id"]
        else:
            previous_id = clip_node["id"]
        for filter_node in [
            node
            for node in nodes
            if node["nodeType"] == "filter"
            and node.get("data", {}).get("clipId") == clip_node["id"]
        ]:
            edges.append(
                {
                    "id": f"edge-{clip_node['id']}-{filter_node['id']}",
                    "sourceId": clip_node["id"],
                    "targetId": filter_node["id"],
                    "label": "滤镜",
                }
            )

    if end_node and previous_id and previous_id != end_node["id"]:
        edges.append(
            {
                "id": f"edge-{previous_id}-{end_node['id']}",
                "sourceId": previous_id,
                "targetId": end_node["id"],
            }
        )
    return edges


def _build_graph_from_segments(prompt: str, segments: list[dict], summary: str) -> dict:
    nodes = [
        {
            "id": "arrangement-start",
            "nodeType": "start",
            "title": "开始",
            "subtitle": "AI 剪辑起点",
            "x": 32,
            "y": 40,
            "data": {"label": prompt[:30] or "开始"},
        }
    ]
    visual_index = 0
    for order, segment in enumerate(sorted(segments, key=lambda item: item["timelineIn"])):
        asset = segment["asset"]
        clip_type = _clip_type_from_file_type(asset["fileType"])
        is_audio = clip_type == "audio"
        clip_id = _new_id("clip")
        clip_x = 180 + order * 240
        clip_y = 120 + segment["trackIndex"] * (160 if not is_audio else 90)
        if is_audio:
            clip_y = 380 + segment["trackIndex"] * 100
        nodes.append(
            {
                "id": clip_id,
                "nodeType": "clip",
                "title": segment["title"],
                "subtitle": segment["reason"] or asset.get("description") or asset["fileName"],
                "x": clip_x,
                "y": clip_y,
                "data": {
                    "order": order,
                    "label": segment["title"],
                    "reason": segment["reason"],
                    "assetGuid": asset["guid"],
                    "filePath": asset["filePath"],
                    "fileName": asset["fileName"],
                    "fileType": asset["fileType"],
                    "clipType": clip_type,
                    "trackType": segment["trackType"],
                    "trackIndex": segment["trackIndex"],
                    "timelineIn": segment["timelineIn"],
                    "duration": segment["duration"],
                    "sourceIn": segment["sourceIn"],
                    "sourceOut": segment["sourceOut"],
                    "tags": asset["tags"],
                },
            }
        )
        if segment.get("transitionType"):
            nodes.append(
                {
                    "id": _new_id("transition"),
                    "nodeType": "transition",
                    "title": f"转场 · {segment['transitionType']}",
                    "subtitle": "连接前后片段",
                    "x": clip_x + 110,
                    "y": clip_y - 105,
                    "data": {
                        "order": order,
                        "afterClipId": clip_id,
                        "transitionType": segment["transitionType"],
                        "duration": segment["transitionDuration"] or 0.8,
                        "params": {"intensity": 1},
                    },
                }
            )
        if segment.get("filterType"):
            nodes.append(
                {
                    "id": _new_id("filter"),
                    "nodeType": "filter",
                    "title": f"滤镜 · {segment['filterType']}",
                    "subtitle": "作用于当前片段",
                    "x": clip_x,
                    "y": clip_y + 120,
                    "data": {
                        "order": visual_index,
                        "clipId": clip_id,
                        "filterType": segment["filterType"],
                        "timelineIn": segment["timelineIn"],
                        "duration": segment["filterDuration"] or segment["duration"],
                        "params": {"intensity": 1},
                    },
                }
            )
        if not is_audio:
            visual_index += 1

    nodes.append(
        {
            "id": "arrangement-end",
            "nodeType": "end",
            "title": "结束",
            "subtitle": summary or "生成时间线",
            "x": 180 + max(len(segments), 1) * 240,
            "y": 40,
            "data": {},
        }
    )
    return {
        "nodes": nodes,
        "edges": _build_edges(nodes),
    }


def _make_track(track_type: str, index: int, sort_order: int) -> dict:
    now = _now_iso()
    return {
        "id": _new_id(f"{track_type}_track"),
        "type": track_type,
        "name": f"{'Video' if track_type == 'video' else 'Audio'} {index + 1}",
        "clips": [],
        "muted": False,
        "locked": False,
        "hidden": False,
        "height": 60 if track_type == "video" else 50,
        "sortOrder": sort_order,
        "createdAt": now,
        "updatedAt": now,
    }


def build_timeline_from_graph(graph: dict | None) -> dict:
    if not isinstance(graph, dict):
        return {"tracks": [], "filterClips": [], "duration": 0.0}
    now = _now_iso()
    clip_nodes = [
        node
        for node in graph.get("nodes", [])
        if isinstance(node, dict) and node.get("nodeType") == "clip"
    ]
    filter_nodes = [
        node
        for node in graph.get("nodes", [])
        if isinstance(node, dict) and node.get("nodeType") == "filter"
    ]
    transition_nodes = {
        node.get("data", {}).get("afterClipId"): node
        for node in graph.get("nodes", [])
        if isinstance(node, dict)
        and node.get("nodeType") == "transition"
        and isinstance(node.get("data"), dict)
        and node.get("data", {}).get("afterClipId")
    }

    max_video_track = max(
        [
            _safe_int(node.get("data", {}).get("trackIndex"), 0)
            for node in clip_nodes
            if _safe_str(node.get("data", {}).get("trackType"), "video") == "video"
        ]
        or [0]
    )
    max_audio_track = max(
        [
            _safe_int(node.get("data", {}).get("trackIndex"), 0)
            for node in clip_nodes
            if _safe_str(node.get("data", {}).get("trackType")) == "audio"
        ]
        or [0]
    )

    video_tracks = [_make_track("video", index, index) for index in range(max(3, max_video_track + 1))]
    audio_tracks = [_make_track("audio", index, len(video_tracks) + index) for index in range(max(1, max_audio_track + 1))]
    tracks = video_tracks + audio_tracks

    track_lookup = {
        f"video:{index}": video_tracks[index] for index in range(len(video_tracks))
    }
    track_lookup.update(
        {f"audio:{index}": audio_tracks[index] for index in range(len(audio_tracks))}
    )

    clip_end_times: dict[str, float] = {}
    filter_clips: list[dict] = []
    duration = 0.0

    for node in sorted(
        clip_nodes,
        key=lambda item: _safe_float(item.get("data", {}).get("order"), 0.0),
    ):
        data = node.get("data", {}) if isinstance(node.get("data"), dict) else {}
        track_type = _safe_str(data.get("trackType"), "video")
        track_index = max(0, _safe_int(data.get("trackIndex"), 0))
        track = track_lookup.get(f"{track_type}:{track_index}")
        if not track:
            continue
        clip_type = _safe_str(data.get("clipType"), _clip_type_from_file_type(_safe_str(data.get("fileType"))))
        clip_duration = max(0.1, _safe_float(data.get("duration"), 3.0))
        source_in = max(0.0, _safe_float(data.get("sourceIn"), 0.0))
        source_out = _safe_float(data.get("sourceOut"), source_in + clip_duration)
        if source_out <= source_in:
            source_out = source_in + clip_duration
        timeline_in = max(0.0, _safe_float(data.get("timelineIn"), 0.0))
        transition_node = transition_nodes.get(node.get("id"))
        transition_out = None
        if transition_node:
            transition_data = (
                transition_node.get("data", {})
                if isinstance(transition_node.get("data"), dict)
                else {}
            )
            transition_type = _safe_str(transition_data.get("transitionType"))
            if transition_type and clip_type != "audio":
                transition_out = {
                    "id": transition_node.get("id") or _new_id("transition"),
                    "type": transition_type,
                    "duration": max(0.1, _safe_float(transition_data.get("duration"), 0.8)),
                    "params": copy.deepcopy(transition_data.get("params") or {"intensity": 1}),
                }
        clip = {
            "id": node.get("id") or _new_id("clip"),
            "trackId": track["id"],
            "type": clip_type,
            "assetRef": {
                "guid": _safe_str(data.get("assetGuid"), _new_id("asset")),
                "filePath": _safe_str(data.get("filePath")),
                "fileName": _safe_str(data.get("fileName"), node.get("title") or "Untitled"),
                "fileType": _safe_str(data.get("fileType"), "video/mp4"),
                "duration": max(
                    clip_duration,
                    _safe_float(data.get("sourceOut"), clip_duration),
                ),
            },
            "sourceIn": source_in,
            "sourceOut": source_out,
            "timelineIn": timeline_in,
            "speed": 1,
            "volume": 1,
            "opacity": 1,
            "transform": {"x": 0, "y": 0, "scale": 1, "rotation": 0},
            "effects": [],
            "transitionIn": None,
            "transitionOut": transition_out,
            "text": None,
            "sticker": None,
            "createdAt": now,
            "updatedAt": now,
        }
        track["clips"].append(clip)
        clip_end = timeline_in + clip_duration
        clip_end_times[str(node.get("id"))] = clip_end
        duration = max(duration, clip_end)

    for filter_node in filter_nodes:
        data = filter_node.get("data", {}) if isinstance(filter_node.get("data"), dict) else {}
        filter_type = _safe_str(data.get("filterType"))
        if not filter_type:
            continue
        clip_id = _safe_str(data.get("clipId"))
        timeline_in = max(
            0.0,
            _safe_float(data.get("timelineIn"), 0.0),
        )
        if clip_id and timeline_in == 0.0 and clip_id in clip_end_times:
            linked_clip = next(
                (node for node in clip_nodes if node.get("id") == clip_id),
                None,
            )
            if linked_clip:
                timeline_in = _safe_float(
                    linked_clip.get("data", {}).get("timelineIn"),
                    timeline_in,
                )
        filter_duration = max(
            0.1,
            _safe_float(data.get("duration"), clip_end_times.get(clip_id, 3.0) - timeline_in),
        )
        filter_clips.append(
            {
                "id": filter_node.get("id") or _new_id("filter"),
                "type": filter_type,
                "timelineIn": timeline_in,
                "duration": filter_duration,
                "params": copy.deepcopy(data.get("params") or {"intensity": 1}),
            }
        )
        duration = max(duration, timeline_in + filter_duration)

    for track in tracks:
        track["clips"].sort(key=lambda item: item.get("timelineIn", 0))

    return {
        "tracks": tracks,
        "filterClips": filter_clips,
        "duration": duration,
    }


def generate_clip_arrangement_config(params: dict | None) -> dict:
    payload = params if isinstance(params, dict) else {}
    prompt = _safe_str(payload.get("prompt"))
    project = payload.get("project") if isinstance(payload.get("project"), dict) else {}
    plan = payload.get("plan") if isinstance(payload.get("plan"), dict) else None
    normalized_assets = [
        asset
        for asset in (
            _normalize_asset(raw_asset)
            for raw_asset in payload.get("assets", []) if isinstance(payload.get("assets"), list)
        )
        if asset
    ]
    warnings: list[str] = []
    segments = _normalize_plan_segments(plan, normalized_assets, prompt, warnings)
    summary = _safe_str(
        (plan or {}).get("summary"),
        f"共规划 {len([item for item in segments if item['trackType'] == 'video'])} 个画面片段",
    )
    graph = _build_graph_from_segments(prompt, segments, summary)
    timeline = build_timeline_from_graph(graph)
    if isinstance(project, dict):
        timeline["tracks"] = timeline.get("tracks", [])
    return {
        "prompt": prompt,
        "summary": summary,
        "warnings": warnings,
        "graph": graph,
        "timeline": timeline,
        "usedAssets": normalized_assets,
    }


@handler("generateClipArrangementConfig")
def generate_clip_arrangement_config_handler(params):
    return generate_clip_arrangement_config(params if isinstance(params, dict) else None)


@handler("buildClipArrangementTimeline")
def build_clip_arrangement_timeline_handler(params):
    payload = params if isinstance(params, dict) else {}
    graph = payload.get("graph")
    return build_timeline_from_graph(graph if isinstance(graph, dict) else None)
