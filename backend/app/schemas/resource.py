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


# ──────────────── 人工标注库（图片属性匹配） ────────────────

class AnnotationImportResult(BaseModel):
    """标注表格导入摘要。

    unknown_metrics / unknown_grade_words 是关键告警项：属性名没命中空间美学维度
    的三级指标、或成语不在已知词表内时必须显式报出，而不是静默丢掉。
    """

    total_rows: int
    inserted: int
    updated: int
    attr_total: int
    unknown_metrics: list[str] = []
    unknown_grade_words: list[str] = []
    warnings: list[str] = []


class AnnotationListOut(BaseModel):
    """标注图分页列表 + 库概览计数。"""

    total: int
    items: list[dict[str, Any]] = []
    image_count: int = 0
    attr_count: int = 0
    embedded_count: int = 0


class AnnotationJobOut(BaseModel):
    """向量生成任务状态（前端轮询）。"""

    job_id: str
    status: str  # running / completed / partial
    total: int = 0
    done: int = 0
    failed: int = 0
    error: str | None = None
