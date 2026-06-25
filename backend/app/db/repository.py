"""数据访问层。

集中放置评价流程链所需的裸 SQL 读写，基于 session.connection_scope。
所有方法接收一个已开启的连接 conn（由 service 层控制事务边界），
便于把"建任务→打分→聚合→回写"放进同一个事务。
"""

from __future__ import annotations

import json
from typing import Any

import pymysql


# ──────────────────────────────────────────────
# 模板：维度树（一级 / 二级 / 三级指标）
# ──────────────────────────────────────────────

def fetch_metric_tree(
    conn: pymysql.connections.Connection, template_id: int | None = None
) -> list[dict[str, Any]]:
    """读取某模板的全部三级指标，连带其所属二级、一级的 id / name / weight。

    返回 75 行，每行包含指标本身与上层维度信息，供构造 Prompt 与聚合使用。

    :param template_id: 限定模板；None 时取当前启用模板（get_active_template_id）。
    """
    if template_id is None:
        template_id = get_active_template_id(conn)
    sql = """
        SELECT
            m.id            AS metric_id,
            m.code          AS metric_code,
            m.name          AS metric_name,
            m.metric_desc   AS metric_desc,
            m.weight        AS metric_weight,
            m.score_mode    AS score_mode,
            m.sort_no       AS metric_sort,
            s.id            AS sub_id,
            s.code          AS sub_code,
            s.name          AS sub_name,
            s.weight        AS sub_weight,
            s.sort_no       AS sub_sort,
            d.id            AS dim_id,
            d.code          AS dim_code,
            d.name          AS dim_name,
            d.weight        AS dim_weight,
            d.sort_no       AS dim_sort
        FROM fashion_metric m
        JOIN fashion_sub_dimension s ON m.sub_dimension_id = s.id
        JOIN fashion_dimension d     ON s.dimension_id = d.id
        WHERE m.template_id = %s
        ORDER BY d.sort_no, s.sort_no, m.sort_no
    """
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(sql, (template_id,))
        return cur.fetchall()


def fetch_dimension_name_map(
    conn: pymysql.connections.Connection,
) -> dict[str, dict[int, Any]]:
    """跨所有模板的 id→名称/父级全量映射，供结果接口还原历史评价的维度信息。

    历史评价的 metric_score 指向具体模板的维度行，切换/编辑模板不影响这些行，
    所以这里不按模板过滤，保证任意历史评价都能查到当时的维度名与父子关系。

    返回 {"dim": {dim_id: name}, "sub": {sub_id: name}, "sub_parent": {sub_id: dim_id}}。
    """
    dim_map: dict[int, str] = {}
    sub_map: dict[int, str] = {}
    sub_parent: dict[int, int] = {}
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute("SELECT id, name FROM fashion_dimension")
        for r in cur.fetchall():
            dim_map[r["id"]] = r["name"]
        cur.execute("SELECT id, name, dimension_id FROM fashion_sub_dimension")
        for r in cur.fetchall():
            sub_map[r["id"]] = r["name"]
            sub_parent[r["id"]] = r["dimension_id"]
    return {"dim": dim_map, "sub": sub_map, "sub_parent": sub_parent}


# ──────────────────────────────────────────────
# 指标体系模板（版本）
# ──────────────────────────────────────────────

def get_active_template_id(conn: pymysql.connections.Connection) -> int:
    """当前启用模板 id；异常情况下回退最小 id（保证总能取到一套维度树）。"""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM metric_template WHERE is_active = 1 "
            "ORDER BY id LIMIT 1"
        )
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute("SELECT id FROM metric_template ORDER BY id LIMIT 1")
        row = cur.fetchone()
        return row[0] if row else 1


