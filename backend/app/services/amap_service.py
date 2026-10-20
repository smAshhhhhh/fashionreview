"""高德 Web 服务：按地点名取 POI 照片，作为文字点评的封面。

接口：POI 搜索 2.0 关键字搜索 GET /v5/place/text（show_fields=photos）。
任何失败都只记日志返回 None，不影响点评主流程。
"""

from __future__ import annotations

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_ENDPOINT = "https://restapi.amap.com/v5/place/text"


def fetch_place_photo(name: str, city: str | None = None) -> str | None:
    """返回与地点名最匹配、且带照片的 POI 的第一张图片 URL；取不到返回 None。"""
    settings = get_settings()
    if not settings.amap_key or not name:
        return None

    params = {
        "key": settings.amap_key,
        "keywords": name,
        "show_fields": "photos",
        "page_size": 5,
    }
    if city:
        params["region"] = city
        params["city_limit"] = "true"

    try:
        resp = httpx.get(_ENDPOINT, params=params, timeout=settings.amap_timeout)
        body = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("高德 POI 搜索失败：%s（%s）", name, exc)
        return None

    if body.get("status") != "1":
        logger.warning(
            "高德 POI 搜索返回错误：%s（info=%s infocode=%s）",
            name, body.get("info"), body.get("infocode"),
        )
        return None

    for poi in body.get("pois") or []:
        photos = poi.get("photos") or []
        if isinstance(photos, dict):
            photos = [photos]
        for photo in photos:
            url = (photo or {}).get("url")
            if url:
                # 高德图片偶尔给 http，统一升级避免 https 页面混合内容
                return "https://" + url[len("http://"):] if url.startswith("http://") else url
    logger.info("高德 POI 搜索无照片：%s（city=%s）", name, city)
    return None
