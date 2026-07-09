"""大众点评/消费/口碑统计。"""

from __future__ import annotations

from statistics import median
from typing import Any

from .poi_statistics import pct, ratio, to_float
from collections import Counter


def _avg(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 2)


def _price_band(price: float) -> str:
    if price < 50:
        return "0-50"
    if price < 100:
        return "50-100"
    if price < 200:
        return "100-200"
    return "200+"


def _top_list(values: list[str], top_n: int = 10) -> list[dict[str, float | int | str]]:
    c = Counter(v for v in values if v)
    total = sum(c.values())
    return [{"name": k, "count": v, "pct": pct(v, total)} for k, v in c.most_common(top_n)]


def build_dianping_statistics(dianping_pois: list[dict[str, Any]]) -> dict[str, Any]:
    """基于点评数据统计评分、人均、连锁、菜系与营业状态。"""
    total = len(dianping_pois)
    ratings = [r for p in dianping_pois if (r := to_float(p.get("rating"))) is not None and r > 0]
    prices = [v for p in dianping_pois if (v := to_float(p.get("avg_price"))) is not None and v > 0]
    reviews = [int(p.get("review_count") or 0) for p in dianping_pois]
    chain_count = sum(1 for p in dianping_pois if int(p.get("is_chain") or 0) == 1)
    promo_count = sum(1 for p in dianping_pois if int(p.get("has_promotion") or 0) == 1)
    high_rating = sum(1 for r in ratings if r >= 4.0)
    band_counts = Counter(_price_band(p) for p in prices)
    status_values = [str(p.get("business_status") or "") for p in dianping_pois]
    cuisines = []
    for p in dianping_pois:
        raw = str(p.get("cuisine") or "")
        # 大众点评菜系可能是 "云南菜|滇菜"，拆开更有信息量
        cuisines.extend([x.strip() for x in raw.split("|") if x.strip()])

    return {
        "dianping_count": total,
        "chain_count": chain_count,
        "chain_ratio": ratio(chain_count, total),
        "avg_rating": _avg(ratings),
        "high_rating_ratio": ratio(high_rating, len(ratings)),
        "avg_price": _avg(prices),
        "median_price": round(float(median(prices)), 2) if prices else None,
        "total_reviews": sum(reviews),
        "rating_profile": {
            "avg_rating": _avg(ratings),
            "rating_count": len(ratings),
            "high_rating_count": high_rating,
            "high_rating_pct": pct(high_rating, len(ratings)),
            "review_count_total": sum(reviews),
        },
        "price_profile": {
            "avg_price": _avg(prices),
            "median_price": round(float(median(prices)), 2) if prices else None,
            "price_count": len(prices),
            "price_band_counts": dict(band_counts),
        },
        "chain_profile": {
            "chain_count": chain_count,
            "chain_pct": pct(chain_count, total),
        },
        "promotion_profile": {
            "promotion_count": promo_count,
            "promotion_pct": pct(promo_count, total),
        },
        "status_distribution": _top_list(status_values, top_n=8),
        "cuisine_top": _top_list(cuisines, top_n=12),
    }