def list_templates(conn: pymysql.connections.Connection) -> list[dict[str, Any]]:
    """模板列表，带各级维度计数与「是否被历史评价引用」。"""
    sql = """
        SELECT
            t.id, t.name, t.description, t.is_active, t.sort_no,
            (SELECT COUNT(*) FROM fashion_dimension d WHERE d.template_id = t.id)       AS dim_count,
            (SELECT COUNT(*) FROM fashion_sub_dimension s WHERE s.template_id = t.id)   AS sub_count,
            (SELECT COUNT(*) FROM fashion_metric m WHERE m.template_id = t.id)          AS metric_count,
            EXISTS(
                SELECT 1 FROM street_metric_score ms
                JOIN fashion_metric m ON ms.metric_id = m.id
                WHERE m.template_id = t.id
            ) AS in_use
        FROM metric_template t
        ORDER BY t.sort_no, t.id
    """
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(sql)
        rows = cur.fetchall()
    for r in rows:
        r["is_active"] = int(r["is_active"])
        r["in_use"] = int(r["in_use"])
    return rows


def get_template(
    conn: pymysql.connections.Connection, template_id: int
) -> dict[str, Any] | None:
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(
            "SELECT id, name, description, is_active, sort_no "
            "FROM metric_template WHERE id = %s",
            (template_id,),
        )
        row = cur.fetchone()
        if row:
            row["is_active"] = int(row["is_active"])
        return row


def template_in_use(conn: pymysql.connections.Connection, template_id: int) -> bool:
    """模板是否已被历史评价引用（任一三级指标出现在评分明细中）。"""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM street_metric_score ms "
            "JOIN fashion_metric m ON ms.metric_id = m.id "
            "WHERE m.template_id = %s LIMIT 1",
            (template_id,),
        )
        return cur.fetchone() is not None


def fetch_template_tree(
    conn: pymysql.connections.Connection, template_id: int
) -> list[dict[str, Any]]:
    """某模板完整维度树（含权重/说明/sort），供编辑页渲染。复用 fetch_metric_tree 字段。"""
    return fetch_metric_tree(conn, template_id)


def create_template(
    conn: pymysql.connections.Connection,
    name: str,
    description: str | None,
    sort_no: int = 0,
) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO metric_template (name, description, is_active, sort_no) "
            "VALUES (%s, %s, 0, %s)",
            (name, description, sort_no),
        )
        return cur.lastrowid


def update_template_meta(
    conn: pymysql.connections.Connection,
    template_id: int,
    name: str,
    description: str | None,
) -> int:
    with conn.cursor() as cur:
        return cur.execute(
            "UPDATE metric_template SET name = %s, description = %s WHERE id = %s",
            (name, description, template_id),
        )


def activate_template(conn: pymysql.connections.Connection, template_id: int) -> int:
    """启用指定模板：其余清零，目标置 1。返回目标受影响行数（0=模板不存在）。"""
    with conn.cursor() as cur:
        affected = cur.execute(
            "UPDATE metric_template SET is_active = 1 WHERE id = %s", (template_id,)
        )
        if affected:
            cur.execute(
                "UPDATE metric_template SET is_active = 0 WHERE id <> %s", (template_id,)
            )
        return affected


def delete_template(conn: pymysql.connections.Connection, template_id: int) -> None:
    """删除模板及其维度树（仅未被历史引用、且非启用模板时由 service 校验后调用）。"""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM fashion_metric WHERE template_id = %s", (template_id,))
        cur.execute("DELETE FROM fashion_sub_dimension WHERE template_id = %s", (template_id,))
        cur.execute("DELETE FROM fashion_dimension WHERE template_id = %s", (template_id,))
        cur.execute("DELETE FROM metric_template WHERE id = %s", (template_id,))


