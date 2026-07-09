"""高德/空间/客观分类统计。"""

from __future__ import annotations

from collections import Counter
from decimal import Decimal
from typing import Any


def ratio(part: int, whole: int) -> float | None:
    if not whole:
        return None
    return round(part / whole, 4)


def pct(part: int, whole: int) -> float:
    if not whole:
        return 0.0
    return round(part / whole * 100, 2)


def to_float(v: Any) -> float | None:
    if v is None:
        return None
    if isinstance(v, Decimal):
        return float(v)
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def normalize_name(name: str | None) -> str:
    """粗归一化店名，用于跨源去重计数（不用于合并入库）。"""
    if not name:
        return ""
    s = str(name).strip().lower()
    for token in ["（", "("]:
        idx = s.find(token)
        if idx > 0:
            s = s[:idx]
            break
    return "".join(ch for ch in s if not ch.isspace())


def _dist(values: list[str], top_n: int | None = None) -> dict[str, dict[str, float | int]]:
    c = Counter(v for v in values if v)
    total = sum(c.values())
    items = c.most_common(top_n)
    return {k: {"count": v, "pct": pct(v, total)} for k, v in items}


def _top_list(values: list[str], top_n: int = 10) -> list[dict[str, float | int | str]]:
    c = Counter(v for v in values if v)
    total = sum(c.values())
    return [{"name": k, "count": v, "pct": pct(v, total)} for k, v in c.most_common(top_n)]


def build_poi_statistics(amap_pois: list[dict[str, Any]]) -> dict[str, Any]:
    """基于高德数据统计空间与客观业态。"""
    total = len(amap_pois)
    category_l1 = [str(p.get("category_l1") or "") for p in amap_pois]
    category_l2 = [str(p.get("category_l2") or "") for p in amap_pois]
    restaurant_count = sum(1 for x in category_l1 if "餐饮" in x)
    shopping_count = sum(1 for x in category_l1 if "购物" in x)
    geo_count = sum(1 for p in amap_pois if p.get("longitude") is not None and p.get("latitude") is not None)
    return {
        "amap_count": total,
        "restaurant_count": restaurant_count,
        "shopping_count": shopping_count,
        "restaurant_ratio": ratio(restaurant_count, total),
        "shopping_ratio": ratio(shopping_count, total),
        "geo_coverage_pct": pct(geo_count, total),
        "category_distribution": _dist(category_l1),
        "category_l2_top": _top_list(category_l2, top_n=12),
    }
