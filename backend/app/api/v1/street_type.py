"""街区类型 API（资源中心「指标体系」页的类型分组）。

- GET /street-types       全部类型
- PUT /street-types/{id}  更新类型名称 / 定义
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.evaluation import StreetTypeOut, StreetTypeUpdate
from app.services import street_type_service as svc

router = APIRouter(prefix="/street-types", tags=["street-types"])


@router.get("", response_model=list[StreetTypeOut])
def list_types() -> list[StreetTypeOut]:
    return [StreetTypeOut(**t) for t in svc.list_types()]


@router.put("/{type_id}", response_model=StreetTypeOut)
def update_type(type_id: int, body: StreetTypeUpdate) -> StreetTypeOut:
    row = svc.update_type(type_id, body.name, body.description)
    if row is None:
        raise HTTPException(status_code=404, detail="街区类型不存在")
    return StreetTypeOut(**row)
