"""资源中心 POI 管理 / 街巷画像 API。"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from app.db import repository as repo
from app.db.session import connection_scope
from app.schemas.resource import (
    PoiImportResult,
    PoiListOut,
    ProfileJobOut,
    ResourceStreetOut,
    StreetProfileDetail,
)
from app.services import poi_import_service, profile_service
from app.services.retriever import StreetFacts

router = APIRouter(prefix="/resource", tags=["resource"])


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
