"""街巷画像服务（薄服务层）。

职责：
- 从 street_poi 取事实层明细；
- 调 profile_builder 子模块生成 street_profile payload；
- 写入 street_profile；
- 为资源中心提供异步画像生成任务状态。

具体统计逻辑不要堆在本文件，避免 service 膨胀；新增数据源时优先扩展
app/services/profile_builder/ 下的统计模块。
"""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from app.db import repository as repo
from app.db.session import connection_scope
from app.services.profile_builder import build_profile

_profile_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="profile")
_profile_jobs: dict[str, dict[str, Any]] = {}


def rebuild_profile(conn, street_id: int) -> dict[str, Any] | None:
    """同步重算并 upsert 画像。该街巷无 POI 时返回 None（不写空画像）。"""
    pois = repo.list_pois_by_street(conn, street_id)
    if not pois:
        return None
    agg = build_profile(pois)
    repo.upsert_street_profile(conn, street_id, agg)
    return repo.get_street_profile(conn, street_id)


def get_or_build_profile(conn, street_id: int) -> dict[str, Any] | None:
    """点评链路按需取画像：有缓存直接用，无则同步兜底构建。"""
    prof = repo.get_street_profile(conn, street_id)
    if prof and prof.get("extra_stats"):
        return prof
    return rebuild_profile(conn, street_id)


def start_rebuild_profile_job(street_id: int) -> str:
    """异步触发画像生成，立即返回 job_id。资源中心页面轮询状态。"""
    job_id = uuid.uuid4().hex
    _profile_jobs[job_id] = {"job_id": job_id, "street_id": street_id, "status": "running", "error": None}
    _profile_executor.submit(_run_rebuild_job, job_id, street_id)
    return job_id


def get_profile_job(job_id: str) -> dict[str, Any] | None:
    """查询画像生成任务状态。"""
    return _profile_jobs.get(job_id)


def _run_rebuild_job(job_id: str, street_id: int) -> None:
    try:
        with connection_scope() as conn:
            prof = rebuild_profile(conn, street_id)
        if prof is None:
            _profile_jobs[job_id].update({"status": "failed", "error": "该街区暂无 POI 事实数据"})
        else:
            _profile_jobs[job_id].update({"status": "completed", "error": None})
    except Exception as exc:  # noqa: BLE001
        _profile_jobs[job_id].update({"status": "failed", "error": str(exc)})
