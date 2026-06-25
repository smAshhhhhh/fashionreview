"""进度服务：用独立短连接更新任务进度，与主流程事务解耦。

进度节点（计数式并发评分）：
  识别 10 → 画像 20 → 评分中 20+N*13（N 为已完成维度数，5 维共 ~65）→ 报告 95 → 完成 100
"""

from __future__ import annotations

from app.db import repository as repo
from app.db.session import connection_scope

# 固定阶段进度
STAGE_RECOGNIZE = ("recognize", 10, "正在识别街巷")
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
) -> None:
    """更新任务进度。独立连接独立提交，失败静默（进度更新不应影响主流程）。"""
    try:
        with connection_scope() as conn:
            repo.update_ai_task(
                conn,
                task_id,
                progress=progress,
                current_stage=stage,
                stage_message=message,
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