def clone_template_tree(
    conn: pymysql.connections.Connection, src_template_id: int, dst_template_id: int
) -> None:
    """把源模板的整棵维度树复制到目标模板（保持 code/name/weight/sort，重建父子关系）。"""
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        # 一级
        cur.execute(
            "SELECT id, code, name, weight, sort_no FROM fashion_dimension "
            "WHERE template_id = %s ORDER BY sort_no, id",
            (src_template_id,),
        )
        dims = cur.fetchall()
        dim_id_map: dict[int, int] = {}
        for d in dims:
            cur.execute(
                "INSERT INTO fashion_dimension (template_id, code, name, weight, sort_no) "
                "VALUES (%s, %s, %s, %s, %s)",
                (dst_template_id, d["code"], d["name"], d["weight"], d["sort_no"]),
            )
            dim_id_map[d["id"]] = cur.lastrowid

        # 二级
        cur.execute(
            "SELECT id, dimension_id, code, name, weight, sort_no FROM fashion_sub_dimension "
            "WHERE template_id = %s ORDER BY sort_no, id",
            (src_template_id,),
        )
        subs = cur.fetchall()
        sub_id_map: dict[int, int] = {}
        for s in subs:
            cur.execute(
                "INSERT INTO fashion_sub_dimension "
                "(template_id, dimension_id, code, name, weight, sort_no) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (
                    dst_template_id,
                    dim_id_map[s["dimension_id"]],
                    s["code"], s["name"], s["weight"], s["sort_no"],
                ),
            )
            sub_id_map[s["id"]] = cur.lastrowid

        # 三级
        cur.execute(
            "SELECT sub_dimension_id, code, name, metric_desc, weight, score_mode, "
            "data_source, ai_extract_rule, sort_no FROM fashion_metric "
            "WHERE template_id = %s ORDER BY sort_no, id",
            (src_template_id,),
        )
        metrics = cur.fetchall()
        for m in metrics:
            cur.execute(
                "INSERT INTO fashion_metric "
                "(template_id, sub_dimension_id, code, name, metric_desc, weight, "
                " score_mode, data_source, ai_extract_rule, sort_no) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    dst_template_id,
                    sub_id_map[m["sub_dimension_id"]],
                    m["code"], m["name"], m["metric_desc"], m["weight"],
                    m["score_mode"], m["data_source"], m["ai_extract_rule"], m["sort_no"],
                ),
            )


def update_dimension(
    conn: pymysql.connections.Connection,
    dim_id: int, template_id: int,
    name: str, weight: float,
) -> int:
    """更新一级维度内容（限定 template_id，避免越权改到别的模板）。"""
    with conn.cursor() as cur:
        return cur.execute(
            "UPDATE fashion_dimension SET name = %s, weight = %s "
            "WHERE id = %s AND template_id = %s",
            (name, weight, dim_id, template_id),
        )


def update_sub_dimension(
    conn: pymysql.connections.Connection,
    sub_id: int, template_id: int,
    name: str, weight: float,
) -> int:
    with conn.cursor() as cur:
        return cur.execute(
            "UPDATE fashion_sub_dimension SET name = %s, weight = %s "
            "WHERE id = %s AND template_id = %s",
            (name, weight, sub_id, template_id),
        )


def update_metric(
    conn: pymysql.connections.Connection,
    metric_id: int, template_id: int,
    name: str, metric_desc: str | None, weight: float,
) -> int:
    with conn.cursor() as cur:
        return cur.execute(
            "UPDATE fashion_metric SET name = %s, metric_desc = %s, weight = %s "
            "WHERE id = %s AND template_id = %s",
            (name, metric_desc, weight, metric_id, template_id),
        )


# ──────────────────────────────────────────────
# 街巷
# ──────────────────────────────────────────────

def find_street_by_name(
    conn: pymysql.connections.Connection, name: str
) -> dict[str, Any] | None:
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(
            "SELECT * FROM street WHERE street_name = %s LIMIT 1", (name,)
        )
        return cur.fetchone()


def create_street(
    conn: pymysql.connections.Connection,
    name: str,
    city: str | None = None,
    district: str | None = None,
) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO street (street_name, city, district) VALUES (%s, %s, %s)",
            (name, city, district),
        )
        return cur.lastrowid


def get_or_create_street(
    conn: pymysql.connections.Connection,
    name: str,
    city: str | None = None,
    district: str | None = None,
) -> int:
    row = find_street_by_name(conn, name)
    if row:
        return row["id"]
    return create_street(conn, name, city, district)


def get_street_profile(
    conn: pymysql.connections.Connection, street_id: int
) -> dict[str, Any] | None:
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(
            "SELECT * FROM street_profile WHERE street_id = %s LIMIT 1",
            (street_id,),
        )
        return cur.fetchone()


# ──────────────────────────────────────────────
# POI 事实层 / 画像聚合
# ──────────────────────────────────────────────

