"""Prompt 模板管理服务：查询 / 更新（带版本归档）/ 回滚。"""

from __future__ import annotations

from typing import Any

from app.db import repository as repo
from app.db.session import connection_scope


def list_templates() -> list[dict[str, Any]]:
    with connection_scope() as conn:
        return repo.list_prompt_templates(conn)


def get_template(template_id: int) -> dict[str, Any] | None:
    with connection_scope() as conn:
        return repo.get_prompt_template_by_id(conn, template_id)


def update_template(template_id: int, fields: dict[str, Any]) -> dict[str, Any] | None:
    """更新模板：先归档当前版本，再写入新内容并 version+1。"""
    change_note = fields.pop("change_note", None)
    # 去掉值为 None 的字段（仅更新显式传入的项）
    fields = {k: v for k, v in fields.items() if v is not None}

    with connection_scope() as conn:
        current = repo.get_prompt_template_by_id(conn, template_id)
        if not current:
            return None
        repo.archive_prompt_template(conn, current, change_note)
        repo.update_prompt_template(
            conn, template_id, fields, new_version=current["version"] + 1
        )
        return repo.get_prompt_template_by_id(conn, template_id)


def list_history(template_id: int) -> list[dict[str, Any]]:
    with connection_scope() as conn:
        return repo.list_prompt_template_history(conn, template_id)


def rollback(template_id: int, version: int) -> dict[str, Any] | None:
    """回滚到指定历史版本：把该版本内容写回主表，作为一次新版本（version+1）。"""
    with connection_scope() as conn:
        current = repo.get_prompt_template_by_id(conn, template_id)
        if not current:
            return None
        target = repo.get_prompt_template_history_version(conn, template_id, version)
        if not target:
            return None
        # 先归档当前版本，再用目标历史版本内容覆盖
        repo.archive_prompt_template(conn, current, f"回滚至 v{version}")
        repo.update_prompt_template(
            conn,
            template_id,
            {
                "name": target["name"],
                "system_prompt": target["system_prompt"],
                "user_template": target["user_template"],
                "model": target["model"],
                "temperature": target["temperature"],
            },
            new_version=current["version"] + 1,
        )
        return repo.get_prompt_template_by_id(conn, template_id)
