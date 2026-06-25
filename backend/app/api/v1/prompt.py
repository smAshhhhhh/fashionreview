"""Prompt 模板配置 API。

- GET  /prompts                       模板列表
- GET  /prompts/{id}                  模板详情
- PUT  /prompts/{id}                  更新模板（自动归档旧版，version+1）
- GET  /prompts/{id}/history          历史版本列表
- POST /prompts/{id}/rollback/{ver}   回滚到指定历史版本
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.evaluation import (
    PromptTemplateHistoryOut,
    PromptTemplateOut,
    PromptTemplateUpdate,
)
from app.services import prompt_service

router = APIRouter(prefix="/prompts", tags=["prompts"])


@router.get("", response_model=list[PromptTemplateOut])
def list_templates() -> list[PromptTemplateOut]:
    return [PromptTemplateOut(**t) for t in prompt_service.list_templates()]


@router.get("/{template_id}", response_model=PromptTemplateOut)
def get_template(template_id: int) -> PromptTemplateOut:
    tpl = prompt_service.get_template(template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="模板不存在")
    return PromptTemplateOut(**tpl)


@router.put("/{template_id}", response_model=PromptTemplateOut)
def update_template(template_id: int, body: PromptTemplateUpdate) -> PromptTemplateOut:
    tpl = prompt_service.update_template(template_id, body.model_dump())
    if tpl is None:
        raise HTTPException(status_code=404, detail="模板不存在")
    return PromptTemplateOut(**tpl)


@router.get("/{template_id}/history", response_model=list[PromptTemplateHistoryOut])
def list_history(template_id: int) -> list[PromptTemplateHistoryOut]:
    return [
        PromptTemplateHistoryOut(**h)
        for h in prompt_service.list_history(template_id)
    ]


@router.post("/{template_id}/rollback/{version}", response_model=PromptTemplateOut)
def rollback(template_id: int, version: int) -> PromptTemplateOut:
    tpl = prompt_service.rollback(template_id, version)
    if tpl is None:
        raise HTTPException(status_code=404, detail="模板或目标版本不存在")
    return PromptTemplateOut(**tpl)
