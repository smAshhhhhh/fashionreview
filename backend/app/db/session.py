"""MySQL 连接工具。

提供两类连接：
- 不指定库的服务器连接（用于 CREATE DATABASE）
- 指定库 fashion_review 的连接（用于建表 / 灌数据 / 业务查询）
"""

from contextlib import contextmanager
from collections.abc import Iterator

import pymysql

from app.core.config import get_settings


def get_server_connection() -> pymysql.connections.Connection:
    """连接到 MySQL 服务器，不选择具体数据库。"""
    settings = get_settings()
    return pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        charset=settings.db_charset,
        autocommit=False,
    )


def get_connection() -> pymysql.connections.Connection:
    """连接到 fashion_review 数据库。"""
    settings = get_settings()
    return pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name,
        charset=settings.db_charset,
        autocommit=False,
    )


@contextmanager
def connection_scope(database: bool = True) -> Iterator[pymysql.connections.Connection]:
    """连接上下文：正常提交、异常回滚、最终关闭。

    :param database: True 连接 fashion_review 库；False 仅连服务器。
    """
    conn = get_connection() if database else get_server_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
