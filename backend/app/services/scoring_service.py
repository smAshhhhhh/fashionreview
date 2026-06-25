"""评分聚合逻辑（纯函数，不依赖数据库 / LLM，便于单测）。

分制：三级指标为整数 1~5；二级 / 一级 / 综合分由下层按权重加权平均得出，
值域 1.0~5.0，四舍五入到一位小数。权重在同级兄弟内归一化（和不为 1 时按实际和归一）。
"""

from __future__ import annotations

from typing import Any


def _weighted_average(items: list[tuple[float, float]]) -> float:
    """对 [(value, weight), ...] 做加权平均；权重和为 0 时退化为等权平均。

    返回未四舍五入的原始值，留给上层决定精度。
    """
    if not items:
        return 0.0
    total_w = sum(w for _, w in items)
    if total_w <= 0:
        return sum(v for v, _ in items) / len(items)
    return sum(v * w for v, w in items) / total_w


def _round1(value: float) -> float:
    """四舍五入到一位小数。"""
    return round(value + 1e-9, 1)


def aggregate(
    metric_tree: list[dict[str, Any]],
    metric_scores: dict[int, int],
) -> dict[str, Any]:
    """把 75 个三级整数分逐层聚合。

    :param metric_tree: repository.fetch_metric_tree 的返回（含各级 id/name/weight）
    :param metric_scores: {metric_id: score(1~5)}
    :return: {
        "total_score": float,
        "dimension_scores": [{dim_id, dim_name, score}],          # 一级，雷达图轴
        "sub_dimension_scores": [{sub_id, sub_name, dim_id, score}],
    }
    """
    # 1) 按二级分组收集三级 (score, weight)
    sub_groups: dict[int, dict[str, Any]] = {}
    for row in metric_tree:
        mid = row["metric_id"]
        if mid not in metric_scores:
            continue
        sub_id = row["sub_id"]
        grp = sub_groups.setdefault(
            sub_id,
            {
                "sub_id": sub_id,
                "sub_name": row["sub_name"],
                "sub_weight": float(row["sub_weight"]),
                "dim_id": row["dim_id"],
                "dim_name": row["dim_name"],
                "dim_weight": float(row["dim_weight"]),
                "dim_sort": row["dim_sort"],
                "sub_sort": row["sub_sort"],
                "metrics": [],
            },
        )
        grp["metrics"].append(
            (float(metric_scores[mid]), float(row["metric_weight"]))
        )

    # 2) 二级分 = 其下三级的加权平均
    sub_scores: list[dict[str, Any]] = []
    for grp in sub_groups.values():
        raw = _weighted_average(grp["metrics"])
        sub_scores.append(
            {
                "sub_id": grp["sub_id"],
                "sub_name": grp["sub_name"],
                "sub_weight": grp["sub_weight"],
                "dim_id": grp["dim_id"],
                "dim_name": grp["dim_name"],
                "dim_weight": grp["dim_weight"],
                "dim_sort": grp["dim_sort"],
                "sub_sort": grp["sub_sort"],
                "raw_score": raw,
                "score": _round1(raw),
            }
        )

    # 3) 一级分 = 其下二级的加权平均（用二级原始值，避免二次舍入误差累积）
    dim_groups: dict[int, dict[str, Any]] = {}
    for s in sub_scores:
        d = dim_groups.setdefault(
            s["dim_id"],
            {
                "dim_id": s["dim_id"],
                "dim_name": s["dim_name"],
                "dim_weight": s["dim_weight"],
                "dim_sort": s["dim_sort"],
                "subs": [],
            },
        )
        d["subs"].append((s["raw_score"], s["sub_weight"]))

    dim_scores: list[dict[str, Any]] = []
    for d in dim_groups.values():
        raw = _weighted_average(d["subs"])
        dim_scores.append(
            {
                "dim_id": d["dim_id"],
                "dim_name": d["dim_name"],
                "dim_weight": d["dim_weight"],
                "dim_sort": d["dim_sort"],
                "raw_score": raw,
                "score": _round1(raw),
            }
        )

    # 4) 综合分 = 一级的加权平均
    total_raw = _weighted_average(
        [(d["raw_score"], d["dim_weight"]) for d in dim_scores]
    )
    total_score = _round1(total_raw)

    # 按维度 / 二级排序输出
    dim_scores.sort(key=lambda x: x["dim_sort"])
    sub_scores.sort(key=lambda x: (x["dim_sort"], x["sub_sort"]))

    return {
        "total_score": total_score,
        "dimension_scores": [
            {"dim_id": d["dim_id"], "dim_name": d["dim_name"], "score": d["score"]}
            for d in dim_scores
        ],
        "sub_dimension_scores": [
            {
                "sub_id": s["sub_id"],
                "sub_name": s["sub_name"],
                "dim_id": s["dim_id"],
                "score": s["score"],
            }
            for s in sub_scores
        ],
    }


def build_dimension_rows(aggregated: dict[str, Any]) -> list[dict[str, Any]]:
    """把聚合结果转成 street_dimension_score 入库行（dim_level 1=一级 2=二级）。"""
    rows: list[dict[str, Any]] = []
    for d in aggregated["dimension_scores"]:
        rows.append({"dim_level": 1, "ref_id": d["dim_id"], "score": d["score"]})
    for s in aggregated["sub_dimension_scores"]:
        rows.append({"dim_level": 2, "ref_id": s["sub_id"], "score": s["score"]})
    return rows
