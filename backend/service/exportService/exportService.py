"""
fat-cut 视频导出服务。

将 CutProject 的时间线翻译为 ffmpeg filter_complex 管线并执行,
后台线程运行 + 模块级 dict 上报进度,前端轮询 getExportProgress。

支持的 v1 范围:
- video/image clip:裁剪、变速、缩放、位移、不透明度、自身音轨混入
- 基础效果(brightness/contrast/saturate/blur/mirror/sepia/invert/blackwhite/hue 等)
- text clip:drawtext 渲染
- sticker clip:emoji 走 Pillow 渲染 PNG + overlay(保留彩色),image 走 overlay
- audio clip:裁剪、变速、音量、混音
- 多轨视频叠加(按 sortOrder 降序 overlay,底层在前、顶层在后,与前端预览一致)
- 坐标转换:前端 transform.x/y 为 canvas 像素,导出时按 project/canvas 比例换算
- 转场(fade/slide/push/zoom/fadeBlack/fadeWhite 等):对 outgoing 片段最后
  duration 秒应用退出动画,与预览 getActiveTransition 行为一致

跳过:复杂动态特效(shake/glitch 等)、旋转
"""

import os
import re
import subprocess
import sys
import threading
import uuid
from datetime import datetime
from pathlib import Path

from plugin_runtime import handler
from service.ffmpegUtil.ffmpegUtil import get_ffmpeg_path, get_ffprobe_path
from service.init.initCutService import get_cut_dir


# ── 时间线工具(Python 等价于 src/utils/clip.ts) ────────────────

def _timeline_duration(clip):
    speed = float(clip.get("speed") or 1)
    if speed <= 0:
        return 0
    return (float(clip.get("sourceOut", 0)) - float(clip.get("sourceIn", 0))) / speed


def _timeline_out(clip):
    return float(clip.get("timelineIn", 0)) + _timeline_duration(clip)


def _get_timeline_end(tracks):
    end = 0.0
    for track in tracks:
        for clip in track.get("clips", []):
            out = _timeline_out(clip)
            if out > end:
                end = out
    return end


# ── 工具函数 ────────────────────────────────────────────────────

def _even(n):
    """保证偶数(ffmpeg h264 要求偶数尺寸)。"""
    return max(2, int(round(n / 2.0)) * 2)


def _num(params, key, fallback=0):
    v = params.get(key) if isinstance(params, dict) else None
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else fallback


def _safe_filename(name):
    name = str(name or "").strip()
    name = re.sub(r'[\\/:*?"<>|]', "_", name)
    return name[:80] or "export"


def _hex_to_ffmpeg_color(hex_color):
    """'#ffffff' -> '0xffffff',兼容 rgba()/rgb() CSS 颜色与已有颜色名。

    FFmpeg drawtext/boxcolor 不支持 CSS 的 rgba() 语法,需转为 0xRRGGBBAA 格式。
    """
    c = str(hex_color or "").strip()
    if not c:
        return "0x000000"

    # CSS rgba(r,g,b,a) / rgb(r,g,b) -> 0xRRGGBB[AA]
    if c.startswith("rgba(") or c.startswith("rgb("):
        try:
            inner = c[c.index("(") + 1:c.rindex(")")]
            parts = [p.strip() for p in inner.split(",")]
            r = max(0, min(255, int(float(parts[0]))))
            g = max(0, min(255, int(float(parts[1]))))
            b = max(0, min(255, int(float(parts[2]))))
            if len(parts) == 4:
                a = max(0.0, min(1.0, float(parts[3])))
                alpha = round(a * 255)
                return f"0x{r:02x}{g:02x}{b:02x}{alpha:02x}"
            return f"0x{r:02x}{g:02x}{b:02x}"
        except (ValueError, IndexError):
            return "0x000000"

    if c.startswith("#"):
        return "0x" + c[1:]
    return c or "0x000000"


def _build_keyframe_expr(clip, property_name, base_value, time_var="t", is_overlay=False):
    """
    生成针对指定关键帧属性的 FFmpeg 线性插值表达式。
    is_overlay=True 时, time_var 代表全局时间线时间,需减去 clip['timelineIn'] 得到局部时间。
    否则 time_var 代表局部时间。
    """
    tracks = clip.get("keyframes", [])
    track = next((trk for trk in tracks if trk.get("property") == property_name), None)
    if not track or not track.get("keyframes"):
        return str(base_value)
        
    keyframes = track.get("keyframes")
    if not keyframes:
        return str(base_value)
        
    keyframes = sorted(keyframes, key=lambda k: float(k.get("time", 0)))
    
    if is_overlay:
        timeline_in = float(clip.get("timelineIn", 0))
        lt = f"({time_var}-{timeline_in})"
    else:
        lt = time_var
        
    def build_interp(i):
        if i >= len(keyframes) - 1:
            return str(keyframes[-1].get("value", 0))
            
        k1 = keyframes[i]
        k2 = keyframes[i+1]
        t1 = float(k1.get("time", 0))
        t2 = float(k2.get("time", 0))
        v1 = float(k1.get("value", 0))
        v2 = float(k2.get("value", 0))
        
        if t1 == t2:
            expr = str(v2)
        else:
            slope = (v2 - v1) / (t2 - t1)
            if slope == 0:
                expr = str(v1)
            else:
                expr = f"({v1}+({slope})*({lt}-{t1}))"
                
        next_expr = build_interp(i + 1)
        return f"if(lte({lt},{t2}),{expr},{next_expr})"

    t0 = float(keyframes[0].get("time", 0))
    v0 = float(keyframes[0].get("value", 0))
    
    first_cond = f"if(lte({lt},{t0}),{v0},{build_interp(0)})"
    return first_cond


def _has_audio_stream(file_path):
    ffprobe = get_ffprobe_path()
    if not ffprobe:
        return False
    try:
        cmd = [
            ffprobe, "-v", "quiet",
            "-select_streams", "a",
            "-show_entries", "stream=codec_type",
            "-of", "csv=p=0",
            str(file_path),
        ]
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=10, check=False
        )
        return bool(result.stdout.strip())
    except Exception:
        return False


def _find_font_file():
    """探测系统默认字体文件供 drawtext 使用。"""
    candidates = []
    if sys.platform == "win32":
        candidates = [
            "C:/Windows/Fonts/msyh.ttc",
            "C:/Windows/Fonts/simhei.ttf",
            "C:/Windows/Fonts/arial.ttf",
        ]
    elif sys.platform == "darwin":
        candidates = [
            "/System/Library/Fonts/PingFang.ttc",
            "/System/Library/Fonts/Helvetica.ttc",
            "/Library/Fonts/Arial.ttf",
        ]
    else:
        candidates = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return ""


