"""进度服务：用独立短连接更新任务进度，与主流程事务解耦。

进度节点（计数式并发评分）：
  识别 10 →（照片点评额外经 等待确认地点 12 / 图片属性匹配 15）→ 画像 20
  → 评分中 20+N*13（N 为已完成维度数，5 维共 ~65）→ 报告 95 → 完成 100

注意两类写入的时机相反：STAGE_* 常量在工作「开始前」写（10 = 识别刚开始），
而评分的 update_progress 在每个维度「完成后」写（33 = 已完成 1 个）。前端若只按
progress 阈值反推节点状态必然错位一格，故评分阶段额外下发 stage_detail 结构化名单。
"""

from __future__ import annotations

from typing import Any

from app.db import repository as repo
from app.db.session import connection_scope

# 固定阶段进度
STAGE_RECOGNIZE = ("recognize", 10, "正在识别街巷")
# 照片点评的地点确认暂停点（仅「照片地点确认」开关开启时经过）。
# 12 落在识别(10)与图片属性匹配(15)之间，其后所有节点无需调整。
STAGE_AWAIT_CONFIRM = ("await_confirm", 12, "等待确认识别地点")
# 图片属性匹配：仅照片点评经过，落在识别(10)与画像(20)之间，
# 故 SCORE_BASE 与其后所有节点均无需调整
STAGE_MATCH_IMAGE = ("match_image", 15, "正在匹配人工标注图")
STAGE_PROFILE = ("profile", 20, "正在获取街巷画像")
STAGE_REPORT = ("report", 95, "正在生成评价报告")
STAGE_DONE = ("done", 100, "分析完成")

# 评分阶段：起点 20，5 个维度均分到 85（每完成一个 +13）
SCORE_BASE = 20
SCORE_STEP = 13


def update_progress(
    task_id: int,
    progress: int,
    stage: str,
    message: str,
    stage_detail: dict[str, Any] | None = None,
) -> None:
    """更新任务进度。独立连接独立提交，失败静默（进度更新不应影响主流程）。

    :param stage_detail: 阶段结构化明细。评分阶段传
        {"all": [维度名...], "done": [{"name", "ok"}...], "total": N}，
        其中 done 的顺序即真实完成顺序（并发下不等于 all 的顺序）。
    """
    try:
        with connection_scope() as conn:
            repo.update_ai_task(
                conn,
                task_id,
                progress=progress,
                current_stage=stage,
                stage_message=message,
                stage_detail=stage_detail,
            )
    except Exception:  # noqa: BLE001 - 进度写入失败不影响分析
        pass


def score_progress(done_count: int, total: int = 5) -> int:
    """根据已完成维度数计算评分阶段进度。"""
    return SCORE_BASE + min(done_count, total) * SCORE_STEP


def set_stage(task_id: int, stage_tuple: tuple[str, int, str]) -> None:
    """便捷方法：用预定义阶段常量更新。"""
    stage, progress, message = stage_tuple
    update_progress(task_id, progress, stage, message)
