"""街巷画像编排器：合并各统计模块结果，生成 street_profile 写库 payload。"""

from __future__ import annotations

from typing import Any

from .dianping_statistics import build_dianping_statistics
from .poi_statistics import build_poi_statistics, normalize_name
from .tag_statistics import build_tag_statistics


def _by_source(pois: list[dict[str, Any]], source: str) -> list[dict[str, Any]]:
    return [p for p in pois if p.get("source") == source]


def build_profile(pois: list[dict[str, Any]]) -> dict[str, Any]:
    """从 street_poi 明细生成 street_profile payload。

    不合并高德/点评行；聚合时按 source 分别取长处：高德负责空间/分类，
    点评负责评分/人均/连锁/菜系。poi_count 按店名去重，避免同店跨源双计。
    """
    amap_pois = _by_source(pois, "amap")
    dianping_pois = _by_source(pois, "dianping")
    unique_names = {n for p in pois if (n := normalize_name(p.get("name")))}

    poi_stats = build_poi_statistics(amap_pois)
    dp_stats = build_dianping_statistics(dianping_pois)
    tag_stats = build_tag_statistics(pois)

    poi_count = len(unique_names) or len(pois)
    restaurant_count = poi_stats.get("restaurant_count") or 0
    shopping_count = poi_stats.get("shopping_count") or 0

    extra_stats = {
        "data_sources": {
            "amap_count": len(amap_pois),
            "dianping_count": len(dianping_pois),
            "unique_name_count": poi_count,
        },
        "category_distribution": poi_stats.get("category_distribution", {}),
        "category_l2_top": poi_stats.get("category_l2_top", []),
        "geo_coverage_pct": poi_stats.get("geo_coverage_pct", 0),
        "cuisine_top": dp_stats.get("cuisine_top", []),
        "rating_profile": dp_stats.get("rating_profile", {}),
        "price_profile": dp_stats.get("price_profile", {}),
        "chain_profile": dp_stats.get("chain_profile", {}),
        "promotion_profile": dp_stats.get("promotion_profile", {}),
        "status_distribution": dp_stats.get("status_distribution", []),
        **tag_stats,
    }

    return {
        "poi_count": poi_count,
        "restaurant_count": restaurant_count,
        "shopping_count": shopping_count,
        "restaurant_ratio": poi_stats.get("restaurant_ratio"),
        "shopping_ratio": poi_stats.get("shopping_ratio"),
        "chain_count": dp_stats.get("chain_count"),
        "chain_ratio": dp_stats.get("chain_ratio"),
        "avg_rating": dp_stats.get("avg_rating"),
        "high_rating_ratio": dp_stats.get("high_rating_ratio"),
        "avg_price": dp_stats.get("avg_price"),
        "total_reviews": dp_stats.get("total_reviews"),
        "total_checkins": sum(int(p.get("checkin_count") or 0) for p in amap_pois),
        "extra_stats": extra_stats,
    }
