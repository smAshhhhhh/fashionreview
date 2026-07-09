"""资源中心（POI 管理 / 街巷画像）请求与响应模型。"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class ResourceStreetOut(BaseModel):
    street_id: int
    street_name: str
    city: str | None = None
    district: str | None = None
    poi_total: int = 0
    amap_count: int = 0
    dianping_count: int = 0
    has_profile: int = 0
    profile_update_time: str | None = None


class PoiImportStreet(BaseModel):
    id: int
    name: str
    city: str | None = None
    district: str | None = None


class PoiImportResult(BaseModel):
    street: PoiImportStreet
    detected_format: str
    source: str
    total_rows: int
    inserted: int
    updated: int
    skipped: int
    field_coverage: dict[str, float] = {}
    sample_rows: list[dict[str, Any]] = []
    warnings: list[str] = []


class PoiListOut(BaseModel):
    total: int
    items: list[dict[str, Any]]


class ProfileJobOut(BaseModel):
    job_id: str
    street_id: int
    status: str
    error: str | None = None


class StreetProfileDetail(BaseModel):
    street: PoiImportStreet
    has_profile: bool
    poi_total: int = 0
    amap_count: int = 0
    dianping_count: int = 0
    profile: dict[str, Any] | None = None
    extra_stats: dict[str, Any] = {}
    facts_preview: str = ""