# street_poi 可写字段（id/street_id/create_time 由库或调用方管理，不在此列）
_POI_FIELDS = (
    "external_id", "source", "name", "address", "business_area",
    "longitude", "latitude", "category_l1", "category_l2", "cuisine",
    "rating", "review_count", "avg_price", "checkin_count",
    "is_chain", "has_promotion", "business_status", "image_url", "merge_source",
)


def list_pois_by_street(
    conn: pymysql.connections.Connection, street_id: int
) -> list[dict[str, Any]]:
    """取某街巷的全部 POI 明细（画像聚合的原料）。"""
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute("SELECT * FROM street_poi WHERE street_id = %s", (street_id,))
        return cur.fetchall()


def upsert_street_poi(
    conn: pymysql.connections.Connection, street_id: int, poi: dict[str, Any]
) -> int:
    """幂等写入一条 POI：按 (external_id, street_id) 去重，存在则更新否则插入。

    external_id 为空时不去重，直接插入（种子数据应保证带 external_id）。
    """
    values = {k: poi.get(k) for k in _POI_FIELDS}
    ext = values.get("external_id")
    with conn.cursor() as cur:
        existing_id = None
        if ext:
            cur.execute(
                "SELECT id FROM street_poi WHERE external_id = %s AND street_id = %s LIMIT 1",
                (ext, street_id),
            )
            row = cur.fetchone()
            existing_id = row[0] if row else None

        if existing_id is not None:
            sets = ", ".join(f"{k} = %s" for k in _POI_FIELDS)
            cur.execute(
                f"UPDATE street_poi SET {sets} WHERE id = %s",
                (*[values[k] for k in _POI_FIELDS], existing_id),
            )
            return existing_id

        cols = "street_id, " + ", ".join(_POI_FIELDS)
        placeholders = ", ".join(["%s"] * (len(_POI_FIELDS) + 1))
        cur.execute(
            f"INSERT INTO street_poi ({cols}) VALUES ({placeholders})",
            (street_id, *[values[k] for k in _POI_FIELDS]),
        )
        return cur.lastrowid


# street_profile 数值字段（profile_text 已删；extra_stats 单独处理）
_PROFILE_NUM_FIELDS = (
    "poi_count", "restaurant_count", "shopping_count",
    "restaurant_ratio", "shopping_ratio", "chain_count", "chain_ratio",
    "avg_rating", "high_rating_ratio", "avg_price",
    "total_reviews", "total_checkins",
)


def upsert_street_profile(
    conn: pymysql.connections.Connection, street_id: int, agg: dict[str, Any]
) -> None:
    """写入/更新街巷画像（命中 uk_profile_street 唯一键做 upsert）。

    agg 含数值字段 + extra_stats（dict，内部 json 序列化存 poi_summary/poi_highlights）。
    """
    extra = agg.get("extra_stats")
    extra_json = json.dumps(extra, ensure_ascii=False) if extra is not None else None

    cols = ["street_id", *_PROFILE_NUM_FIELDS, "extra_stats"]
    vals = [street_id, *[agg.get(k) for k in _PROFILE_NUM_FIELDS], extra_json]
    placeholders = ", ".join(["%s"] * len(cols))
    updates = ", ".join(f"{k} = VALUES({k})" for k in (*_PROFILE_NUM_FIELDS, "extra_stats"))
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO street_profile ({', '.join(cols)}) VALUES ({placeholders}) "
            f"ON DUPLICATE KEY UPDATE {updates}",
            vals,
        )


# ──────────────────────────────────────────────
# 评价任务（表头）
# ──────────────────────────────────────────────

def create_evaluation(
    conn: pymysql.connections.Connection,
    street_id: int,
    task_no: str | None,
    source: str = "ai",
    status: str = "analyzing",
) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO street_evaluation (street_id, task_no, source, status)
            VALUES (%s, %s, %s, %s)
            """,
            (street_id, task_no, source, status),
        )
        return cur.lastrowid


def finalize_evaluation(
    conn: pymysql.connections.Connection,
    evaluation_id: int,
    total_score: float,
    ai_summary: str | None,
    status: str = "completed",
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE street_evaluation
            SET total_score = %s, ai_summary = %s, status = %s
            WHERE id = %s
            """,
            (total_score, ai_summary, status, evaluation_id),
        )


