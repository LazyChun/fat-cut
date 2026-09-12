import json
import os
import shutil
import subprocess
import sys

from plugin_runtime import handler


def _ffmpeg_home() -> str:
    return os.environ.get("FFMPEG_HOME") or os.environ.get("FFMPEG_PATH") or ""


def get_ffmpeg_path() -> str:
    home = _ffmpeg_home()
    if home:
        exe_name = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
        exe = os.path.join(home, exe_name)
        if os.path.exists(exe):
            return exe
    found = shutil.which("ffmpeg") or shutil.which("ffmpeg.exe")
    if found:
        return found
    return ""


def get_ffprobe_path() -> str:
    home = _ffmpeg_home()
    if home:
        exe_name = "ffprobe.exe" if sys.platform == "win32" else "ffprobe"
        exe = os.path.join(home, exe_name)
        if os.path.exists(exe):
            return exe
    found = shutil.which("ffprobe") or shutil.which("ffprobe.exe")
    if found:
        return found
    return ""


def probe_asset(file_path: str) -> dict:
    """用 ffprobe 探测媒体文件时长/分辨率/编码。"""
    ffprobe = get_ffprobe_path()
    if not ffprobe:
        raise RuntimeError("ffprobe not found. Ensure FFMPEG_HOME is set by host.")
    file_path = str(file_path or "").strip()
    if not file_path:
        raise ValueError("filePath is required")
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    cmd = [
        ffprobe,
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file_path,
    ]
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"ffprobe failed (code {result.returncode}): {result.stderr.strip()}"
        )

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"ffprobe returned invalid JSON: {e}") from e

    fmt = data.get("format") or {}
    streams = data.get("streams") or []

    duration = 0.0
    try:
        duration = float(fmt.get("duration") or 0)
    except (TypeError, ValueError):
        duration = 0.0

    width = 0
    height = 0
    codec = ""
    file_type = fmt.get("format_name") or ""
    for stream in streams:
        if stream.get("codec_type") == "video":
            width = int(stream.get("width") or 0)
            height = int(stream.get("height") or 0)
            codec = stream.get("codec_name") or ""
            break

    return {
        "duration": duration,
        "width": width,
        "height": height,
        "codec": codec,
        "fileType": file_type,
    }


def run_ffmpeg(args: list) -> dict:
    """通用 ffmpeg 执行器。"""
    ffmpeg = get_ffmpeg_path()
    if not ffmpeg:
        raise RuntimeError("ffmpeg not found. Ensure FFMPEG_HOME is set by host.")
    if not isinstance(args, list):
        raise ValueError("args must be a list")
    cmd = [ffmpeg] + [str(a) for a in args]
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    return {
        "returncode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }


@handler("probeAsset")
def probe_asset_handler(params):
    """探测素材时长/分辨率。"""
    file_path = str((params or {}).get("filePath") or "").strip()
    return probe_asset(file_path)


@handler("runFfmpeg")
def run_ffmpeg_handler(params):
    """通用 ffmpeg 执行。"""
    args = (params or {}).get("args") or []
    if not isinstance(args, list):
        raise ValueError("args must be a list")
    return run_ffmpeg(args)
