"""街区类型服务：类型定义的查询 / 编辑。

各类型的维度权重由该类型分组下的指标模板承载（见 metric_template_service）。
"""

from __future__ import annotations

from typing import Any

from app.db import repository as repo
from app.db.session import connection_scope


def list_types() -> list[dict[str, Any]]:
    with connection_scope() as conn:
        return repo.list_street_types(conn)


def update_type(
    type_id: int, name: str, description: str | None
) -> dict[str, Any] | None:
    """更新类型名称 / 定义（定义也是 AI 匹配的判断依据）。不存在返回 None。"""
    with connection_scope() as conn:
        if not repo.update_street_type(conn, type_id, name, description):
            return None
        return repo.get_street_type(conn, type_id)
