"""街巷画像聚合服务（事实层）。

职责：从 street_poi 明细用纯 Python 聚合出 street_profile 的数值字段，
以及结构化摘要 extra_stats（poi_summary 分类计数 + poi_highlights 分类品牌），
upsert 进 street_profile。

只产出「稳定事实层」——不生成任何喂给 LLM 的自然语言文本（profile_text 等
表现层内容由 retriever 运行时临时生成，便于改文案/换模型不动库）。
"""

from __future__ import annotations

from typing import Any

from app.db import repository as repo

# ──────────────── POI 细分类规则 ────────────────
# (标签, category_l2/name/cuisine 命中的关键词, 连锁约束)
#   chain 约束："non_chain" 仅非连锁计入；"chain" 仅连锁计入；None 不限。
# 一个 POI 可命中多个标签（如「咖啡书店」）。匹配文本 = category_l2 + name + cuisine。
_CATEGORY_RULES: list[tuple[str, tuple[str, ...], str | None]] = [
    ("boutique_cafe", ("咖啡", "coffee", "café"), "non_chain"),
    ("chain_cafe", ("咖啡", "coffee", "café"), "chain"),
    ("designer_store", ("设计师", "买手", "集合店", "时装", "服装", "女装", "男装", "潮牌"), None),
    ("luxury_store", ("奢侈品", "名品", "旗舰店", "精品店"), None),
    ("gallery", ("画廊", "美术馆", "艺术中心", "艺术空间", "展览"), None),
    ("bookstore", ("书店", "图书", "书局"), None),
    ("nightlife", ("酒吧", "livehouse", "夜店", "清吧", "小酒馆"), None),
    ("vintage", ("古着", "vintage", "二手", "复古"), None),
    ("restaurant", ("餐厅", "料理", "菜", "餐馆", "食堂", "私房菜", "西餐", "日料"), None),
]


def _match_text(poi: dict[str, Any]) -> str:
    """拼接用于关键词匹配的文本：category_l2 优先，退到 name + cuisine。"""
    parts = [
        str(poi.get("category_l2") or ""),
        str(poi.get("name") or ""),
        str(poi.get("cuisine") or ""),
    ]
    return " ".join(parts).lower()


def _is_chain(poi: dict[str, Any]) -> bool:
    return int(poi.get("is_chain") or 0) == 1


def _classify_poi(poi: dict[str, Any]) -> list[str]:
    """返回该 POI 命中的全部细分类标签。"""
    text = _match_text(poi)
    chain = _is_chain(poi)
    labels: list[str] = []
    for label, keywords, chain_req in _CATEGORY_RULES:
        if not any(kw.lower() in text for kw in keywords):
            continue
        if chain_req == "non_chain" and chain:
            continue
        if chain_req == "chain" and not chain:
            continue
        labels.append(label)
    return labels


# ──────────────── 聚合 ────────────────

def _ratio(part: int, whole: int) -> float | None:
    """占比，保留 4 位小数（对齐 DECIMAL(5,4)）。whole 为 0 返回 None。"""
    if not whole:
        return None
    return round(part / whole, 4)


def _avg(values: list[float]) -> float | None:
    """非空均值，保留 2 位小数。无数据返回 None。"""
    if not values:
        return None
    return round(sum(values) / len(values), 2)


def _aggregate(pois: list[dict[str, Any]], *, highlight_limit: int = 5) -> dict[str, Any]:
    """对 POI 明细做统计聚合，返回 street_profile 的数值字段 + extra_stats。"""
    poi_count = len(pois)

    restaurant_count = sum(1 for p in pois if "餐饮" in str(p.get("category_l1") or ""))
    shopping_count = sum(1 for p in pois if "购物" in str(p.get("category_l1") or ""))
    chain_count = sum(1 for p in pois if _is_chain(p))

    ratings = [float(p["rating"]) for p in pois if p.get("rating") is not None]
    prices = [float(p["avg_price"]) for p in pois if p.get("avg_price") is not None]
    high_rating = sum(1 for r in ratings if r >= 4.0)

    # 细分类计数 + 按分类分组的亮点品牌
    summary: dict[str, int] = {}
    # 候选亮点：非连锁、按 (rating, review_count, checkin_count) 排序
    by_label: dict[str, list[dict[str, Any]]] = {}
    for p in pois:
        for label in _classify_poi(p):
            summary[label] = summary.get(label, 0) + 1
            if not _is_chain(p):
                by_label.setdefault(label, []).append(p)

    def _hl_key(p: dict[str, Any]) -> tuple[float, int, int]:
        return (
            float(p.get("rating") or 0),
            int(p.get("review_count") or 0),
            int(p.get("checkin_count") or 0),
        )

    highlights: dict[str, list[str]] = {}
    for label, cands in by_label.items():
        names: list[str] = []
        for p in sorted(cands, key=_hl_key, reverse=True):
            name = (p.get("name") or "").strip()
            if name and name not in names:
                names.append(name)
            if len(names) >= highlight_limit:
                break
        if names:
            highlights[label] = names

    return {
        "poi_count": poi_count,
        "restaurant_count": restaurant_count,
        "shopping_count": shopping_count,
        "restaurant_ratio": _ratio(restaurant_count, poi_count),
        "shopping_ratio": _ratio(shopping_count, poi_count),
        "chain_count": chain_count,
        "chain_ratio": _ratio(chain_count, poi_count),
        "avg_rating": _avg(ratings),
        "high_rating_ratio": _ratio(high_rating, len(ratings)),
        "avg_price": _avg(prices),
        "total_reviews": sum(int(p.get("review_count") or 0) for p in pois),
        "total_checkins": sum(int(p.get("checkin_count") or 0) for p in pois),
        "extra_stats": {"poi_summary": summary, "poi_highlights": highlights},
    }


# ──────────────── 对外接口 ────────────────

def rebuild_profile(conn, street_id: int) -> dict[str, Any] | None:
    """重算并 upsert 画像。该街巷无 POI 时返回 None（不写空画像）。"""
    pois = repo.list_pois_by_street(conn, street_id)
    if not pois:
        return None
    agg = _aggregate(pois)
    repo.upsert_street_profile(conn, street_id, agg)
    return repo.get_street_profile(conn, street_id)


def get_or_build_profile(conn, street_id: int) -> dict[str, Any] | None:
    """评分时按需取画像：有缓存直接用，无则现算并 upsert。

    MVP 不做过期重算；POI 更新后可手动重跑导入脚本刷新。
    """
    prof = repo.get_street_profile(conn, street_id)
    if prof and prof.get("extra_stats"):
        return prof
    return rebuild_profile(conn, street_id)
