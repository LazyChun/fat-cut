import json
from pathlib import Path

from plugin_runtime import handler
from service.init.initCutService import (
    PROJECT_FILE_NAME,
    _write_json,
    get_project_dir,
    require_project_record,
    touch_project_record,
)


def get_project_file(project_id: str) -> Path:
    return get_project_dir(project_id) / PROJECT_FILE_NAME


def ensure_project_storage(project_id: str) -> Path:
    project_folder = get_project_dir(project_id)
    project_folder.mkdir(parents=True, exist_ok=True)
    return project_folder


def read_project(project_id: str) -> dict | None:
    project_file = get_project_file(project_id)
    if not project_file.exists():
        return None
    content = project_file.read_text(encoding="utf-8").strip()
    if not content:
        return None
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        # 解析失败时不覆盖原文件，保留数据以便恢复
        return None
    if not isinstance(data, dict):
        return None
    return data


def write_project(project_id: str, project: dict) -> None:
    ensure_project_storage(project_id)
    _write_json(get_project_file(project_id), project)


def extract_thumbnail(project: dict) -> str | None:
    """从工程 tracks 中提取首个视频/图片片段的素材路径作为缩略图。"""
    if not isinstance(project, dict):
        return None
    tracks = project.get("tracks")
    if not isinstance(tracks, list):
        return None
    video_tracks = [
        t for t in tracks if isinstance(t, dict) and t.get("type") == "video"
    ]
    video_tracks.sort(key=lambda t: t.get("sortOrder", 0))
    for track in video_tracks:
        clips = track.get("clips")
        if not isinstance(clips, list):
            continue
        clips_sorted = sorted(
            [c for c in clips if isinstance(c, dict)],
            key=lambda c: c.get("timelineIn", 0),
        )
        for clip in clips_sorted:
            if clip.get("type") not in ("video", "image"):
                continue
            asset_ref = clip.get("assetRef")
            if isinstance(asset_ref, dict):
                file_path = asset_ref.get("filePath")
                if file_path:
                    return file_path
    return None


@handler("getProject")
def get_project(params):
    """读取工程完整配置。"""
    project_id = str((params or {}).get("id") or "").strip()
    if not project_id:
        raise ValueError("id is required")
    require_project_record(project_id)
    project = read_project(project_id)
    if project is None:
        raise ValueError(f"Project file not found or corrupted for id {project_id}")
    return {
        "project": project,
        "filePath": str(get_project_file(project_id)),
    }


@handler("saveProject")
def save_project(params):
    """保存工程完整配置（原子写）。"""
    if not isinstance(params, dict):
        raise ValueError("params must be a dict")
    project = params.get("project")
    if not isinstance(project, dict):
        raise ValueError("project is required")
    project_id = str(project.get("id") or "").strip()
    if not project_id:
        raise ValueError("project.id is required")
    require_project_record(project_id)

    # 更新 updatedAt
    from service.init.initCutService import _now_iso
    project["updatedAt"] = _now_iso()
    write_project(project_id, project)

    # 同步列表元数据
    touch_project_record(project_id, project.get("name"))

    return {
        "project": project,
        "filePath": str(get_project_file(project_id)),
    }
