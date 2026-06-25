"""分析中心显示配置服务：查询 / 更新启用状态。

全局统一配置，控制分析结果页（/analytics）各内容区块是否展示。
"""

from __future__ import annotations

from typing import Any

from app.db import repository as repo
from app.db.session import connection_scope
import pymysql


def list_config() -> list[dict[str, Any]]:
    with connection_scope() as conn:
        return repo.list_display_config(conn)


def enabled_blocks(conn: pymysql.connections.Connection) -> set[str]:
    """启用中的区块 block_key 集合（供结果接口按配置过滤字段）。

    复用调用方已开启的连接，避免在结果查询事务外再开一条连接。
    """
    return {c["block_key"] for c in repo.list_display_config(conn) if c["enabled"] == 1}


def set_enabled(block_key: str, enabled: int) -> dict[str, Any] | None:
    """更新区块启用状态，返回更新后的整行；block_key 不存在时返回 None。"""
    with connection_scope() as conn:
        affected = repo.update_display_config_enabled(conn, block_key, enabled)
        if affected == 0:
            return None
        return repo.get_display_config(conn, block_key)