def mark_evaluation_failed(
    conn: pymysql.connections.Connection, evaluation_id: int
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE street_evaluation SET status = 'failed' WHERE id = %s",
            (evaluation_id,),
        )


def get_evaluation(
    conn: pymysql.connections.Connection, evaluation_id: int
) -> dict[str, Any] | None:
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(
            "SELECT * FROM street_evaluation WHERE id = %s", (evaluation_id,)
        )
        return cur.fetchone()


def list_evaluations(
    conn: pymysql.connections.Connection,
    limit: int = 50,
    status: str = "completed",
) -> list[dict[str, Any]]:
    """历史评价列表：JOIN street 取街道名/城市/区，按创建时间倒序。

    默认仅返回已完成的评价，供历史记录页展示。
    """
    sql = """
        SELECT
            e.id            AS evaluation_id,
            e.total_score   AS total_score,
            e.status        AS status,
            e.ai_summary    AS ai_summary,
            e.create_time   AS create_time,
            s.street_name   AS street_name,
            s.city          AS city,
            s.district      AS district,
            t.image_url     AS image_url
        FROM street_evaluation e
        JOIN street s ON e.street_id = s.id
        LEFT JOIN ai_analysis_task t ON t.evaluation_id = e.id
        WHERE e.status = %s
        ORDER BY e.create_time DESC, e.id DESC
        LIMIT %s
    """
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(sql, (status, limit))
        return cur.fetchall()


def get_task_image_url(
    conn: pymysql.connections.Connection, evaluation_id: int
) -> str | None:
    """取该评价关联任务的上传图片相对路径（无图片 / 文字任务返回 None）。"""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT image_url FROM ai_analysis_task "
            "WHERE evaluation_id = %s AND image_url IS NOT NULL "
            "ORDER BY id DESC LIMIT 1",
            (evaluation_id,),
        )
        row = cur.fetchone()
        return row[0] if row else None



# ──────────────────────────────────────────────
# 指标评分明细
# ──────────────────────────────────────────────

def bulk_insert_metric_scores(
    conn: pymysql.connections.Connection,
    evaluation_id: int,
    rows: list[dict[str, Any]],
) -> None:
    """批量写入指标得分。rows: [{metric_id, score, score_reason, source_type}]"""
    if not rows:
        return
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO street_metric_score
                (evaluation_id, metric_id, score, score_reason, source_type)
            VALUES (%s, %s, %s, %s, %s)
            """,
            [
                (
                    evaluation_id,
                    r["metric_id"],
                    r["score"],
                    r.get("score_reason"),
                    r.get("source_type"),
                )
                for r in rows
            ],
        )


def fetch_metric_scores(
    conn: pymysql.connections.Connection, evaluation_id: int
) -> list[dict[str, Any]]:
    sql = """
        SELECT
            ms.metric_id, ms.score, ms.score_reason, ms.source_type,
            m.name AS metric_name, m.code AS metric_code,
            s.id AS sub_id, s.name AS sub_name,
            d.id AS dim_id, d.name AS dim_name
        FROM street_metric_score ms
        JOIN fashion_metric m ON ms.metric_id = m.id
        JOIN fashion_sub_dimension s ON m.sub_dimension_id = s.id
        JOIN fashion_dimension d ON s.dimension_id = d.id
        WHERE ms.evaluation_id = %s
        ORDER BY d.sort_no, s.sort_no, m.sort_no
    """
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(sql, (evaluation_id,))
        return cur.fetchall()


# ──────────────────────────────────────────────
# 维度聚合分缓存
# ──────────────────────────────────────────────

def bulk_insert_dimension_scores(
    conn: pymysql.connections.Connection,
    evaluation_id: int,
    rows: list[dict[str, Any]],
) -> None:
    """rows: [{dim_level, ref_id, score}]"""
    if not rows:
        return
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO street_dimension_score
                (evaluation_id, dim_level, ref_id, score)
            VALUES (%s, %s, %s, %s)
            """,
            [
                (evaluation_id, r["dim_level"], r["ref_id"], r["score"])
                for r in rows
            ],
        )


