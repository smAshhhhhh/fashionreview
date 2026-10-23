"""标注列表缩略图，原图仍用于查看细节与向量生成。"""

from functools import lru_cache
from io import BytesIO
from pathlib import Path
import re

from PIL import Image, ImageOps

from app.core.config import get_settings


THUMBNAIL_WIDTHS = (384, 768, 1152)
_IMAGE_NAME = re.compile(r"[0-9a-f]{32}\.(?:jpg|jpeg|png|webp)")


def annotation_thumbnail(file_name: str, width: int) -> bytes:
    """仅处理标注目录内的已导入图片，源文件变化时重新生成。"""
    if width not in THUMBNAIL_WIDTHS:
        raise ValueError("不支持的缩略图尺寸")
    if not _IMAGE_NAME.fullmatch(file_name):
        raise FileNotFoundError(file_name)

    directory = Path(get_settings().annotation_dir).resolve()
    source = (directory / file_name).resolve()
    if source.parent != directory:
        raise FileNotFoundError(file_name)
    stat = source.stat()
    return _render_thumbnail(str(source), width, stat.st_mtime_ns, stat.st_size)


@lru_cache(maxsize=64)
def _render_thumbnail(
    source: str,
    width: int,
    modified_ns: int,
    file_size: int,
) -> bytes:
    # 文件版本参与缓存键，缓存数量有上限，不额外落盘。
    with Image.open(source) as original:
        image = ImageOps.exif_transpose(original)
        image.thumbnail((width, image.height), Image.Resampling.LANCZOS)
        if image.mode not in ("RGB", "RGBA"):
            mode = "RGBA" if "transparency" in image.info else "RGB"
            image = image.convert(mode)
        output = BytesIO()
        image.save(output, format="WEBP", quality=82)
        return output.getvalue()
