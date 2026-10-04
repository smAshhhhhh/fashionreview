"""多模态向量（阿里云百炼 qwen3-vl-embedding）。

百炼的多模态向量端点**不是** OpenAI 兼容接口，llm_client.py 里的 OpenAI 客户端
用不上，故这里用 httpx 直连原生 REST：

    POST /api/v1/services/embeddings/multimodal-embedding/multimodal-embedding

不开 enable_fusion（单图独立向量），保证标注图与上传照片落在同一个纯图像语义
空间；开了融合会把多个 content 揉成一个向量，两侧就不可比了。

预处理很关键：标注图最大 6.2MB，base64 后约 8.3MB 已逼近接口单图 10MB 上限；
且**两侧必须走同一个缩图函数**，否则向量分布不一致会拉低匹配质量。缩图是为了
能调通接口与保持两侧一致，不是匹配算法的一部分。

返回的向量一律归一化为单位向量后交给调用方，这样余弦相似度退化成点积。
"""

from __future__ import annotations

import base64
import io
import math
from pathlib import Path

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_ENDPOINT = (
    "https://dashscope.aliyuncs.com/api/v1/services/embeddings"
    "/multimodal-embedding/multimodal-embedding"
)


def embed_image(path: str) -> list[float]:
    """把本地图片编码为归一化单位向量。

    :raises RuntimeError: 未配置 API Key、接口报错、或返回结构异常
    """
    settings = get_settings()
    if not settings.llm_api_key:
        raise RuntimeError(
            "未配置 LLM_API_KEY，请在 backend/.env 设置通义千问 API Key。"
        )

    data_uri = _encode_image_for_embedding(path)
    payload = {
        "model": settings.annotation_embedding_model,
        "input": {"contents": [{"image": data_uri}]},
        "parameters": {"dimension": settings.annotation_embedding_dim},
    }
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }

    try:
        resp = httpx.post(
            _ENDPOINT, json=payload, headers=headers, timeout=settings.llm_timeout
        )
    except httpx.HTTPError as exc:
        raise RuntimeError(f"调用多模态向量接口失败：{exc}") from exc

    if resp.status_code != 200:
        # 只截断前 300 字符：错误体可能很长，且不应把 base64 之类内容灌进日志
        raise RuntimeError(
            f"多模态向量接口返回 {resp.status_code}：{resp.text[:300]}"
        )

    vector = _extract_vector(resp.json())
    return normalize(vector)


def normalize(vector: list[float]) -> list[float]:
    """归一化为单位向量；零向量原样返回（交由调用方判废）。"""
    norm = math.sqrt(sum(v * v for v in vector))
    if norm <= 0:
        return list(vector)
    return [v / norm for v in vector]


def _extract_vector(body: dict) -> list[float]:
    """从接口返回中取出向量。

    正常结构为 output.embeddings[0].embedding；这里对字段缺失给出明确报错，
    而不是让 KeyError/TypeError 冒出去（换模型或接口调整时更好定位）。
    """
    output = body.get("output") or {}
    embeddings = output.get("embeddings") or []
    if not embeddings:
        code = body.get("code") or ""
        message = body.get("message") or ""
        raise RuntimeError(
            f"多模态向量接口未返回 embeddings（code={code} message={message}）"
        )
    vector = embeddings[0].get("embedding")
    if not isinstance(vector, list) or not vector:
        raise RuntimeError("多模态向量接口返回的 embedding 为空或格式异常")
    return [float(v) for v in vector]


def _encode_image_for_embedding(path: str) -> str:
    """缩图 → JPEG → base64 data URI。

    标注图与上传照片都走这里，保证两侧预处理完全一致。Pillow 不可用或解码失败
    时退回原图字节（大图可能被接口拒绝，但不至于整条链路不可用）。
    """
    settings = get_settings()
    raw = Path(path).read_bytes()
    try:
        from PIL import Image  # 局部导入：缺 Pillow 时仍可退回原图

        with Image.open(io.BytesIO(raw)) as im:
            im = im.convert("RGB")
            im.thumbnail(
                (settings.annotation_embed_max_px, settings.annotation_embed_max_px),
                Image.LANCZOS,
            )
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=85)
            data = buf.getvalue()
        mime = "image/jpeg"
    except Exception:  # noqa: BLE001 - 缩图失败不应阻断，退回原图
        logger.warning("标注图缩图失败，退回原图字节：%s", path, exc_info=True)
        data = raw
        mime = "image/jpeg"

    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"