def fetch_dimension_scores(
    conn: pymysql.connections.Connection,
    evaluation_id: int,
    dim_level: int | None = None,
) -> list[dict[str, Any]]:
    sql = "SELECT * FROM street_dimension_score WHERE evaluation_id = %s"
    params: list[Any] = [evaluation_id]
    if dim_level is not None:
        sql += " AND dim_level = %s"
        params.append(dim_level)
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(sql, params)
        return cur.fetchall()


# ──────────────────────────────────────────────
# AI 任务 / 识别结果 / Prompt 日志
# ──────────────────────────────────────────────

def create_ai_task(
    conn: pymysql.connections.Connection,
    task_no: str | None,
    input_type: str,
    text_input: str | None = None,
    image_url: str | None = None,
    evaluation_id: int | None = None,
    status: str = "analyzing",
) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ai_analysis_task
                (task_no, input_type, text_input, image_url, evaluation_id, status)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (task_no, input_type, text_input, image_url, evaluation_id, status),
        )
        return cur.lastrowid


def update_ai_task(
    conn: pymysql.connections.Connection,
    task_id: int,
    evaluation_id: int | None = None,
    status: str | None = None,
    progress: int | None = None,
    current_stage: str | None = None,
    stage_message: str | None = None,
    error_message: str | None = None,
) -> None:
    sets: list[str] = []
    params: list[Any] = []
    if evaluation_id is not None:
        sets.append("evaluation_id = %s")
        params.append(evaluation_id)
    if status is not None:
        sets.append("status = %s")
        params.append(status)
    if progress is not None:
        sets.append("progress = %s")
        params.append(progress)
    if current_stage is not None:
        sets.append("current_stage = %s")
        params.append(current_stage)
    if stage_message is not None:
        sets.append("stage_message = %s")
        params.append(stage_message)
    if error_message is not None:
        sets.append("error_message = %s")
        params.append(error_message)
    if not sets:
        return
    params.append(task_id)
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE ai_analysis_task SET {', '.join(sets)} WHERE id = %s", params
        )


def get_task_progress(
    conn: pymysql.connections.Connection, task_id: int
) -> dict[str, Any] | None:
    """查询任务进度（轻量，供 SSE / 轮询使用）。"""
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(
            "SELECT id AS task_id, status, progress, current_stage, "
            "stage_message, evaluation_id, error_message, text_input "
            "FROM ai_analysis_task WHERE id = %s",
            (task_id,),
        )
        return cur.fetchone()


def create_ai_result(
    conn: pymysql.connections.Connection,
    task_id: int,
    recognized_street: str | None,
    recognized_city: str | None,
    confidence: float | None,
    matched_street_id: int | None,
    raw_response: str | None,
) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ai_analysis_result
                (task_id, recognized_street, recognized_city, confidence,
                 matched_street_id, raw_response)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                task_id,
                recognized_street,
                recognized_city,
                confidence,
                matched_street_id,
                raw_response,
            ),
        )
        return cur.lastrowid


def create_prompt_log(
    conn: pymysql.connections.Connection,
    task_id: int | None,
    stage: str,
    prompt_text: str,
    response_text: str,
    model_name: str,
    token_usage: int | None,
) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ai_prompt_log
                (task_id, stage, prompt_text, response_text, model_name, token_usage)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (task_id, stage, prompt_text, response_text, model_name, token_usage),
        )
        return cur.lastrowid


def get_ai_task(
    conn: pymysql.connections.Connection, task_id: int
) -> dict[str, Any] | None:
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute("SELECT * FROM ai_analysis_task WHERE id = %s", (task_id,))
        return cur.fetchone()


# ──────────────────────────────────────────────
# AI Prompt 模板（前端可配 + 版本控制）
# ──────────────────────────────────────────────

