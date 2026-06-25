"""数据库初始化脚本。

流程：
1. 连接 MySQL 服务器，创建数据库 fashion_review（utf8mb4）
2. 执行 docs/schema.sql 建表
3. 执行 docs/seed.sql 灌入评分模板（5 一级 / 25 二级 / 75 三级）

用法（在 backend 目录下，已配置好 .env）：
    python -m app.db.init_db          # 库已存在时报错退出，避免误覆盖
    python -m app.db.init_db --force  # 先 DROP 再重建（会清空数据）
"""

import argparse
import sys
from pathlib import Path

import pymysql

from app.core.config import get_settings
from app.db.session import get_server_connection

# SQL 文件与本脚本同目录。按列表顺序依次执行（schema_ai 的外键依赖 schema 的 street 表，故在其后）。
SQL_DIR = Path(__file__).resolve().parent
SCHEMA_FILES = [
    SQL_DIR / "schema.sql",
    SQL_DIR / "schema_ai.sql",
]
SEED_FILE = SQL_DIR / "seed.sql"


def split_sql_statements(sql: str) -> list[str]:
    """按分号切分 SQL，忽略单引号字符串内与 `--` 行注释内的分号。"""
    statements: list[str] = []
    buf: list[str] = []
    in_string = False
    in_line_comment = False
    i = 0
    n = len(sql)
    while i < n:
        ch = sql[i]

        if in_line_comment:
            buf.append(ch)
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue

        if in_string:
            buf.append(ch)
            # 处理转义的单引号 '' （SQL 标准转义）
            if ch == "'":
                if i + 1 < n and sql[i + 1] == "'":
                    buf.append(sql[i + 1])
                    i += 2
                    continue
                in_string = False
            i += 1
            continue

        # 非字符串、非注释状态
        if ch == "-" and i + 1 < n and sql[i + 1] == "-":
            in_line_comment = True
            buf.append(ch)
            i += 1
            continue
        if ch == "'":
            in_string = True
            buf.append(ch)
            i += 1
            continue
        if ch == ";":
            stmt = "".join(buf).strip()
            if stmt:
                statements.append(stmt)
            buf = []
            i += 1
            continue

        buf.append(ch)
        i += 1

    tail = "".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements


def _strip_comment_only(statement: str) -> str:
    """去掉纯注释行，判断语句是否实际可执行。"""
    lines = [ln for ln in statement.splitlines() if not ln.strip().startswith("--")]
    return "\n".join(lines).strip()


def execute_sql_file(cursor: pymysql.cursors.Cursor, path: Path) -> int:
    """执行一个 SQL 文件，返回实际执行的语句数。"""
    if not path.exists():
        raise FileNotFoundError(f"SQL 文件不存在：{path}")
    sql = path.read_text(encoding="utf-8")
    count = 0
    for statement in split_sql_statements(sql):
        if not _strip_comment_only(statement):
            continue
        cursor.execute(statement)
        count += 1
    return count


def database_exists(cursor: pymysql.cursors.Cursor, db_name: str) -> bool:
    cursor.execute(
        "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = %s",
        (db_name,),
    )
    return cursor.fetchone() is not None


def init_db(force: bool = False) -> None:
    settings = get_settings()
    db_name = settings.db_name

    conn = get_server_connection()
    try:
        with conn.cursor() as cursor:
            exists = database_exists(cursor, db_name)
            if exists and not force:
                print(
                    f"数据库 `{db_name}` 已存在。如需重建请加 --force（会清空现有数据）。"
                )
                sys.exit(1)

            if exists and force:
                print(f"DROP DATABASE `{db_name}` ...")
                cursor.execute(f"DROP DATABASE `{db_name}`")

            print(f"CREATE DATABASE `{db_name}` ...")
            cursor.execute(
                f"CREATE DATABASE `{db_name}` "
                f"CHARACTER SET {settings.db_charset} COLLATE {settings.db_charset}_unicode_ci"
            )
            cursor.execute(f"USE `{db_name}`")

            for schema_file in SCHEMA_FILES:
                print(f"执行 schema：{schema_file.name}")
                n_schema = execute_sql_file(cursor, schema_file)
                print(f"  建表语句 {n_schema} 条")

            print(f"执行 seed：{SEED_FILE.name}")
            n_seed = execute_sql_file(cursor, SEED_FILE)
            print(f"  数据语句 {n_seed} 条")

        conn.commit()
        print(f"数据库 `{db_name}` 初始化完成。")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="初始化 fashion_review 数据库")
    parser.add_argument(
        "--force",
        action="store_true",
        help="若数据库已存在则先删除再重建（会清空数据）",
    )
    args = parser.parse_args()
    init_db(force=args.force)


if __name__ == "__main__":
    main()
