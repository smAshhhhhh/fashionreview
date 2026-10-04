"""资源中心 POI 管理 / 街巷画像 API。"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from app.db import repository as repo
from app.db.session import connection_scope
from app.schemas.resource import (
    AnnotationImportResult,
    AnnotationJobOut,
    AnnotationListOut,
    PoiImportResult,
    PoiListOut,
    ProfileJobOut,
    ResourceStreetOut,
    StreetProfileDetail,
)
from app.services import annotation_import_service, poi_import_service, profile_service
from app.services.retriever import StreetFacts

router = APIRouter(prefix="/resource", tags=["resource"])

# 标注表格体积上限：源文件 147MB（内嵌 30 张高清图），与图片端点的 10MB 无关
_MAX_XLSX_BYTES = 300 * 1024 * 1024


def _dt(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.isoformat()
    return str(v)


def _parse_extra(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, (str, bytes)):
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return {}
    return {}


@router.get("/streets", response_model=list[ResourceStreetOut])
def list_resource_streets() -> list[ResourceStreetOut]:
    with connection_scope() as conn:
        rows = repo.list_resource_streets(conn)
    return [
        ResourceStreetOut(
            street_id=r["street_id"],
            street_name=r["street_name"],
            city=r.get("city"),
            district=r.get("district"),
            poi_total=r.get("poi_total") or 0,
            amap_count=r.get("amap_count") or 0,
            dianping_count=r.get("dianping_count") or 0,
            has_profile=r.get("has_profile") or 0,
            profile_update_time=_dt(r.get("profile_update_time")),
        )
        for r in rows
    ]


@router.post("/poi/import", response_model=PoiImportResult)
async def import_poi_file(
    file: UploadFile = File(...),
    street_name: str = Form(...),
    city: str | None = Form(None),
    district: str | None = Form(None),
    source_mode: str | None = Form(None),
    clear_existing: bool = Form(False),
) -> PoiImportResult:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="文件为空")
    try:
        with connection_scope() as conn:
            result = poi_import_service.import_upload(
                conn,
                filename=file.filename or "upload",
                content=data,
                street_name=street_name.strip(),
                city=city,
                district=district,
                source_mode=source_mode,
                clear_existing=clear_existing,
            )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"导入失败：{exc}") from exc
    return PoiImportResult(**result)


@router.get("/poi", response_model=PoiListOut)
def list_poi_rows(
    street_id: int | None = Query(None),
    source: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> PoiListOut:
    with connection_scope() as conn:
        data = repo.list_pois(
            conn, street_id=street_id, source=source, limit=limit, offset=offset
        )
    return PoiListOut(**data)


@router.delete("/poi/by-street/{street_id}")
def delete_poi_by_street(
    street_id: int, source: str | None = Query("all")
) -> dict[str, Any]:
    with connection_scope() as conn:
        deleted = repo.delete_pois_by_street(conn, street_id, source)
    return {"deleted": deleted, "street_id": street_id, "source": source or "all"}


@router.get("/profiles/{street_id}", response_model=StreetProfileDetail)
def get_profile_detail(street_id: int) -> StreetProfileDetail:
    with connection_scope() as conn:
        street = repo.get_street_by_id(conn, street_id)
        if not street:
            raise HTTPException(status_code=404, detail="街区不存在")
        pois = repo.list_pois_by_street(conn, street_id)
        prof = repo.get_street_profile(conn, street_id)

    amap_count = sum(1 for p in pois if p.get("source") == "amap")
    dianping_count = sum(1 for p in pois if p.get("source") == "dianping")
    extra = _parse_extra((prof or {}).get("extra_stats")) if prof else {}
    facts_preview = ""
    if prof:
        facts_preview = StreetFacts(
            poi_summary=extra.get("fashion_tags", extra.get("poi_summary", {})),
            poi_highlights=extra.get("poi_highlights", {}),
            profile=prof,
            has_data=True,
        ).to_prompt_facts()

    return StreetProfileDetail(
        street={
            "id": street["id"],
            "name": street["street_name"],
            "city": street.get("city"),
            "district": street.get("district"),
        },
        has_profile=prof is not None,
        poi_total=len(pois),
        amap_count=amap_count,
        dianping_count=dianping_count,
        profile=prof,
        extra_stats=extra,
        facts_preview=facts_preview,
    )


@router.post("/profiles/{street_id}/rebuild", response_model=ProfileJobOut)
def start_profile_rebuild(street_id: int) -> ProfileJobOut:
    with connection_scope() as conn:
        if not repo.get_street_by_id(conn, street_id):
            raise HTTPException(status_code=404, detail="街区不存在")
    job_id = profile_service.start_rebuild_profile_job(street_id)
    job = profile_service.get_profile_job(job_id)
    return ProfileJobOut(**job)


@router.get("/profile-jobs/{job_id}", response_model=ProfileJobOut)
def get_profile_job(job_id: str) -> ProfileJobOut:
    job = profile_service.get_profile_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="任务不存在")
    return ProfileJobOut(**job)


# ──────────────── 人工标注库（图片属性匹配） ────────────────


@router.post("/annotations/import", response_model=AnnotationImportResult)
async def import_annotation_file(
    file: UploadFile = File(...),
    clear_existing: bool = Form(False),
) -> AnnotationImportResult:
    """上传 WPS 标注表格（含 DISPIMG 内嵌图）→ 解析 + 图片落盘 + 属性入库。

    刻意不用 `await file.read()`：源文件 147MB，整份读进内存不合适。改为流式
    copy 到临时文件再交给解析器，结束后无论成败都删掉临时文件。
    """
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="请上传 .xlsx 格式的标注表格")

    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
            tmp_path = tmp.name
            # 分块拷贝，同时累计大小以便超限即停，不把整份文件读进内存
            size = 0
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > _MAX_XLSX_BYTES:
                    raise HTTPException(
                        status_code=400,
                        detail=f"文件不得超过 {_MAX_XLSX_BYTES // (1024 * 1024)}MB",
                    )
                tmp.write(chunk)
        if size == 0:
            raise HTTPException(status_code=400, detail="文件为空")

        result = annotation_import_service.import_annotation_xlsx(
            temp_path=tmp_path, clear_existing=clear_existing
        )
    except HTTPException:
        raise
    except ValueError as exc:  # 解析层的明确报错（非预期格式等）
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"导入失败：{exc}") from exc
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)
    return AnnotationImportResult(**result)


@router.get("/annotations", response_model=AnnotationListOut)
def list_annotations(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> AnnotationListOut:
    """标注图列表（带属性与向量状态）+ 库概览计数。"""
    data = annotation_import_service.list_annotations(limit=limit, offset=offset)
    return AnnotationListOut(**data)


@router.post("/annotations/embeddings/rebuild", response_model=AnnotationJobOut)
def start_annotation_embedding(force: bool = Query(False)) -> AnnotationJobOut:
    """启动向量生成任务，立即返回 job_id（前端轮询状态）。

    :param force: False 只补算缺失/模型不符的；True 全部重算
    """
    job_id = annotation_import_service.start_embedding_job(force=force)
    job = annotation_import_service.get_embedding_job(job_id)
    if job is None:  # 理论不可达，防御性处理
        raise HTTPException(status_code=500, detail="任务创建失败")
    return AnnotationJobOut(**job)


@router.get("/annotation-jobs/{job_id}", response_model=AnnotationJobOut)
def get_annotation_job(job_id: str) -> AnnotationJobOut:
    job = annotation_import_service.get_embedding_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="任务不存在")
    return AnnotationJobOut(**job)


@router.delete("/annotations")
def clear_annotations() -> dict[str, int]:
    """清空标注库（含磁盘图片）。破坏性操作，前端需二次确认。"""
    removed = annotation_import_service.clear_annotations()
    return {"deleted": removed}
