"""任务进度 API。

- GET /task/{task_id}          普通轮询查询当前进度（前端用 setInterval 也可）
- GET /task/{task_id}/progress SSE 实时推送进度，completed/failed 后关闭
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.db import repository as repo
from app.db.session import connection_scope
from app.schemas.evaluation import TaskProgressOut

router = APIRouter(prefix="/task", tags=["task"])

_TERMINAL = {"completed", "failed"}


def _load(task_id: int) -> dict | None:
    with connection_scope() as conn:
        return repo.get_task_progress(conn, task_id)


@router.get("/{task_id}", response_model=TaskProgressOut)
def get_task(task_id: int) -> TaskProgressOut:
    """查询任务当前进度（一次性）。"""
    row = _load(task_id)
    if row is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    return TaskProgressOut(**row)


@router.get("/{task_id}/progress")
async def progress_stream(task_id: int) -> EventSourceResponse:
    """SSE 进度流：每秒推一帧，终态后推最后一帧并关闭。"""

    async def event_generator():
        last_sent = None
        # 进度查询是阻塞 IO，放线程池避免阻塞事件循环
        while True:
            row = await asyncio.to_thread(_load, task_id)
            if row is None:
                yield {"event": "error", "data": json.dumps({"detail": "任务不存在"})}
                break

            payload = json.dumps(row, ensure_ascii=False, default=str)
            # 内容变化才推，减少冗余帧
            if payload != last_sent:
                yield {"event": "progress", "data": payload}
                last_sent = payload

            if row.get("status") in _TERMINAL:
                break
            await asyncio.sleep(1)

    return EventSourceResponse(event_generator())