def get_prompt_template(
    conn: pymysql.connections.Connection,
    stage: str,
    dim_code: str | None = None,
) -> dict[str, Any] | None:
    """按 (stage, dim_code) 取启用中的模板。dim_code 为 None 时匹配 NULL 行。"""
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        if dim_code is None:
            cur.execute(
                "SELECT * FROM ai_prompt_template "
                "WHERE stage = %s AND dim_code IS NULL AND enabled = 1 LIMIT 1",
                (stage,),
            )
        else:
            cur.execute(
                "SELECT * FROM ai_prompt_template "
                "WHERE stage = %s AND dim_code = %s AND enabled = 1 LIMIT 1",
                (stage, dim_code),
            )
        return cur.fetchone()


def get_prompt_template_by_id(
    conn: pymysql.connections.Connection, template_id: int
) -> dict[str, Any] | None:
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute("SELECT * FROM ai_prompt_template WHERE id = %s", (template_id,))
        return cur.fetchone()


def list_prompt_templates(
    conn: pymysql.connections.Connection,
) -> list[dict[str, Any]]:
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(
            "SELECT * FROM ai_prompt_template "
            "ORDER BY FIELD(stage,'recognize','score','report'), dim_code"
        )
        return cur.fetchall()


def archive_prompt_template(
    conn: pymysql.connections.Connection,
    template: dict[str, Any],
    change_note: str | None,
) -> None:
    """把模板当前内容快照写入历史表。"""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ai_prompt_template_history
                (template_id, version, stage, dim_code, name,
                 system_prompt, user_template, model, temperature, change_note)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                template["id"],
                template["version"],
                template["stage"],
                template["dim_code"],
                template["name"],
                template["system_prompt"],
                template["user_template"],
                template["model"],
                template["temperature"],
                change_note,
            ),
        )


def update_prompt_template(
    conn: pymysql.connections.Connection,
    template_id: int,
    fields: dict[str, Any],
    new_version: int,
) -> None:
    """更新模板可编辑字段并设置新版本号。"""
    allowed = {"name", "system_prompt", "user_template", "model", "temperature", "enabled"}
    sets: list[str] = []
    params: list[Any] = []
    for key, val in fields.items():
        if key in allowed:
            sets.append(f"{key} = %s")
            params.append(val)
    sets.append("version = %s")
    params.append(new_version)
    params.append(template_id)
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE ai_prompt_template SET {', '.join(sets)} WHERE id = %s", params
        )


def list_prompt_template_history(
    conn: pymysql.connections.Connection, template_id: int
) -> list[dict[str, Any]]:
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(
            "SELECT * FROM ai_prompt_template_history "
            "WHERE template_id = %s ORDER BY version DESC",
            (template_id,),
        )
        return cur.fetchall()


def get_prompt_template_history_version(
    conn: pymysql.connections.Connection, template_id: int, version: int
) -> dict[str, Any] | None:
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(
            "SELECT * FROM ai_prompt_template_history "
            "WHERE template_id = %s AND version = %s LIMIT 1",
            (template_id, version),
        )
        return cur.fetchone()


# ──────────────────────────────────────────────
# 分析中心显示配置（前端可配）
# ──────────────────────────────────────────────

def list_display_config(
    conn: pymysql.connections.Connection,
) -> list[dict[str, Any]]:
    """全部显示区块配置，按分组与组内排序返回。"""
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(
            "SELECT * FROM analytics_display_config "
            "ORDER BY FIELD(block_group,'overview','visual','detail','report'), "
            "sort_no, id"
        )
        return cur.fetchall()


def get_display_config(
    conn: pymysql.connections.Connection, block_key: str
) -> dict[str, Any] | None:
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(
            "SELECT * FROM analytics_display_config WHERE block_key = %s",
            (block_key,),
        )
        return cur.fetchone()


def update_display_config_enabled(
    conn: pymysql.connections.Connection, block_key: str, enabled: int
) -> int:
    """更新某区块的启用状态，返回受影响行数（0 表示 block_key 不存在）。"""
    with conn.cursor() as cur:
        return cur.execute(
            "UPDATE analytics_display_config SET enabled = %s WHERE block_key = %s",
            (enabled, block_key),
        )

