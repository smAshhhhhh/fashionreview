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


@router.post("/image", response_model=AnalyzeAccepted)
async def analyze_image(
    file: UploadFile = File(...),
    city: str | None = Form(None),
) -> AnalyzeAccepted:
    """上传街景照片发起分析：校验 → 落盘 → 异步识别评分，立即返回 task_id。"""
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

    rel_url = f"/static/uploads/{fname}"  # 对外仅暴露相对路径，不带 host
    try:
        result = evaluation_service.submit_image_analysis(
            rel_url, str(abs_path), city
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"提交失败：{exc}") from exc
    return AnalyzeAccepted(**result)


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
