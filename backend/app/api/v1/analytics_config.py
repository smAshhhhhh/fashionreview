"""分析中心显示配置 API（资源中心「分析管理」）。

- GET /analytics-config              全部显示区块配置
- PUT /analytics-config/{block_key}  更新某区块的启用状态
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.evaluation import DisplayConfigOut, DisplayConfigUpdate
from app.services import display_config_service

router = APIRouter(prefix="/analytics-config", tags=["analytics-config"])


@router.get("", response_model=list[DisplayConfigOut])
def list_config() -> list[DisplayConfigOut]:
    return [DisplayConfigOut(**c) for c in display_config_service.list_config()]


@router.put("/{block_key}", response_model=DisplayConfigOut)
def update_config(block_key: str, body: DisplayConfigUpdate) -> DisplayConfigOut:
    row = display_config_service.set_enabled(block_key, body.enabled)
    if row is None:
        raise HTTPException(status_code=404, detail="显示区块不存在")
    return DisplayConfigOut(**row)
