"""上传照片与标注库的相似度匹配。

本版**不设阈值**：无条件返回 Top-1 与相似度，不做「未命中」分支。阈值现在没有
任何定值依据，写死一个数只会变成不可观测的变量 —— 先让真实数据把相似度分布跑
出来（见 calibrate.py 与链路日志），阈值留到第二版按分布定。

因此 match_image 返回 None 只有一个含义：标注库里没有可比的向量（库为空、或
向量都还没生成、或全部产自别的模型），不是「不够像」。

数据量：30 条 × 1024 维 = 3 万次乘加，纯 Python 点积毫秒级，不引入 numpy /
向量库。向量入库时已归一化，故余弦相似度即点积。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.config import get_settings
from app.core.logging import get_logger
from app.db import repository as repo
from app.services.annotation.embedding import embed_image

logger = get_logger(__name__)


@dataclass
class MatchResult:
    """一次匹配的结果。"""

    annotation_id: int
    file_name: str
    similarity: float
    candidates: list[dict[str, Any]]  # Top-N 留痕 [{annotation_id, file_name, similarity}]
    model: str


def cosine(a: list[float], b: list[float]) -> float:
    """两个**单位**向量的余弦相似度（即点积）。

    长度不等时按较短者截断 —— 维度不一致本应在取数时就被过滤掉，这里只做兜底
    以免抛异常拖垮整条点评链路。
    """
    n = min(len(a), len(b))
    if n == 0:
        return 0.0
    return sum(a[i] * b[i] for i in range(n))


def similarity_matrix(vectors: list[list[float]]) -> list[list[float]]:
    """两两相似度矩阵（供 calibrate.py 标定使用）。

    与 match_image 共用 cosine()，保证标定脚本量到的分布与线上口径完全一致。
    """
    n = len(vectors)
    matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        matrix[i][i] = cosine(vectors[i], vectors[i])
        for j in range(i + 1, n):
            s = cosine(vectors[i], vectors[j])
            matrix[i][j] = s
            matrix[j][i] = s
    return matrix


def match_image(conn, image_path: str) -> MatchResult | None:
    """把上传照片与标注库比对，返回 Top-1。

    只与**当前配置的 model + dim** 一致的向量比对：换过模型的旧向量属于另一个
    语义空间，混比会算出毫无意义的相似度且不会报错，必须显式跳过。

    :return: Top-1 结果；标注库无可比向量时返回 None
    """
    settings = get_settings()
    model = settings.annotation_embedding_model
    dim = settings.annotation_embedding_dim

    rows = repo.list_annotation_embeddings(conn, model=model, dim=dim)
    if not rows:
        logger.info("标注库暂无可比向量（model=%s dim=%s），跳过图片属性匹配", model, dim)
        return None

    query = embed_image(image_path)

    scored: list[tuple[float, dict[str, Any]]] = []
    for r in rows:
        vec = r.get("embedding") or []
        if len(vec) != len(query):
            continue  # 维度不符，属于脏数据
        scored.append((cosine(query, vec), r))

    if not scored:
        logger.warning(
            "标注库向量维度与当前查询不符（query=%d），跳过图片属性匹配", len(query)
        )
        return None

    scored.sort(key=lambda x: x[0], reverse=True)
    top_n = max(1, settings.annotation_match_top_n)
    candidates = [
        {
            "annotation_id": r["id"],
            "file_name": r["file_name"],
            "similarity": round(s, 5),
        }
        for s, r in scored[:top_n]
    ]
    best_score, best_row = scored[0]

    return MatchResult(
        annotation_id=best_row["id"],
        file_name=best_row["file_name"],
        similarity=round(best_score, 5),
        candidates=candidates,
        model=model,
    )
