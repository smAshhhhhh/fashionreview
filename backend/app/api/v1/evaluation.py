"""评价分析 API。

- POST /analyze/text        提交文本，异步执行评价链，立即返回 task_id
- POST /analyze/image       上传街景照片，落盘后异步执行评价链，立即返回 task_id
- GET  /analyze/result/{id} 按 evaluation_id 查询评价结果
"""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from app.core.config import get_settings
from app.schemas.evaluation import (
    AnalyzeAccepted,
    BatchDeleteRequest,
    ConfirmInfoOut,
    ConfirmLocationRequest,
    ConfirmLocationResult,
    EvaluationResult,
    HistoryItemOut,
    TextAnalyzeRequest,
)
from app.services import evaluation_service

router = APIRouter(prefix="/analyze", tags=["analyze"])

# 允许的图片类型与上限，防止任意文件落盘
_ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10MB


@router.post("/text", response_model=AnalyzeAccepted)
def analyze_text(req: TextAnalyzeRequest) -> AnalyzeAccepted:
    """提交文本分析任务，立即返回 task_id；进度经 /task/{id}/progress 推送。"""
    try:
        result = evaluation_service.submit_text_analysis(req.content, req.city)
    except RuntimeError as exc:  # 配置类错误，如未设置 API Key
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"提交失败：{exc}") from exc
    return AnalyzeAccepted(**result)


async def _save_upload_image(file: UploadFile) -> tuple[str, str]:
    """校验并落盘一张上传图片，返回 (rel_url, abs_path)。

    发起分析与「换图重识别」共用，避免两处各写一遍类型/大小校验 —— 校验规则
    分叉会留下一个绕过限制的入口。

    :raises HTTPException: 类型不支持 / 空文件 / 超过上限
    """
    ext = _ALLOWED_IMAGE_TYPES.get(file.content_type or "")
    if ext is None:
        raise HTTPException(
            status_code=400, detail="仅支持 JPEG / PNG / WebP 图片"
        )

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="文件为空")
    if len(data) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="图片不得超过 10MB")

    settings = get_settings()
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    fname = f"{uuid.uuid4().hex}{ext}"  # uuid 文件名，杜绝路径穿越
    abs_path = upload_dir / fname
    abs_path.write_bytes(data)

    # 对外仅暴露相对路径，不带 host
    return f"/static/uploads/{fname}", str(abs_path)


@router.post("/image", response_model=AnalyzeAccepted)
async def analyze_image(
    file: UploadFile = File(...),
    city: str | None = Form(None),
) -> AnalyzeAccepted:
    """上传街景照片发起分析：校验 → 落盘 → 异步识别评分，立即返回 task_id。"""
    rel_url, abs_path = await _save_upload_image(file)
    try:
        result = evaluation_service.submit_image_analysis(rel_url, abs_path, city)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"提交失败：{exc}") from exc
    return AnalyzeAccepted(**result)


@router.post("/confirm/{task_id}/image", response_model=AnalyzeAccepted)
async def replace_confirm_image(
    task_id: int,
    file: UploadFile = File(...),
    city: str | None = Form(None),
) -> AnalyzeAccepted:
    """待确认时换一张照片，在同一个 task 上重新识别。

    保留同一个 taskId，而不是「取消旧任务 + 新建」—— 换图是这次点评的一次重试，
    历史里只应留一条终态记录，前端 URL 也不必跟着变。
    """
    rel_url, abs_path = await _save_upload_image(file)
    try:
        result = evaluation_service.replace_image_and_recognize(
            task_id, rel_url, abs_path, city
        )
    except ValueError as exc:
        detail = str(exc)
        if detail == "任务不存在":
            raise HTTPException(status_code=404, detail=detail) from exc
        raise HTTPException(status_code=409, detail=detail) from exc
    except RuntimeError as exc:  # 配置类错误，如未设置 API Key
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"更换照片失败：{exc}") from exc
    return AnalyzeAccepted(**result)


@router.get("/confirm/{task_id}", response_model=ConfirmInfoOut)
def get_confirm_info(task_id: int) -> ConfirmInfoOut:
    """取待确认的识别地点详情（供确认卡预填）。

    仅 awaiting_confirm 状态可查；其他状态返回 409，避免前端在错误状态下渲染确认卡。
    """
    try:
        info = evaluation_service.get_confirm_info(task_id)
    except ValueError as exc:  # 状态不符
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if info is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    return ConfirmInfoOut(**info)


@router.post("/confirm/{task_id}", response_model=ConfirmLocationResult)
def confirm_location(
    task_id: int, req: ConfirmLocationRequest
) -> ConfirmLocationResult:
    """确认地点并继续点评：立即返回，后续在后台跑。

    用户改写地点时，归一化（一次带联网的 LLM 调用）也放在后台 —— 否则确认卡会
    冻住数秒。前端拿到响应即可切回时间线。归一化失败不会让点评失败：任务退回
    待确认态并在 stage_detail.confirm_error 带上原因，用户可重输或换图。

    「重新上传照片」走 POST /analyze/confirm/{id}/image，在同一个 task 上换图。
    """
    try:
        result = evaluation_service.confirm_location(task_id, req.street)
    except ValueError as exc:
        # 任务不存在与状态不符都抛 ValueError，按文案区分状态码
        detail = str(exc)
        if detail == "任务不存在":
            raise HTTPException(status_code=404, detail=detail) from exc
        raise HTTPException(status_code=409, detail=detail) from exc
    except RuntimeError as exc:  # 配置类错误，如未设置 API Key
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"确认失败：{exc}") from exc
    return ConfirmLocationResult(**result)


@router.get("/history", response_model=list[HistoryItemOut])
def list_history(limit: int = Query(50, ge=1, le=200)) -> list[HistoryItemOut]:
    """历史记录列表：已完成评价的概要，按时间倒序。"""
    rows = evaluation_service.list_history(limit=limit)
    return [HistoryItemOut(**r) for r in rows]


@router.get("/result/{evaluation_id}", response_model=EvaluationResult)
def get_result(evaluation_id: int) -> EvaluationResult:
    """查询评价结果。"""
    result = evaluation_service.get_result(evaluation_id)
    if result is None:
        raise HTTPException(status_code=404, detail="评价记录不存在")
    return EvaluationResult(**result)


@router.post("/results/batch-delete")
def batch_delete_results(req: BatchDeleteRequest) -> dict[str, int]:
    """批量物理删除评价，返回成功删除的条数。"""
    deleted = evaluation_service.delete_evaluations(req.evaluation_ids)
    return {"deleted": deleted}


@router.delete("/result/{evaluation_id}")
def delete_result(evaluation_id: int) -> dict[str, str]:
    """物理删除一条评价及其关联数据（明细/维度分/AI任务）。"""
    ok = evaluation_service.delete_evaluation(evaluation_id)
    if not ok:
        raise HTTPException(status_code=404, detail="评价记录不存在")
    return {"status": "deleted"}
