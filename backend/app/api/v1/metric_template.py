"""指标体系模板（版本）API（资源中心「指标体系」）。

- GET    /metric-templates                 模板列表（带计数与是否被引用）
- GET    /metric-templates/{id}/tree        模板详情（嵌套维度树）
- POST   /metric-templates                  新建：空骨架 或 克隆来源模板
- PUT    /metric-templates/{id}             更新模板名称/说明
- PUT    /metric-templates/{id}/tree        保存维度树内容（已用则另存为新模板）
- POST   /metric-templates/{id}/activate    启用该模板（影响后续 AI 点评与新评价）
- DELETE /metric-templates/{id}             删除模板（启用中/已被引用则拒绝）
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.evaluation import (
    MetricTemplateCreate,
    MetricTemplateMeta,
    MetricTemplateMetaUpdate,
    MetricTemplateOut,
    MetricTemplateSaveResult,
    MetricTemplateSaveTree,
    MetricTemplateTreeOut,
)
from app.services import metric_template_service as svc

router = APIRouter(prefix="/metric-templates", tags=["metric-templates"])


@router.get("", response_model=list[MetricTemplateOut])
def list_templates() -> list[MetricTemplateOut]:
    return [MetricTemplateOut(**t) for t in svc.list_templates()]


@router.get("/{template_id}/tree", response_model=MetricTemplateTreeOut)
def get_tree(template_id: int) -> MetricTemplateTreeOut:
    data = svc.get_tree(template_id)
    if data is None:
        raise HTTPException(status_code=404, detail="模板不存在")
    return MetricTemplateTreeOut(**data)


@router.post("", response_model=MetricTemplateMeta, status_code=201)
def create_template(body: MetricTemplateCreate) -> MetricTemplateMeta:
    if body.source_template_id is not None:
        new_id = svc.clone_from(body.source_template_id, body.name)
        if new_id is None:
            raise HTTPException(status_code=404, detail="来源模板不存在")
    else:
        new_id = svc.create_blank()
    meta = svc.get_tree(new_id)
    return MetricTemplateMeta(**meta["template"])


@router.put("/{template_id}", response_model=MetricTemplateMeta)
def update_meta(template_id: int, body: MetricTemplateMetaUpdate) -> MetricTemplateMeta:
    meta = svc.update_meta(template_id, body.name, body.description)
    if meta is None:
        raise HTTPException(status_code=404, detail="模板不存在")
    return MetricTemplateMeta(**meta)


@router.put("/{template_id}/tree", response_model=MetricTemplateSaveResult)
def save_tree(template_id: int, body: MetricTemplateSaveTree) -> MetricTemplateSaveResult:
    result = svc.save_tree(
        template_id,
        [d.model_dump() for d in body.dims],
        save_as_new=body.save_as_new,
        new_name=body.new_name,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="模板不存在")
    return MetricTemplateSaveResult(
        template=MetricTemplateMeta(**result["template"]), is_new=result["is_new"]
    )


@router.post("/{template_id}/activate", response_model=MetricTemplateMeta)
def activate(template_id: int) -> MetricTemplateMeta:
    meta = svc.activate(template_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="模板不存在")
    return MetricTemplateMeta(**meta)


@router.delete("/{template_id}")
def delete(template_id: int) -> dict[str, str]:
    err = svc.delete(template_id)
    if err is None:
        return {"status": "deleted"}
    reason = err["error"]
    if reason == "not_found":
        raise HTTPException(status_code=404, detail="模板不存在")
    if reason == "active":
        raise HTTPException(status_code=409, detail="当前启用模板不可删除，请先切换到其他模板")
    if reason == "in_use":
        raise HTTPException(status_code=409, detail="该模板已被历史评价引用，不可删除")
    raise HTTPException(status_code=400, detail="删除失败")
