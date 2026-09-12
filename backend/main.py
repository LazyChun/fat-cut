"""
FatNotes Bespoke Plugin — fat-cut Backend Entry Point

视频剪辑插件后端：工程配置 CRUD + 工程详情读写 + ffmpeg 探测/执行。
前端通过 sdk.backend.invoke("handlerName", params) 调用。
"""

from plugin_runtime import (
    handler,
    run,
    host_get_login_info,
    host_get_plugin_config,
    host_set_plugin_config,
    host_get_system_paths,
)

# 导入即注册 @handler（getProject / saveProject / probeAsset / runFfmpeg / exportProject ...）
from service.projectService import projectService as _project_service  # noqa: F401
from service.ffmpegUtil import ffmpegUtil as _ffmpeg_util  # noqa: F401
from service.exportService import exportService as _export_service  # noqa: F401
from service.aiArrangementService import aiArrangementService as _ai_arrangement_service  # noqa: F401
from service.assetInfoService import assetInfoService as _asset_info_service  # noqa: F401

from service.init.initCutService import (
    create_project_record,
    delete_project_record,
    get_projects_file,
    read_projects,
    reorder_projects,
    update_project_record,
)


@handler("hello")
def hello(params):
    name = params.get("name", "World")
    return {"message": f"Hello from fat-cut backend, {name}!"}


@handler("echo")
def echo(params):
    return {"received": params}


@handler("getSystemPaths")
def get_system_paths(_params):
    return host_get_system_paths()


@handler("getLoginInfo")
def get_login_info(_params):
    return host_get_login_info()


@handler("getPluginConfig")
def get_plugin_config(_params):
    return host_get_plugin_config()


@handler("setPluginConfig")
def set_plugin_config(params):
    config_data = params.get("config", {}) if isinstance(params, dict) else {}
    merge = True
    if isinstance(params, dict):
        merge = bool(params.get("merge", True))
    return host_set_plugin_config(config_data, merge=merge)


# ── 工程列表 CRUD ──────────────────────────────────────────────


@handler("listProjects")
def list_projects(_params):
    """读取工程列表（含缩略图：首个视频/图片片段的素材路径）。"""
    items = read_projects()
    for item in items:
        project_id = item.get("id")
        if not project_id:
            continue
        project = _project_service.read_project(project_id)
        item["thumbnail"] = (
            _project_service.extract_thumbnail(project) if project else None
        )
    return {
        "items": items,
        "filePath": str(get_projects_file()),
    }


@handler("createProject")
def create_project(params):
    """新建工程（初始化 project.json + 默认 3 条视频轨道 + 1 条音频轨道）。"""
    return create_project_record(params if isinstance(params, dict) else None)


@handler("updateProject")
def update_project(params):
    """更新工程列表元数据（name/description）。"""
    return update_project_record(params if isinstance(params, dict) else None)


@handler("deleteProject")
def delete_project(params):
    """删除工程（列表记录 + projects/<id>/ 目录）。"""
    return delete_project_record(params if isinstance(params, dict) else None)


@handler("reorderProjects")
def reorder_projects_handler(params):
    """按给定 id 顺序重排工程列表。"""
    return reorder_projects(params if isinstance(params, dict) else None)


if __name__ == "__main__":
    run()
