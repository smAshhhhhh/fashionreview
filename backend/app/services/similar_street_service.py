"""相似街道推荐：在历史点评里找二级维度画像形状最接近的街区。

用皮尔逊相关比较强项与短板的分布，不看总分高低。实时计算，不落库。
"""

from __future__ import annotations

import math
from typing import Any

from app.db import repository as repo

# 两条评价共同维度少于这个数时不比较
_MIN_SHARED_DIMS = 10
_MAX_STRENGTHS = 2


def pearson(a: list[float], b: list[float]) -> float | None:
    """皮尔逊相关系数；任一序列方差为 0 时返回 None。"""
    n = len(a)
    if n == 0 or n != len(b):
        return None
    ma, mb = sum(a) / n, sum(b) / n
    da = [x - ma for x in a]
    db = [y - mb for y in b]
    den = math.sqrt(sum(x * x for x in da) * sum(y * y for y in db))
    if den == 0:
        return None
    return sum(x * y for x, y in zip(da, db)) / den


def _strengths(dims: dict[str, tuple[str, float]]) -> set[str]:
    """高于自身一级维度平均分的维度 code。"""
    if not dims:
        return set()
    avg = sum(s for _, s in dims.values()) / len(dims)
    return {code for code, (_, s) in dims.items() if s > avg}


def find_similar_streets(
    conn, evaluation_id: int, *, top_n: int, min_score: float, with_cover: bool = False
) -> list[dict[str, Any]]:
    """返回与该评价最相似的历史街区（排除同一街区，每个街区只取最近一次）。"""
    subs: dict[int, dict[str, float]] = {}
    dims: dict[int, dict[str, tuple[str, float]]] = {}
    street_of: dict[int, int] = {}
    for r in repo.fetch_dimension_vectors(conn):
        eid = r["evaluation_id"]
        street_of[eid] = r["street_id"]
        if not r["code"]:
            continue
        if r["dim_level"] == 2:
            subs.setdefault(eid, {})[r["code"]] = float(r["score"])
        else:
            dims.setdefault(eid, {})[r["code"]] = (r["name"], float(r["score"]))

    target = subs.get(evaluation_id)
    if not target:
        return []
    own_street = street_of.get(evaluation_id)
    target_strengths = _strengths(dims.get(evaluation_id, {}))

    # list_evaluations 按时间倒序，同一街区先遇到的就是最近一次
    seen_streets: set[int] = set()
    scored: list[tuple[float, dict[str, Any]]] = []
    for row in repo.list_evaluations(
        conn, limit=1000, status="completed", with_cover=with_cover
    ):
        eid = row["evaluation_id"]
        sid = street_of.get(eid)
        if eid == evaluation_id or sid is None or sid == own_street:
            continue
        if sid in seen_streets:
            continue
        seen_streets.add(sid)

        other = subs.get(eid)
        if not other:
            continue
        shared = sorted(target.keys() & other.keys())
        if len(shared) < _MIN_SHARED_DIMS:
            continue
        sim = pearson([target[k] for k in shared], [other[k] for k in shared])
        if sim is None or sim < min_score:
            continue

        other_dims = dims.get(eid, {})
        common = target_strengths & _strengths(other_dims)
        # 按两条街在该维度的平均分从高到低取前几个
        ranked = sorted(
            common,
            key=lambda c: dims[evaluation_id][c][1] + other_dims[c][1],
            reverse=True,
        )
        scored.append((sim, {
            "evaluation_id": eid,
            "street": row["street_name"],
            "city": row.get("city"),
            "district": row.get("district"),
            "total_score": (
                float(row["total_score"]) if row.get("total_score") is not None else None
            ),
            "image_url": row.get("image_url"),
            "similarity": round(sim, 4),
            "shared_strengths": [other_dims[c][0] for c in ranked[:_MAX_STRENGTHS]],
        }))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in scored[:top_n]]
