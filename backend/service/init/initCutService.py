import json
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from plugin_runtime import host_get_system_paths


FAT_CUT_DIR_NAME = "fatCut"
PROJECTS_FILE_NAME = "projects.json"
PROJECT_FILE_NAME = "project.json"



DEFAULT_FPS = 30
DEFAULT_WIDTH = 1920
DEFAULT_HEIGHT = 1080
DEFAULT_BACKGROUND_COLOR = "#000000"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


_cached_workspace_root: Path | None = None





def get_workspace_root() -> Path:
    global _cached_workspace_root
    if _cached_workspace_root is not None:
        return _cached_workspace_root

    try:
        system_paths = host_get_system_paths() or {}
    except Exception:
        system_paths = {}

    last_closed_folder = str(system_paths.get("lastClosedFolder") or "").strip()
    if last_closed_folder:
        _cached_workspace_root = Path(last_closed_folder)
        return _cached_workspace_root

    config_absolute_path = str(system_paths.get("configAbsolutePath") or "").strip()
    if config_absolute_path:
        _cached_workspace_root = Path(config_absolute_path).parent
        return _cached_workspace_root

    _cached_workspace_root = Path.cwd()
    return _cached_workspace_root


def get_cut_dir() -> Path:
    return get_workspace_root() / FAT_CUT_DIR_NAME


def get_projects_file() -> Path:
    return get_cut_dir() / PROJECTS_FILE_NAME


def get_projects_data_dir() -> Path:
    return get_cut_dir() / "projects"


def get_project_dir(project_id: str) -> Path:
    return get_projects_data_dir() / project_id


def _atomic_write(file_path: Path, content: str) -> None:
    dir_path = file_path.parent
    dir_path.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(suffix=".tmp", dir=str(dir_path))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        os.replace(tmp_path, str(file_path))
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _write_json(file_path: Path, data) -> None:
    content = json.dumps(data, ensure_ascii=False, indent=2)
    _atomic_write(file_path, content)


def write_projects(items: list[dict]) -> None:
    _write_json(get_projects_file(), items)


def ensure_projects_storage() -> Path:
    cut_dir = get_cut_dir()
    cut_dir.mkdir(parents=True, exist_ok=True)

    projects_file = get_projects_file()
    if not projects_file.exists():
        write_projects([])
        return projects_file

    content = projects_file.read_text(encoding="utf-8").strip()
    if not content:
        write_projects([])

    return projects_file


def read_projects() -> list[dict]:
    projects_file = ensure_projects_storage()
    content = projects_file.read_text(encoding="utf-8").strip()
    if not content:
        return []

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        # 解析失败时不覆盖原文件，保留数据以便恢复
        return []

    if not isinstance(data, list):
        return []

    return [item for item in data if isinstance(item, dict)]


def require_project_record(project_id: str) -> dict:
    project_id = str(project_id or "").strip()
    if not project_id:
        raise ValueError("projectId is required")

    project = next(
        (item for item in read_projects() if item.get("id") == project_id),
        None,
    )
    if not project:
        raise ValueError(f"Project with id {project_id} not found")
    return project


def _build_default_tracks(now: str) -> list[dict]:
    tracks: list[dict] = []
    for i in range(3):
        tracks.append(
            {
                "id": uuid4().hex[:8],
                "type": "video",
                "name": f"Video {i + 1}",
                "clips": [],
                "muted": False,
                "locked": False,
                "hidden": False,
                "height": 60,
                "sortOrder": i,
                "createdAt": now,
                "updatedAt": now,
            }
        )
    tracks.append(
        {
            "id": uuid4().hex[:8],
            "type": "audio",
            "name": "Audio 1",
            "clips": [],
            "muted": False,
            "locked": False,
            "hidden": False,
            "height": 50,
            "sortOrder": 3,
            "createdAt": now,
            "updatedAt": now,
        }
    )
    return tracks


def create_project_record(params: dict | None) -> dict:
    project_name = str(params.get("name") or "").strip() if isinstance(params, dict) else ""
    if not project_name:
        raise ValueError("name is required")

    description = str(params.get("description") or "").strip() if isinstance(params, dict) else ""

    now = _now_iso()
    project_id = uuid4().hex[:6]
    project_item = {
        "id": project_id,
        "name": project_name,
        "description": description,
        "createdAt": now,
        "updatedAt": now,
    }

    # 创建 projects/<id> 目录并初始化 project.json
    project_folder = get_project_dir(project_id)
    project_folder.mkdir(parents=True, exist_ok=True)

    full_project = {
        "id": project_id,
        "name": project_name,
        "description": description,
        "fps": DEFAULT_FPS,
        "width": DEFAULT_WIDTH,
        "height": DEFAULT_HEIGHT,
        "backgroundColor": DEFAULT_BACKGROUND_COLOR,
        "tracks": _build_default_tracks(now),
        "createdAt": now,
        "updatedAt": now,
    }
    _write_json(project_folder / PROJECT_FILE_NAME, full_project)

    projects = read_projects()
    projects.append(project_item)
    write_projects(projects)
    return project_item


def update_project_record(params: dict | None) -> dict:
    if not isinstance(params, dict):
        raise ValueError("params must be a dict")

    project_id = str(params.get("id") or "").strip()
    if not project_id:
        raise ValueError("id is required")

    projects = read_projects()
    target_idx = next(
        (i for i, p in enumerate(projects) if p.get("id") == project_id), -1
    )
    if target_idx == -1:
        raise ValueError(f"Project with id {project_id} not found")

    project = projects[target_idx]

    if "name" in params:
        name = str(params.get("name") or "").strip()
        if not name:
            raise ValueError("name is required")
        project["name"] = name

    if "description" in params:
        project["description"] = str(params.get("description") or "").strip()

    project["updatedAt"] = _now_iso()
    write_projects(projects)
    return project


def delete_project_record(params: dict | None) -> dict:
    if not isinstance(params, dict):
        raise ValueError("params must be a dict")

    project_id = str(params.get("id") or "").strip()
    if not project_id:
        raise ValueError("id is required")

    projects = read_projects()
    target_idx = next(
        (i for i, p in enumerate(projects) if p.get("id") == project_id), -1
    )
    if target_idx == -1:
        raise ValueError(f"Project with id {project_id} not found")

    deleted = projects.pop(target_idx)
    write_projects(projects)

    project_folder = get_project_dir(project_id)
    if project_folder.exists() and project_folder.is_dir():
        shutil.rmtree(project_folder)

    return deleted


def reorder_projects(params: dict | None) -> list[dict]:
    if not isinstance(params, dict):
        raise ValueError("params must be a dict")

    project_ids = params.get("ids")
    if not isinstance(project_ids, list):
        raise ValueError("ids must be a list")

    projects = read_projects()
    projects_dict = {p.get("id"): p for p in projects}

    new_projects = []
    for pid in project_ids:
        if pid in projects_dict:
            new_projects.append(projects_dict[pid])

    existing_ids = set(project_ids)
    for p in projects:
        if p.get("id") not in existing_ids:
            new_projects.append(p)

    write_projects(new_projects)
    return new_projects


def touch_project_record(project_id: str, name: str | None = None) -> None:
    """更新列表中工程的 updatedAt（与可选 name），不改动 project.json。"""
    project_id = str(project_id or "").strip()
    if not project_id:
        return
    projects = read_projects()
    target_idx = next(
        (i for i, p in enumerate(projects) if p.get("id") == project_id), -1
    )
    if target_idx == -1:
        return
    if name is not None:
        projects[target_idx]["name"] = name
    projects[target_idx]["updatedAt"] = _now_iso()
    write_projects(projects)