def _find_emoji_font_file():
    """探测系统 emoji 字体文件供 sticker(emoji) drawtext 使用。

    彩色 emoji 能否正确渲染取决于 ffmpeg 是否链接了支持彩色字体的
    libfreetype;此处仅尽量挑出系统中的 emoji 字体。
    """
    candidates = []
    if sys.platform == "win32":
        candidates = [
            "C:/Windows/Fonts/seguiemj.ttf",  # Segoe UI Emoji(彩色)
            "C:/Windows/Fonts/seguisym.ttf",  # Segoe UI Symbol
        ]
    elif sys.platform == "darwin":
        candidates = [
            "/System/Library/Fonts/Apple Color Emoji.ttc",
            "/System/Library/Fonts/Apple Symbols.ttf",
        ]
    else:
        candidates = [
            "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
            "/usr/share/fonts/truetype/noto/NotoEmoji.ttf",
            "/usr/share/fonts/noto-color-emoji/NotoColorEmoji.ttf",
        ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return ""


def _escape_drawtext_text(text):
    """转义 drawtext text 参数中的特殊字符。"""
    text = str(text or "")
    text = text.replace("\\", "\\\\")
    text = text.replace("'", "\\'")
    text = text.replace(":", "\\:")
    text = text.replace("%", "\\%")
    return text


def _escape_fontfile(path):
    r"""Windows 路径中的冒号需要转义(C: -> C\:)。"""
    return str(path or "").replace("\\", "/").replace(":", "\\:")


def _render_emoji_to_png(content, pixel_size, font_path, output_path):
    """用 Pillow 将彩色 emoji 渲染为透明背景 PNG。

    ffmpeg drawtext 无法可靠渲染彩色 emoji(CBDT/CBLC 表),
    故先用 Pillow 的 embedded_color=True 渲染为 PNG,再用 overlay 叠加。
    渲染后裁剪透明边距,使 emoji 填满整张 PNG,与前端 fontSize 行为一致。

    返回 True 表示成功,output_path 处已生成 PNG 文件。
    """
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return False

    if not content or pixel_size <= 0:
        return False

    # 画布留 50% 余量给字体的 ascent/descent 与边距
    canvas_px = int(pixel_size * 1.5)
    img = Image.new("RGBA", (canvas_px, canvas_px), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    try:
        font = ImageFont.truetype(font_path, int(pixel_size), embedded_color=True)
    except Exception:
        # 老版本 Pillow 不支持 embedded_color 参数
        try:
            font = ImageFont.truetype(font_path, int(pixel_size))
        except Exception:
            return False

    try:
        bbox = draw.textbbox((0, 0), content, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        x = (canvas_px - tw) / 2 - bbox[0]
        y = (canvas_px - th) / 2 - bbox[1]
        try:
            draw.text((x, y), content, font=font, embedded_color=True)
        except TypeError:
            draw.text((x, y), content, font=font)
    except Exception:
        return False

    # 裁剪透明边距,使 emoji 填满整张 PNG
    try:
        crop_box = img.getbbox()
        if crop_box:
            img = img.crop(crop_box)
    except Exception:
        pass

    try:
        img.save(output_path, "PNG")
        return True
    except Exception:
        return False


def _atempo_chain(speed):
    """atempo 仅支持 0.5-2.0,超出范围时链式串联。"""
    speed = max(0.01, min(100.0, float(speed)))
    parts = []
    remaining = speed
    while remaining > 2.0:
        parts.append("atempo=2.0")
        remaining /= 2.0
    while remaining < 0.5:
        parts.append("atempo=0.5")
        remaining /= 0.5
    parts.append(f"atempo={remaining:.4f}")
    return ",".join(parts)


# ── 效果/滤镜映射 ──────────────────────────────────────────────

def _effect_to_ffmpeg(effect):
    """将单个 effect 配置映射为 ffmpeg 视频滤镜字符串。
    返回 None 表示该效果无法映射(跳过)。
    """
    eff_type = effect.get("type", "")
    params = effect.get("params") or {}
    intensity = _num(params, "intensity", 1)

    if eff_type == "blackwhite":
        return f"hue=s={max(0.0, 1.0 - intensity):.3f}"
    if eff_type == "sepia":
        # 近似 sepia 矩阵
        return "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131"
    if eff_type == "invert":
        return "negate"
    if eff_type == "mirror":
        return "hflip"
    if eff_type == "blur":
        radius = max(1, int(intensity * 4))
        return f"boxblur=luma_radius={radius}:luma_power=1"
    if eff_type == "brightness":
        # CSS brightness(1)=正常,ffmpeg eq brightness(0)=正常
        return f"eq=brightness={intensity - 1.0:.3f}"
    if eff_type == "contrast":
        return f"eq=contrast={intensity:.3f}"
    if eff_type == "saturate":
        return f"eq=saturation={intensity:.3f}"
    if eff_type == "hueshift":
        return f"hue=h={intensity:.1f}"
    if eff_type == "chroma":
        return f"eq=saturation=2.0,hue=h={intensity * 90:.1f}"
    if eff_type == "glow":
        return f"eq=brightness={intensity * 0.3:.3f}:saturation={1 + intensity * 0.4:.3f}"
    if eff_type == "dreamy":
        return "boxblur=luma_radius=1:luma_power=1,eq=brightness=0.1:saturation=1.3"
    if eff_type == "fade":
        return "eq=contrast=0.85:brightness=0.1"
    if eff_type == "warm":
        return f"eq=saturation={1 + intensity * 0.5:.3f}:brightness={intensity * 0.1:.3f}"
    if eff_type == "cool":
        return f"hue=h={intensity * 20:.1f},eq=saturation={1 + intensity * 0.3:.3f}"
    if eff_type == "vintage":
        return f"eq=contrast={max(0.0, 1 - intensity * 0.2):.3f}:brightness={-intensity * 0.1:.3f}"
    if eff_type == "neon":
        return "eq=contrast=1.5:saturation=2.0:brightness=0.1"
    if eff_type == "thermal":
        return "hue=h=180,eq=saturation=2.0:brightness=0.1"
    if eff_type == "posterize":
        return f"eq=contrast={1 + intensity * 0.5:.3f}:saturation={1 + intensity * 0.5:.3f}"
    # 无法映射的效果(转场/动态特效/边框/自然等)跳过
    return None


def _build_effect_chain(effects):
    """将 clip.effects 转为 ffmpeg 滤镜链(逗号分隔)。"""
    parts = []
    for eff in effects or []:
        f = _effect_to_ffmpeg(eff)
        if f:
            parts.append(f)
    return ",".join(parts)


# ── 滤镜映射 ──────────────────────────────────────────────────

def _sepia_chain(amount):
    """通过 colorchannelmixer 近似实现 sepia 效果。

    amount ∈ [0, 1],0 = 无 sepia(单位矩阵),1 = 完整 sepia 矩阵。
    返回 None 表示无需应用(amount <= 0)。
    """
    n = max(0.0, min(1.0, float(amount)))
    if n <= 0:
        return None
    # 在单位矩阵与标准 sepia 矩阵之间线性插值
    r_r = 1 - 0.607 * n
    r_g = 0.769 * n
    r_b = 0.189 * n
    g_r = 0.349 * n
    g_g = 1 - 0.314 * n
    g_b = 0.168 * n
    b_r = 0.272 * n
    b_g = 0.534 * n
    b_b = 1 - 0.869 * n
    return (
        f"colorchannelmixer="
        f"{r_r:.3f}:{r_g:.3f}:{r_b:.3f}:"
        f"{g_r:.3f}:{g_g:.3f}:{g_b:.3f}:"
        f"{b_r:.3f}:{b_g:.3f}:{b_b:.3f}"
    )


def _filter_to_ffmpeg(filter_cfg):
    """将单个 filter 配置映射为 ffmpeg 视频滤镜字符串。

    与前端 filterCatalog.ts 中 cssBuilder 一一对应:intensity 缩放各分量。
    返回 None 表示该滤镜无法映射(跳过)。
    """
    ftype = filter_cfg.get("type", "")
    params = filter_cfg.get("params") or {}
    i = _num(params, "intensity", 1)
    if i <= 0:
        return None

    parts = []

    # 通用辅助:按 CSS 数值规律计算 ffmpeg eq 参数
    # CSS brightness(1)=正常,ffmpeg eq brightness(0)=正常 → 偏移 -1
    # CSS contrast(1)=正常,ffmpeg eq contrast(1)=正常 → 直接传
    # CSS saturate(1)=正常,ffmpeg eq saturation(1)=正常 → 直接传

    if ftype == "vivid":
        parts.append(f"eq=saturation={1+0.4*i:.3f}:contrast={1+0.05*i:.3f}:brightness={0.02*i:.3f}")
    elif ftype == "natural":
        parts.append(f"eq=saturation={1+0.15*i:.3f}:brightness={0.03*i:.3f}")
        sep = _sepia_chain(0.05 * i)
        if sep:
            parts.append(sep)
    elif ftype == "clear":
        parts.append(f"eq=brightness={0.08*i:.3f}:contrast={1+0.08*i:.3f}:saturation={1+0.1*i:.3f}")
    elif ftype == "tealOrange":
        parts.append(f"hue=h={-10*i:.1f}")
        parts.append(f"eq=saturation={1+0.3*i:.3f}:contrast={1+0.05*i:.3f}")
    elif ftype == "fresh":
        parts.append(f"eq=brightness={0.06*i:.3f}:saturation={1+0.2*i:.3f}")
        parts.append(f"hue=h={5*i:.1f}")

    elif ftype == "cinemaOrange":
        parts.append(f"eq=contrast={1+0.15*i:.3f}:saturation={1+0.2*i:.3f}")
        sep = _sepia_chain(0.15 * i)
        if sep:
            parts.append(sep)
        parts.append(f"hue=h={-10*i:.1f}")
    elif ftype == "darkMood":
        parts.append(f"eq=brightness={-0.15*i:.3f}:contrast={1+0.2*i:.3f}:saturation={1-0.1*i:.3f}")
    elif ftype == "hdr":
        parts.append(f"eq=contrast={1+0.25*i:.3f}:saturation={1+0.3*i:.3f}:brightness={0.03*i:.3f}")
    elif ftype == "blueMood":
        parts.append(f"hue=h={15*i:.1f}")
        parts.append(f"eq=saturation={1+0.1*i:.3f}:brightness={-0.05*i:.3f}:contrast={1+0.05*i:.3f}")
    elif ftype == "noir":
        parts.append(f"eq=contrast={1+0.3*i:.3f}:brightness={-0.1*i:.3f}:saturation={1-0.3*i:.3f}")

    elif ftype == "oldPhoto":
        sep = _sepia_chain(0.5 * i)
        if sep:
            parts.append(sep)
        parts.append(f"eq=contrast={1-0.1*i:.3f}:brightness={0.05*i:.3f}")
    elif ftype == "eighties":
        sep = _sepia_chain(0.3 * i)
        if sep:
            parts.append(sep)
        parts.append(f"eq=saturation={1+0.3*i:.3f}:contrast={1+0.1*i:.3f}")
        parts.append(f"hue=h={-10*i:.1f}")
    elif ftype == "faded":
        parts.append(f"eq=contrast={1-0.15*i:.3f}:brightness={0.08*i:.3f}:saturation={1-0.15*i:.3f}")
        sep = _sepia_chain(0.1 * i)
        if sep:
            parts.append(sep)
    elif ftype == "nostalgic":
        sep = _sepia_chain(0.4 * i)
        if sep:
            parts.append(sep)
        parts.append(f"eq=brightness={-0.05*i:.3f}:saturation={1+0.1*i:.3f}:contrast={1-0.05*i:.3f}")
    elif ftype == "amber":
        sep = _sepia_chain(0.35 * i)
        if sep:
            parts.append(sep)
        parts.append(f"eq=saturation={1+0.4*i:.3f}:brightness={0.05*i:.3f}")
        parts.append(f"hue=h={-15*i:.1f}")

    elif ftype == "bwClassic":
        parts.append(f"hue=s={1-1*i:.3f}")
        parts.append(f"eq=contrast={1+0.05*i:.3f}")
    elif ftype == "bwHighContrast":
        parts.append(f"hue=s={1-1*i:.3f}")
        parts.append(f"eq=contrast={1+0.3*i:.3f}:brightness={-0.05*i:.3f}")
    elif ftype == "bwSilver":
        parts.append(f"hue=s={1-1*i:.3f}:h={180*i:.1f}")
        parts.append(f"eq=contrast={1+0.1*i:.3f}:brightness={0.05*i:.3f}")
    elif ftype == "bwDark":
        parts.append(f"hue=s={1-1*i:.3f}")
        parts.append(f"eq=contrast={1+0.2*i:.3f}:brightness={-0.2*i:.3f}")

    elif ftype == "whitening":
        parts.append(f"eq=brightness={0.12*i:.3f}:saturation={1-0.05*i:.3f}")
        sep = _sepia_chain(0.05 * i)
        if sep:
            parts.append(sep)
    elif ftype == "rosy":
        sep = _sepia_chain(0.15 * i)
        if sep:
            parts.append(sep)
        parts.append(f"eq=saturation={1+0.2*i:.3f}:brightness={0.05*i:.3f}")
        parts.append(f"hue=h={-10*i:.1f}")
    elif ftype == "softSkin":
        parts.append(f"eq=brightness={0.05*i:.3f}:saturation={1+0.05*i:.3f}")
        sep = _sepia_chain(0.1 * i)
        if sep:
            parts.append(sep)
        radius = max(1, int(0.5 * i * 2))
        parts.append(f"boxblur=luma_radius={radius}:luma_power=1")
    elif ftype == "kraft":
        sep = _sepia_chain(0.25 * i)
        if sep:
            parts.append(sep)
        parts.append(f"eq=saturation={1+0.1*i:.3f}:contrast={1-0.05*i:.3f}:brightness={0.02*i:.3f}")
    elif ftype == "honey":
        sep = _sepia_chain(0.2 * i)
        if sep:
            parts.append(sep)
        parts.append(f"eq=saturation={1+0.25*i:.3f}:brightness={0.08*i:.3f}")

    elif ftype == "verdant":
        parts.append(f"eq=saturation={1+0.3*i:.3f}:brightness={0.03*i:.3f}")
        parts.append(f"hue=h={10*i:.1f}")
    elif ftype == "skyBlue":
        parts.append(f"hue=h={-15*i:.1f}")
        parts.append(f"eq=saturation={1+0.25*i:.3f}:brightness={0.05*i:.3f}:contrast={1+0.05*i:.3f}")
    elif ftype == "dusk":
        sep = _sepia_chain(0.25 * i)
        if sep:
            parts.append(sep)
        parts.append(f"eq=saturation={1+0.3*i:.3f}:brightness={-0.05*i:.3f}")
        parts.append(f"hue=h={-15*i:.1f}")
    elif ftype == "autumn":
        sep = _sepia_chain(0.3 * i)
        if sep:
            parts.append(sep)
        parts.append(f"eq=saturation={1+0.35*i:.3f}:brightness={0.02*i:.3f}")
        parts.append(f"hue=h={-20*i:.1f}")
    elif ftype == "forest":
        parts.append(f"hue=h={20*i:.1f}")
        parts.append(f"eq=saturation={1+0.2*i:.3f}:contrast={1+0.05*i:.3f}:brightness={-0.02*i:.3f}")

    elif ftype == "vividFood":
        parts.append(f"eq=saturation={1+0.5*i:.3f}:contrast={1+0.1*i:.3f}:brightness={0.05*i:.3f}")
        sep = _sepia_chain(0.05 * i)
        if sep:
            parts.append(sep)
    elif ftype == "warmFood":
        sep = _sepia_chain(0.2 * i)
        if sep:
            parts.append(sep)
        parts.append(f"eq=saturation={1+0.3*i:.3f}:brightness={0.05*i:.3f}")
    elif ftype == "delicious":
        parts.append(f"eq=contrast={1+0.15*i:.3f}:saturation={1+0.35*i:.3f}:brightness={0.03*i:.3f}")
        sep = _sepia_chain(0.1 * i)
        if sep:
            parts.append(sep)
    elif ftype == "freshFood":
        parts.append(f"eq=brightness={0.1*i:.3f}:saturation={1+0.2*i:.3f}")
        parts.append(f"hue=h={5*i:.1f}")

    elif ftype == "kodak":
        sep = _sepia_chain(0.2 * i)
        if sep:
            parts.append(sep)
        parts.append(f"eq=saturation={1+0.2*i:.3f}:contrast={1+0.1*i:.3f}:brightness={0.03*i:.3f}")
    elif ftype == "fuji":
        parts.append(f"hue=h={10*i:.1f}")
        parts.append(f"eq=saturation={1+0.25*i:.3f}:contrast={1+0.05*i:.3f}:brightness={0.02*i:.3f}")
    elif ftype == "polaroid":
        sep = _sepia_chain(0.3 * i)
        if sep:
            parts.append(sep)
        parts.append(f"eq=contrast={1-0.1*i:.3f}:brightness={0.08*i:.3f}:saturation={1-0.05*i:.3f}")
    elif ftype == "vhs":
        parts.append(f"eq=saturation={1-0.15*i:.3f}:contrast={1-0.05*i:.3f}:brightness={0.05*i:.3f}")
        sep = _sepia_chain(0.15 * i)
        if sep:
            parts.append(sep)
    elif ftype == "super8":
        sep = _sepia_chain(0.4 * i)
        if sep:
            parts.append(sep)
        parts.append(f"eq=saturation={1+0.1*i:.3f}:contrast={1+0.15*i:.3f}:brightness={-0.05*i:.3f}")
    else:
        return None

    return ",".join(parts) if parts else None


def _filter_clip_to_ffmpeg(filter_clip):
    """将单个 FilterClip 映射为 ffmpeg 视频滤镜字符串(不含 enable)。

    FilterClip 与原 FilterConfig 结构一致:均有 type 与 params,
    因此复用 _filter_to_ffmpeg 的映射逻辑。返回 None 表示无法映射。
    """
    return _filter_to_ffmpeg(filter_clip)


def _apply_filter_clips(parts, current_base, filter_clips):
    """将项目级 FilterClips 应用到已合成的视频流上。

    每个 FilterClip 按其 timelineIn/duration 时间区间启用(enable='between(t,start,end)'),
    串联在 overlay 合成之后、最终 [vout] 之前。与前端 buildFilterClipsCss 行为一致:
    同一时刻多个 FilterClip 叠加生效(链式串联)。

    parts: filter_complex 片段列表(原地追加)。
    current_base: 当前合成流的标签。
    返回:应用滤镜后的流标签(无滤镜时返回原 current_base)。
    """
    if not filter_clips:
        return current_base
    active = []
    for fc in filter_clips:
        chain = _filter_clip_to_ffmpeg(fc)
        if not chain:
            continue
        t_in = float(fc.get("timelineIn", 0))
        duration = float(fc.get("duration", 0))
        if duration <= 0:
            continue
        t_out = t_in + duration
        enable = f"enable='between(t,{t_in:.3f},{t_out:.3f})'"
        active.append((chain, enable))
    if not active:
        return current_base
    label = current_base
    for i, (chain, enable) in enumerate(active):
        # 为每个 filter clip 单独构建一个 filter 节点,附加 enable 表达式
        # eq/hue/colorchannelmixer 等滤镜支持 enable 参数;
        # 若链中含多个子滤镜(逗号分隔),需将 enable 加到最后一个子滤镜上。
        sub_filters = chain.split(",")
        sub_filters[-1] = f"{sub_filters[-1]}:{enable}"
        joined = ",".join(sub_filters)
        next_label = f"fcl{i}"
        parts.append(f"[{label}]{joined}[{next_label}]")
        label = next_label
    return label


# ── ffmpeg 管线构建 ────────────────────────────────────────────

def _collect_video_clips(tracks):
    """收集所有 video/image clip。

    轨道按 sortOrder 降序排序（底层在前，顶层在后），与前端 PreviewVideo
    的 `activeVideoClips.slice().reverse()` 渲染顺序一致——后 overlay 的
    clip 显示在更上层。同轨内按 timelineIn 升序。
    """
    video_tracks = sorted(
        [t for t in tracks if t.get("type") == "video" and not t.get("hidden")],
        key=lambda t: t.get("sortOrder", 0),
        reverse=True,
    )
    clips = []
    for track in video_tracks:
        for clip in sorted(track.get("clips", []), key=lambda c: c.get("timelineIn", 0)):
            if clip.get("type") in ("video", "image") and clip.get("assetRef"):
                file_path = clip["assetRef"].get("filePath", "")
                if file_path and os.path.exists(file_path):
                    clips.append(clip)
    return clips


def _collect_overlay_clips(tracks):
    """收集所有 text/subtitle/sticker clip。

    按 track sortOrder 升序（与前端 OverlayLayer 的渲染顺序一致——
    后渲染的 clip 显示在更上层）。text/subtitle/sticker 在同一序列中混合，
    保证不同轨的相对层级与预览一致。
    """
    video_tracks = sorted(
        [t for t in tracks if t.get("type") == "video" and not t.get("hidden")],
        key=lambda t: t.get("sortOrder", 0),
    )
    clips = []
    for track in video_tracks:
        for clip in track.get("clips", []):
            ctype = clip.get("type")
            if ctype in ("text", "subtitle") and clip.get("text"):
                clips.append(clip)
            elif ctype == "sticker" and clip.get("sticker"):
                clips.append(clip)
    return clips


def _collect_audio_clips(tracks):
    """收集所有 audio clip(来自未静音的 audio 轨)。"""
    audio_tracks = [t for t in tracks if t.get("type") == "audio" and not t.get("muted")]
    clips = []
    for track in audio_tracks:
        for clip in track.get("clips", []):
            if clip.get("assetRef"):
                file_path = clip["assetRef"].get("filePath", "")
                if file_path and os.path.exists(file_path):
                    clips.append(clip)
    return clips


def _apply_transition_out(clip, chain, t_in, t_out, tx, ty):
    """对 outgoing 片段最后 duration 秒应用转场退出动画。

    与前端 getActiveTransition 一致：转场窗口为 [t_out - duration, t_out]，
    仅作用于 outgoing 片段（淡出/滑出/缩放等），incoming 片段在其 timelineIn
    正常开始播放。

    chain: 当前片段的 ffmpeg 滤镜链列表（原地修改，追加 fade/scale 等滤镜）。
    t_in/t_out: 片段在时间线上的起止时间（全局时间）。
    tx/ty: 片段 transform.x/y 经 canvas→project 换算后的偏移（project 像素）。
    返回 (x_expr, y_expr):overlay 的 x/y 表达式（全局时间 t）。
      无转场时返回静态居中表达式；slide/push 类返回时间分段表达式。
    """
    transition = clip.get("transitionOut")
    if not transition:
        return f"(W-w)/2+{tx:.1f}", f"(H-h)/2+{ty:.1f}"

    ttype = transition.get("type", "fade")
    duration = float(transition.get("duration") or 0.5)
    params = transition.get("params") or {}
    intensity = _num(params, "intensity", 1)

    clip_duration = t_out - t_in
    if duration <= 0 or clip_duration <= duration:
        return f"(W-w)/2+{tx:.1f}", f"(H-h)/2+{ty:.1f}"

    # fade 滤镜的 st 基于 clip 流时间（setpts 后从 0 开始）
    trans_start_local = clip_duration - duration
    # overlay 表达式中的 t 是全局时间线时间
    trans_start_global = t_out - duration

    x_expr = f"(W-w)/2+{tx:.1f}"
    y_expr = f"(H-h)/2+{ty:.1f}"

    if ttype in ("fade", "dissolve", "blur"):
        chain.append(f"fade=t=out:st={trans_start_local:.3f}:d={duration:.3f}:alpha=1")
    elif ttype in ("fadeBlack", "flashBlack"):
        chain.append(f"fade=t=out:st={trans_start_local:.3f}:d={duration:.3f}:color=black")
    elif ttype in ("fadeWhite", "flashWhite"):
        chain.append(f"fade=t=out:st={trans_start_local:.3f}:d={duration:.3f}:color=white")
    elif ttype in ("slideLeft", "pushLeft"):
        x_expr = (
            f"if(lt(t,{trans_start_global:.3f}),(W-w)/2+{tx:.1f},"
            f"(W-w)/2+{tx:.1f}-w*{intensity:.3f}*(t-{trans_start_global:.3f})/{duration:.3f})"
        )
    elif ttype in ("slideRight", "pushRight"):
        x_expr = (
            f"if(lt(t,{trans_start_global:.3f}),(W-w)/2+{tx:.1f},"
            f"(W-w)/2+{tx:.1f}+w*{intensity:.3f}*(t-{trans_start_global:.3f})/{duration:.3f})"
        )
    elif ttype in ("slideUp", "pushUp"):
        y_expr = (
            f"if(lt(t,{trans_start_global:.3f}),(H-h)/2+{ty:.1f},"
            f"(H-h)/2+{ty:.1f}-h*{intensity:.3f}*(t-{trans_start_global:.3f})/{duration:.3f})"
        )
    elif ttype in ("slideDown", "pushDown"):
        y_expr = (
            f"if(lt(t,{trans_start_global:.3f}),(H-h)/2+{ty:.1f},"
            f"(H-h)/2+{ty:.1f}+h*{intensity:.3f}*(t-{trans_start_global:.3f})/{duration:.3f})"
        )
    elif ttype == "zoomOut":
        factor = f"(1-{intensity:.3f}*(t-{trans_start_local:.3f})/{duration:.3f})"
        chain.append(
            f"scale=w='iw*{factor}':h='ih*{factor}':eval=frame:flags=area,format=yuva420p"
        )
    elif ttype == "zoomIn":
        factor = f"(1+{intensity:.3f}*(t-{trans_start_local:.3f})/{duration:.3f})"
        chain.append(
            f"scale=w='iw*{factor}':h='ih*{factor}':eval=frame:flags=area,format=yuva420p"
        )
    else:
        # 未映射的转场类型回退到 fade
        chain.append(f"fade=t=out:st={trans_start_local:.3f}:d={duration:.3f}:alpha=1")

    return x_expr, y_expr


def _build_filter_complex(project, video_clips, overlay_clips, audio_clips,
                          clip_indices, audio_indices, sticker_indices=None,
                          canvas_size=None, video_audio_clip_ids=None):
    """构建 filter_complex 字符串。返回 (filter_complex_str, has_audio)。

    canvas_size: 前端预览画布尺寸 {width, height}(CSS 像素)。
        transform.x/y 存的是 canvas 像素,需按 project/canvas 比例换算。
        None 时按 1:1 处理(等价于 canvas 等于 project 尺寸)。
    video_audio_clip_ids: 含音频流的 video clip id 集合,
        这些 clip 的 [idx:a] 会被混入最终音频。
    """
    width = int(project.get("width") or 1920)
    height = int(project.get("height") or 1080)
    sticker_indices = sticker_indices or {}
    video_audio_clip_ids = video_audio_clip_ids or set()

    # canvas → project 坐标转换因子(canvas 维持 project 宽高比,x/y 同因子)
    if canvas_size and canvas_size.get("width") and canvas_size.get("height"):
        scale_factor = float(width) / float(canvas_size["width"])
    else:
        scale_factor = 1.0

    parts = []
    # 背景流
    parts.append("[0:v]format=yuva420p[base]")

    # ── video/image clip 处理 ──
    current_base = "base"
    for clip in video_clips:
        idx = clip_indices[clip["id"]]
        speed = float(clip.get("speed") or 1)
        opacity = float(clip.get("opacity") or 1)
        transform = clip.get("transform") or {}
        sw = float(transform.get("scaleX") or transform.get("scale") or 1)
        sh = float(transform.get("scaleY") or transform.get("scale") or 1)
        
        # 对于旋转,如果有关键帧则使用动态表达式,否则用静态值
        rotation = float(transform.get("rotation") or 0)
        has_rot_kf = any(t.get("property") == "transform.rotation" and t.get("keyframes") for t in clip.get("keyframes", []))
        
        t_in = float(clip.get("timelineIn", 0))
        t_out = _timeline_out(clip)

        clip_w = _even(width * sw)
        clip_h = _even(height * sh)

        chain = [
            f"setpts=(PTS-STARTPTS)/{speed:.4f}",
            f"scale={clip_w}:{clip_h}",
            "format=yuva420p",
        ]
        
        if has_rot_kf:
            rot_expr = _build_keyframe_expr(clip, "transform.rotation", rotation, time_var="t", is_overlay=False)
            rad_expr = f"(({rot_expr})*PI/180.0)"
            chain.append(f"rotate=a='{rad_expr}':c=none:ow='rotw({rad_expr})':oh='roth({rad_expr})'")
        elif rotation != 0:
            rad = rotation * 3.141592653589793 / 180.0
            chain.append(f"rotate={rad}:c=none:ow=rotw({rad}):oh=roth({rad})")

        has_opacity_kf = any(t.get("property") == "opacity" and t.get("keyframes") for t in clip.get("keyframes", []))
        if has_opacity_kf:
            opacity_expr = _build_keyframe_expr(clip, "opacity", opacity, time_var="T", is_overlay=False)
            chain.append(f"format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*clip({opacity_expr},0,1)'")
            chain.append("format=yuva420p")
        elif opacity < 1:
            chain.append(f"colorchannelmixer=aa={opacity:.4f}")
            
        effect_chain = _build_effect_chain(clip.get("effects"))
        if effect_chain:
            chain.append(effect_chain)

        # tx/ty is used in transition calculations
        tx_base = float(transform.get("x") or 0) * scale_factor
        ty_base = float(transform.get("y") or 0) * scale_factor

        # 转场退出动画：修改 chain（追加 fade/scale 滤镜）并返回 overlay x/y 表达式
        # (此时 x_expr, y_expr 只是转场相关的偏移)
        x_trans, y_trans = _apply_transition_out(clip, chain, t_in, t_out, tx_base, ty_base)

        parts.append(f"[{idx}:v]" + ",".join(chain) + f"[v{idx}]")

        # 处理 x 和 y 的关键帧 (如果转场也修改了 x_trans，我们将其作为基础进行偏移)
        has_x_kf = any(t.get("property") == "transform.x" and t.get("keyframes") for t in clip.get("keyframes", []))
        has_y_kf = any(t.get("property") == "transform.y" and t.get("keyframes") for t in clip.get("keyframes", []))

        # overlay 的 x 和 y 表达式
        if has_x_kf:
            x_kf_expr = _build_keyframe_expr(clip, "transform.x", float(transform.get("x") or 0), time_var="t", is_overlay=True)
            x_expr = f"(W-w)/2 + ({x_kf_expr})*{scale_factor}"
        else:
            x_expr = x_trans # _apply_transition_out 可能包含了滑动动画

        if has_y_kf:
            y_kf_expr = _build_keyframe_expr(clip, "transform.y", float(transform.get("y") or 0), time_var="t", is_overlay=True)
            y_expr = f"(H-h)/2 + ({y_kf_expr})*{scale_factor}"
        else:
            y_expr = y_trans

        next_base = f"tmp{idx}"
        parts.append(
            f"[{current_base}][v{idx}]overlay="
            f"x='{x_expr}':y='{y_expr}':"
            f"enable='between(t,{t_in:.3f},{t_out:.3f})'[{next_base}]"
        )
        current_base = next_base

    # ── text/sticker overlay 处理 ──
    # text 与 sticker 混合按 track sortOrder 升序叠加(后叠加的在上层),
    # 与前端 OverlayLayer 的 DOM 渲染顺序一致。
    font_file = _find_font_file()
    for i, clip in enumerate(overlay_clips):
        ctype = clip.get("type")
        transform = clip.get("transform") or {}
        
        has_x_kf = any(t.get("property") == "transform.x" and t.get("keyframes") for t in clip.get("keyframes", []))
        has_y_kf = any(t.get("property") == "transform.y" and t.get("keyframes") for t in clip.get("keyframes", []))
        
        t_in = float(clip.get("timelineIn", 0))
        t_out = _timeline_out(clip)
        opacity = float(clip.get("opacity") or 1)
        next_base = f"ovl{i}"

        if ctype in ("text", "subtitle"):
            text_cfg = clip.get("text") or {}
            content = _escape_drawtext_text(text_cfg.get("content", ""))
            if not content:
                continue
            # 前端 fontSize 为 canvas 像素,换算为 project 像素
            font_size_canvas = int(text_cfg.get("fontSize", 48))
            font_size = max(8, int(font_size_canvas * scale_factor))
            
            has_opacity_kf = any(t.get("property") == "opacity" and t.get("keyframes") for t in clip.get("keyframes", []))
            
            if has_opacity_kf:
                # drawtext does not easily support animated opacity per text block unless we use fontcolor_expr
                # but fontcolor_expr might not be available or easy.
                # So we just use base opacity for text if animated.
                pass
                
            # alpha is part of font_color
            font_color_base = text_cfg.get("color", "#ffffff")
            if opacity < 1.0:
                # if it's #ffffff, we append alpha
                pass # simplified: just let it be. Or use drawtext alpha?
            font_color = _hex_to_ffmpeg_color(font_color_base)

            dt = f"drawtext=text='{content}':fontcolor={font_color}:fontsize={font_size}"
            if font_file:
                dt += f":fontfile='{_escape_fontfile(font_file)}'"
                
            if has_x_kf:
                x_kf_expr = _build_keyframe_expr(clip, "transform.x", float(transform.get("x") or 0), time_var="t", is_overlay=True)
                dt += f":x='(w-tw)/2+({x_kf_expr})*{scale_factor}'"
            else:
                tx = float(transform.get("x") or 0) * scale_factor
                dt += f":x='(w-tw)/2+{tx:.1f}'"
                
            if has_y_kf:
                y_kf_expr = _build_keyframe_expr(clip, "transform.y", float(transform.get("y") or 0), time_var="t", is_overlay=True)
                dt += f":y='(h-th)/2+({y_kf_expr})*{scale_factor}'"
            else:
                ty = float(transform.get("y") or 0) * scale_factor
                dt += f":y='(h-th)/2+{ty:.1f}'"
                
            dt += f":enable='between(t,{t_in:.3f},{t_out:.3f})'"

            if text_cfg.get("backgroundColor"):
                box_color = _hex_to_ffmpeg_color(text_cfg["backgroundColor"])
                dt += f":box=1:boxcolor={box_color}:boxborderw=8"
            if text_cfg.get("shadow"):
                dt += ":shadowcolor=0x000000:shadowx=2:shadowy=2"

            parts.append(f"[{current_base}]{dt}[{next_base}]")
            current_base = next_base

        elif ctype == "sticker":
            # emoji 与 image 统一走 overlay(emoji 已由 Pillow 预渲染为 PNG)
            clip_id = clip.get("id")
            if clip_id not in sticker_indices:
                continue
            sticker_cfg = clip.get("sticker") or {}
            base_size = float(sticker_cfg.get("size", 96))
            scale = float(transform.get("scale") or 1)
            sx = float(transform.get("scaleX") or scale)
            sy = float(transform.get("scaleY") or scale)
            # 前端 base_size 为 canvas 像素,换算为 project 像素并叠加 transform.scale
            img_w = _even(base_size * sx * scale_factor)
            img_h = _even(base_size * sy * scale_factor)
            idx = sticker_indices[clip_id]
            chain = [f"scale={img_w}:{img_h}", "format=yuva420p"]
            
            rotation = float(transform.get("rotation") or 0)
            has_rot_kf = any(t.get("property") == "transform.rotation" and t.get("keyframes") for t in clip.get("keyframes", []))
            if has_rot_kf:
                rot_expr = _build_keyframe_expr(clip, "transform.rotation", rotation, time_var="t", is_overlay=False)
                rad_expr = f"(({rot_expr})*PI/180.0)"
                chain.append(f"rotate=a='{rad_expr}':c=none:ow='rotw({rad_expr})':oh='roth({rad_expr})'")
            elif rotation != 0:
                rad = rotation * 3.141592653589793 / 180.0
                chain.append(f"rotate={rad}:c=none:ow=rotw({rad}):oh=roth({rad})")
                
            has_opacity_kf = any(t.get("property") == "opacity" and t.get("keyframes") for t in clip.get("keyframes", []))
            if has_opacity_kf:
                opacity_expr = _build_keyframe_expr(clip, "opacity", opacity, time_var="T", is_overlay=False)
                chain.append(f"format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*clip({opacity_expr},0,1)'")
                chain.append("format=yuva420p")
            elif opacity < 1:
                chain.append(f"colorchannelmixer=aa={opacity:.4f}")
                
            parts.append(f"[{idx}:v]" + ",".join(chain) + f"[s{idx}]")
            
            if has_x_kf:
                x_kf_expr = _build_keyframe_expr(clip, "transform.x", float(transform.get("x") or 0), time_var="t", is_overlay=True)
                x_expr = f"(W-w)/2 + ({x_kf_expr})*{scale_factor}"
            else:
                tx = float(transform.get("x") or 0) * scale_factor
                x_expr = f"(W-w)/2+{tx:.1f}"
                
            if has_y_kf:
                y_kf_expr = _build_keyframe_expr(clip, "transform.y", float(transform.get("y") or 0), time_var="t", is_overlay=True)
                y_expr = f"(H-h)/2 + ({y_kf_expr})*{scale_factor}"
            else:
                ty = float(transform.get("y") or 0) * scale_factor
                y_expr = f"(H-h)/2+{ty:.1f}"
                
            parts.append(
                f"[{current_base}][s{idx}]overlay="
                f"x='{x_expr}':y='{y_expr}':"
                f"enable='between(t,{t_in:.3f},{t_out:.3f})'[{next_base}]"
            )
            current_base = next_base

    # ── 滤镜轨道:按时间区间应用到已合成的视频流 ──
    current_base = _apply_filter_clips(parts, current_base, project.get("filterClips"))

    # 最终视频流(转为 yuv420p 供编码)
    parts.append(f"[{current_base}]format=yuv420p[vout]")

    # ── audio 处理 ──
    # 1) audio 轨片段
    audio_labels = []
    for clip in audio_clips:
        idx = audio_indices[clip["id"]]
        speed = float(clip.get("speed") or 1)
        volume = float(clip.get("volume") or 1)
        t_in = float(clip.get("timelineIn", 0))
        delay_ms = max(0, int(t_in * 1000))
        duration = _timeline_duration(clip)

        chain = f"[{idx}:a]atrim=0:{duration:.3f},asetpts=PTS-STARTPTS"
        if speed != 1:
            chain += "," + _atempo_chain(speed)
        if volume != 1:
            chain += f",volume={volume:.4f}"
        chain += f",adelay={delay_ms}:all=1[a{idx}]"
        parts.append(chain)
        audio_labels.append(f"[a{idx}]")

    # 2) video clip 自身的音频流(若有)
    for clip in video_clips:
        clip_id = clip.get("id")
        if clip_id not in video_audio_clip_ids:
            continue
        idx = clip_indices[clip_id]
        speed = float(clip.get("speed") or 1)
        volume = float(clip.get("volume") or 1)
        t_in = float(clip.get("timelineIn", 0))
        delay_ms = max(0, int(t_in * 1000))
        duration = _timeline_duration(clip)

        chain = f"[{idx}:a]atrim=0:{duration:.3f},asetpts=PTS-STARTPTS"
        if speed != 1:
            chain += "," + _atempo_chain(speed)
        if volume != 1:
            chain += f",volume={volume:.4f}"
        chain += f",adelay={delay_ms}:all=1[va{idx}]"
        parts.append(chain)
        audio_labels.append(f"[va{idx}]")

    if audio_labels:
        amix_inputs = "".join(audio_labels)
        parts.append(
            f"{amix_inputs}amix=inputs={len(audio_labels)}"
            f":duration=longest:normalize=0[aout]"
        )

    return ";".join(parts), bool(audio_labels)


def _build_ffmpeg_args(project, output_path, canvas_size=None):
    """根据 project 构建 ffmpeg 命令参数列表(不含 ffmpeg 可执行路径)。

    canvas_size: 前端预览画布尺寸 {width, height}(CSS 像素),用于坐标转换。
    返回 (cmd_args, total_duration, temp_files):temp_files 为需要事后清理的临时文件。
    """
    tracks = project.get("tracks", [])
    width = int(project.get("width") or 1920)
    height = int(project.get("height") or 1080)
    fps = int(project.get("fps") or 30)
    bg_color = _hex_to_ffmpeg_color(project.get("backgroundColor", "#000000"))

    total_duration = _get_timeline_end(tracks)
    if total_duration <= 0:
        raise ValueError("Timeline is empty, nothing to export")

    video_clips = _collect_video_clips(tracks)
    overlay_clips = _collect_overlay_clips(tracks)
    audio_clips = _collect_audio_clips(tracks)

    if not video_clips and not overlay_clips and not audio_clips:
        raise ValueError("No renderable clips found")

    # canvas → project 坐标转换因子
    if canvas_size and canvas_size.get("width"):
        scale_factor = float(width) / float(canvas_size["width"])
    else:
        scale_factor = 1.0

    # 检测哪些 video clip 含音频流(避免引用不存在的 [idx:a] 导致 ffmpeg 报错)
    video_audio_clip_ids = set()
    for clip in video_clips:
        if clip.get("type") != "video":
            continue
        asset = clip.get("assetRef") or {}
        file_path = asset.get("filePath", "")
        if file_path and os.path.exists(file_path) and _has_audio_stream(file_path):
            video_audio_clip_ids.add(clip["id"])

    # 筛出需要独立输入的 sticker:
    # - image sticker: 直接用 filePath
    # - emoji sticker: 用 Pillow 渲染为 PNG(保留彩色),失败则跳过
    sticker_inputs = []  # [(clip, png_path_or_file_path), ...]
    temp_files = []
    emoji_font_file = _find_emoji_font_file()
    import tempfile
    for clip in overlay_clips:
        if clip.get("type") != "sticker":
            continue
        sticker_cfg = clip.get("sticker") or {}
        stype = sticker_cfg.get("stickerType", "emoji")
        if stype == "image":
            file_path = sticker_cfg.get("filePath", "")
            if file_path and os.path.exists(file_path):
                sticker_inputs.append((clip, file_path))
        elif stype == "emoji":
            content = sticker_cfg.get("content", "")
            if not content:
                continue
            base_size = float(sticker_cfg.get("size", 96))
            transform = clip.get("transform") or {}
            scale = float(transform.get("scale") or 1)
            sx = float(transform.get("scaleX") or scale)
            sy = float(transform.get("scaleY") or scale)
            # 渲染为 project 像素尺寸的 PNG
            pixel_size = max(16, int(base_size * max(sx, sy) * scale_factor))
            png_path = os.path.join(
                tempfile.gettempdir(),
                f"fatcut_emoji_{uuid.uuid4().hex[:12]}.png",
            )
            font_path = emoji_font_file or _find_font_file()
            if font_path and _render_emoji_to_png(content, pixel_size, font_path, png_path):
                sticker_inputs.append((clip, png_path))
                temp_files.append(png_path)
            # 渲染失败则跳过该 sticker(不阻塞导出)

    # 构建 input 参数
    input_args = []
    # 0: 背景
    input_args.extend([
        "-f", "lavfi", "-i",
        f"color=c={bg_color}:s={width}x{height}:r={fps}:d={total_duration:.3f}",
    ])

    # 1..N: video/image clips
    clip_indices = {}
    for i, clip in enumerate(video_clips, start=1):
        asset = clip["assetRef"]
        file_path = asset.get("filePath", "")
        source_in = float(clip.get("sourceIn", 0))
        duration = _timeline_duration(clip)
        if clip.get("type") == "image":
            input_args.extend(["-loop", "1", "-t", f"{duration:.3f}", "-i", file_path])
        else:
            input_args.extend(["-ss", f"{source_in:.3f}", "-t", f"{duration:.3f}", "-i", file_path])
        clip_indices[clip["id"]] = i

    # N+1..: sticker 输入(emoji PNG + image sticker)
    sticker_indices = {}
    next_input = len(video_clips) + 1
    for i, (clip, file_path) in enumerate(sticker_inputs):
        duration = _timeline_duration(clip)
        input_args.extend(["-loop", "1", "-t", f"{duration:.3f}", "-i", file_path])
        sticker_indices[clip["id"]] = next_input + i

    # 音频输入紧跟其后
    audio_indices = {}
    next_audio_input = next_input + len(sticker_inputs)
    for i, clip in enumerate(audio_clips):
        asset = clip["assetRef"]
        file_path = asset.get("filePath", "")
        source_in = float(clip.get("sourceIn", 0))
        duration = _timeline_duration(clip)
        input_args.extend(["-ss", f"{source_in:.3f}", "-t", f"{duration:.3f}", "-i", file_path])
        audio_indices[clip["id"]] = next_audio_input + i

    # filter_complex
    filter_complex, has_audio = _build_filter_complex(
        project, video_clips, overlay_clips, audio_clips,
        clip_indices, audio_indices, sticker_indices,
        canvas_size=canvas_size,
        video_audio_clip_ids=video_audio_clip_ids,
    )

    # 组装完整命令
    cmd = list(input_args)
    cmd.extend(["-filter_complex", filter_complex])
    cmd.extend(["-map", "[vout]"])
    if has_audio:
        cmd.extend(["-map", "[aout]"])
    cmd.extend([
        "-c:v", "libx264", "-preset", "medium", "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-r", str(fps),
    ])
    if has_audio:
        cmd.extend(["-c:a", "aac", "-b:a", "128k"])
    cmd.extend([
        "-t", f"{total_duration:.3f}",
        "-movflags", "+faststart",
        "-y", output_path,
    ])
    return cmd, total_duration, temp_files


# ── 导出任务管理 ────────────────────────────────────────────────

_export_jobs: dict = {}
_export_lock = threading.Lock()


def _run_export_thread(project, output_path, export_id, canvas_size=None):
    """后台线程:执行 ffmpeg 并更新进度。"""
    with _export_lock:
        job = _export_jobs.get(export_id)
        if not job:
            return
        job["status"] = "running"

    temp_files = []
    try:
        ffmpeg = get_ffmpeg_path()
        if not ffmpeg:
            raise RuntimeError("ffmpeg not found. Ensure FFMPEG_HOME is set by host.")

        cmd_args, total_duration, temp_files = _build_ffmpeg_args(
            project, output_path, canvas_size=canvas_size
        )
        cmd = [ffmpeg, "-hide_banner", "-y", "-progress", "pipe:1"] + cmd_args

        # 确保输出目录存在
        out_dir = os.path.dirname(output_path)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)

        with _export_lock:
            job["totalDuration"] = total_duration

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

        # 单独线程排空 stderr,避免管道阻塞
        stderr_lines = []

        def drain_stderr():
            try:
                for line in proc.stderr:
                    stderr_lines.append(line)
            except Exception:
                pass

        stderr_thread = threading.Thread(target=drain_stderr, daemon=True)
        stderr_thread.start()

        # 解析进度
        for line in proc.stdout:
            line = line.strip()
            if line.startswith("out_time_us="):
                try:
                    us = int(line.split("=", 1)[1])
                    if total_duration > 0:
                        pct = min(99, int(us / (total_duration * 1_000_000) * 100))
                        with _export_lock:
                            job["progress"] = max(job.get("progress", 0), pct)
                except (ValueError, ZeroDivisionError):
                    pass
            elif line.startswith("progress="):
                if line.split("=", 1)[1] == "end":
                    with _export_lock:
                        job["progress"] = 100

        proc.wait()
        stderr_thread.join(timeout=5)

        if proc.returncode == 0:
            with _export_lock:
                job["status"] = "completed"
                job["progress"] = 100
                job["message"] = ""
        else:
            stderr_text = "".join(stderr_lines)[-3000:]
            with _export_lock:
                job["status"] = "failed"
                job["message"] = stderr_text or f"ffmpeg exited with code {proc.returncode}"
    except Exception as e:
        with _export_lock:
            job["status"] = "failed"
            job["message"] = str(e)
    finally:
        # 清理 emoji PNG 等临时文件
        for tmp in temp_files:
            try:
                os.remove(tmp)
            except Exception:
                pass


# ── Handlers ───────────────────────────────────────────────────

@handler("exportProject")
def export_project(params):
    """启动导出(后台线程),立即返回 exportId。"""
    if not isinstance(params, dict):
        raise ValueError("params must be a dict")
    project = params.get("project")
    if not isinstance(project, dict):
        raise ValueError("project is required")
    output_path = str(params.get("outputPath") or "").strip()
    if not output_path:
        raise ValueError("outputPath is required")

    tracks = project.get("tracks", [])
    if _get_timeline_end(tracks) <= 0:
        raise ValueError("Timeline is empty, nothing to export")

    # 前端预览画布尺寸(CSS 像素),用于 transform.x/y 从 canvas → project 坐标转换
    canvas_size = params.get("canvasSize")
    if not isinstance(canvas_size, dict):
        canvas_size = None

    export_id = uuid.uuid4().hex[:12]
    with _export_lock:
        _export_jobs[export_id] = {
            "status": "pending",
            "progress": 0,
            "message": "",
            "outputPath": output_path,
            "totalDuration": 0,
        }

    thread = threading.Thread(
        target=_run_export_thread,
        args=(project, output_path, export_id, canvas_size),
        daemon=True,
    )
    thread.start()

    return {"exportId": export_id, "outputPath": output_path}


@handler("getExportProgress")
def get_export_progress(params):
    """查询导出进度。"""
    if not isinstance(params, dict):
        raise ValueError("params must be a dict")
    export_id = str(params.get("exportId") or "").strip()
    if not export_id:
        raise ValueError("exportId is required")
    with _export_lock:
        job = _export_jobs.get(export_id)
        if not job:
            return {"status": "unknown", "progress": 0, "message": "Export job not found"}
        return {
            "status": job["status"],
            "progress": job["progress"],
            "message": job["message"],
            "outputPath": job["outputPath"],
        }


@handler("openFolder")
def open_folder(params):
    """在系统文件管理器中打开包含指定文件的文件夹。"""
    if not isinstance(params, dict):
        raise ValueError("params must be a dict")
    path = str(params.get("path") or "").strip()
    if not path:
        raise ValueError("path is required")

    # 若是文件,打开其所在目录;若是目录,直接打开
    folder = path if os.path.isdir(path) else os.path.dirname(path)
    if not folder:
        folder = os.getcwd()

    try:
        if sys.platform == "win32":
            # Windows:选中文件打开(explorer /select,)
            if os.path.isfile(path):
                subprocess.Popen(["explorer", "/select,", path])
            else:
                os.startfile(folder)
        elif sys.platform == "darwin":
            if os.path.isfile(path):
                subprocess.Popen(["open", "-R", path])
            else:
                subprocess.Popen(["open", folder])
        else:
            subprocess.Popen(["xdg-open", folder])
        return {"ok": True, "folder": folder}
    except Exception as e:
        return {"ok": False, "error": str(e), "folder": folder}


@handler("getDefaultExportPath")
def get_default_export_path(params):
    """返回默认导出路径:<workspace>/fatCut/exports/<工程名>_<时间戳>.mp4。"""
    if not isinstance(params, dict):
        raise ValueError("params must be a dict")
    project_name = str(params.get("projectName") or "export").strip()
    safe_name = _safe_filename(project_name)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    exports_dir = get_cut_dir() / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)
    return {
        "outputPath": str(exports_dir / f"{safe_name}_{timestamp}.mp4"),
        "exportsDir": str(exports_dir),
    }


@handler("selectFolder")
def select_folder(params):
    """弹出系统文件夹选择对话框,返回选中文件夹路径与拼接后的输出路径。"""
    if not isinstance(params, dict):
        raise ValueError("params must be a dict")

    initial_dir = str(params.get("initialDir") or "").strip()
    file_name = str(params.get("fileName") or "export.mp4").strip()

    # 如果 initialDir 是文件路径,取其父目录作为初始位置
    if initial_dir and not os.path.isdir(initial_dir):
        parent = os.path.dirname(initial_dir)
        if parent:
            initial_dir = parent

    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)

        folder = filedialog.askdirectory(
            initialdir=initial_dir if initial_dir else None,
            parent=root,
        )
        root.destroy()
    except Exception:
        return {"folder": "", "outputPath": ""}

    if not folder:
        return {"folder": "", "outputPath": ""}

    full_path = os.path.join(folder, file_name)
    return {"folder": folder, "outputPath": full_path}


@handler("clearExportJob")
def clear_export_job(params):
    """清理已完成的导出任务记录。"""
    if not isinstance(params, dict):
        raise ValueError("params must be a dict")
    export_id = str(params.get("exportId") or "").strip()
    if not export_id:
        return {"ok": False}
    with _export_lock:
        existed = export_id in _export_jobs
        _export_jobs.pop(export_id, None)
    return {"ok": existed}
