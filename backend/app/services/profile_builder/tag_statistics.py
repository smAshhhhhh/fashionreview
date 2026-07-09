"""时尚标签、标签密度与亮点品牌统计。"""

from __future__ import annotations

from typing import Any

from .poi_statistics import pct, to_float

# 标签 → 中文名由前端/检索层翻译，这里只产出稳定英文 key。
_TAG_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("boutique_cafe", ("咖啡", "coffee", "café", "roaster")),
    ("designer_store", ("设计师", "买手", "集合店", "时装", "服装", "潮牌", "品牌服装", "定制")),
    ("luxury_store", ("奢侈", "名品", "旗舰", "珠宝", "腕表", "香水", "美妆", "dior", "cartier")),
    ("gallery_culture", ("画廊", "艺术", "美术馆", "展览", "书店", "书局", "文化")),
    ("nightlife", ("酒吧", "清吧", "livehouse", "小酒馆", "bistro", "夜")),
    ("western_dining", ("西餐", "法国", "西班牙", "意式", "bistro", "bakery", "面包", "brunch")),
    ("internet_famous", ("旗舰", "首店", "网红", "全球", "概念", "精品", "创意", "潮")),
]


def _text(poi: dict[str, Any]) -> str:
    parts = [
        poi.get("name"), poi.get("category_l1"), poi.get("category_l2"),
        poi.get("cuisine"), poi.get("business_area"),
    ]
    return " ".join(str(p or "") for p in parts).lower()


def _labels(poi: dict[str, Any]) -> list[str]:
    t = _text(poi)
    return [label for label, kws in _TAG_RULES if any(kw.lower() in t for kw in kws)]


def _highlight_score(poi: dict[str, Any]) -> tuple[float, int, float]:
    return (
        to_float(poi.get("rating")) or 0.0,
        int(poi.get("review_count") or 0),
        to_float(poi.get("avg_price")) or 0.0,
    )


def build_tag_statistics(pois: list[dict[str, Any]], *, highlight_limit: int = 8) -> dict[str, Any]:
    """输出 fashion_tags(_count), fashion_density(_pct), poi_highlights。"""
    total = len(pois)
    counts = {f"{label}_count": 0 for label, _ in _TAG_RULES}
    by_label: dict[str, list[dict[str, Any]]] = {}

    for p in pois:
        for label in _labels(p):
            counts[f"{label}_count"] = counts.get(f"{label}_count", 0) + 1
            by_label.setdefault(label, []).append(p)

    density = {
        k.replace("_count", "_pct"): pct(v, total)
        for k, v in counts.items()
    }

    highlights: dict[str, list[str]] = {}
    for label, cands in by_label.items():
        names: list[str] = []
        for p in sorted(cands, key=_highlight_score, reverse=True):
            name = str(p.get("name") or "").strip()
            if name and name not in names:
                names.append(name)
            if len(names) >= highlight_limit:
                break
        if names:
            highlights[label] = names

    return {
        "fashion_tags": counts,
        "fashion_density": density,
        "poi_highlights": highlights,
    }
