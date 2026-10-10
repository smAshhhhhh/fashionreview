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

    返回 {"dim": {dim_id: name}, "sub": {sub_id: name}, "sub_parent": {sub_id: dim_id},
          "dim_weight": {dim_id: weight}, "sub_weight": {sub_id: weight}}。
    """
    dim_map: dict[int, str] = {}
    sub_map: dict[int, str] = {}
    sub_parent: dict[int, int] = {}
    dim_weight: dict[int, float] = {}
    sub_weight: dict[int, float] = {}
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute("SELECT id, name, weight FROM fashion_dimension")
        for r in cur.fetchall():
            dim_map[r["id"]] = r["name"]
            dim_weight[r["id"]] = float(r["weight"]) if r["weight"] is not None else None
        cur.execute("SELECT id, name, weight, dimension_id FROM fashion_sub_dimension")
        for r in cur.fetchall():
            sub_map[r["id"]] = r["name"]
            sub_parent[r["id"]] = r["dimension_id"]
            sub_weight[r["id"]] = float(r["weight"]) if r["weight"] is not None else None
    return {
        "dim": dim_map,
        "sub": sub_map,
        "sub_parent": sub_parent,
        "dim_weight": dim_weight,
        "sub_weight": sub_weight,
    }


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


def get_street_by_id(
    conn: pymysql.connections.Connection, street_id: int
) -> dict[str, Any] | None:
    """按 id 取街巷档案。"""
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute("SELECT * FROM street WHERE id = %s LIMIT 1", (street_id,))
        return cur.fetchone()


def list_resource_streets(conn: pymysql.connections.Connection) -> list[dict[str, Any]]:
    """资源中心街区列表：带事实层与画像层统计。"""
    sql = """
        SELECT
            s.id AS street_id,
            s.street_name,
            s.city,
            s.district,
            COUNT(p.id) AS poi_total,
            SUM(CASE WHEN p.source = 'amap' THEN 1 ELSE 0 END) AS amap_count,
            SUM(CASE WHEN p.source = 'dianping' THEN 1 ELSE 0 END) AS dianping_count,
            sp.id IS NOT NULL AS has_profile,
            sp.update_time AS profile_update_time
        FROM street s
        LEFT JOIN street_poi p ON p.street_id = s.id
        LEFT JOIN street_profile sp ON sp.street_id = s.id
        GROUP BY s.id, s.street_name, s.city, s.district, sp.id, sp.update_time
        HAVING poi_total > 0 OR has_profile = 1
        ORDER BY s.city, s.street_name
    """
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(sql)
        rows = cur.fetchall()
    for r in rows:
        r["poi_total"] = int(r.get("poi_total") or 0)
        r["amap_count"] = int(r.get("amap_count") or 0)
        r["dianping_count"] = int(r.get("dianping_count") or 0)
        r["has_profile"] = int(r.get("has_profile") or 0)
    return rows


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


def list_pois(
    conn: pymysql.connections.Connection,
    *,
    street_id: int | None = None,
    source: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    """资源中心 POI 明细分页。"""
    where: list[str] = []
    params: list[Any] = []
    if street_id is not None:
        where.append("p.street_id = %s")
        params.append(street_id)
    if source and source != "all":
        where.append("p.source = %s")
        params.append(source)
    where_sql = "WHERE " + " AND ".join(where) if where else ""
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(f"SELECT COUNT(*) AS c FROM street_poi p {where_sql}", params)
        total = int(cur.fetchone()["c"])
        cur.execute(
            f"""
            SELECT p.*, s.street_name, s.city, s.district
            FROM street_poi p
            LEFT JOIN street s ON s.id = p.street_id
            {where_sql}
            ORDER BY p.id DESC
            LIMIT %s OFFSET %s
            """,
            (*params, limit, offset),
        )
        rows = cur.fetchall()
    return {"total": total, "items": rows}


def delete_pois_by_street(
    conn: pymysql.connections.Connection, street_id: int, source: str | None = None
) -> int:
    """删除某街区某来源的 POI；source 为 None/all 时删除该街全部 POI。"""
    with conn.cursor() as cur:
        if source and source != "all":
            return cur.execute(
                "DELETE FROM street_poi WHERE street_id = %s AND source = %s",
                (street_id, source),
            )
        return cur.execute("DELETE FROM street_poi WHERE street_id = %s", (street_id,))


def street_poi_exists(
    conn: pymysql.connections.Connection, street_id: int, external_id: str | None
) -> bool:
    """按 (external_id, street_id) 判断 POI 是否已存在；external_id 为空视为不存在。"""
    if not external_id:
        return False
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM street_poi WHERE external_id = %s AND street_id = %s LIMIT 1",
            (external_id, street_id),
        )
        return cur.fetchone() is not None


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
            t.image_url     AS image_url,
            t.input_type    AS input_type
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


def delete_evaluation(
    conn: pymysql.connections.Connection, evaluation_id: int
) -> int:
    """物理删除一条评价及其全部关联数据。返回删除的 street_evaluation 行数(0=不存在)。

    级联关系(见 schema)：
    - street_metric_score / street_dimension_score → eval 有 ON DELETE CASCADE，
      删 street_evaluation 时自动清除(metric_score 的 evidence 子表再级联)。
    - ai_analysis_task.evaluation_id 无外键约束，需手动删；其 ai_analysis_result
      有 ON DELETE CASCADE 随 task 删，ai_prompt_log.task_id 无外键需按 task 手删。
    """
    with conn.cursor() as cur:
        # 先取该评价关联的任务，删其 prompt 日志（无外键不会自动级联）
        cur.execute(
            "SELECT id FROM ai_analysis_task WHERE evaluation_id = %s",
            (evaluation_id,),
        )
        task_ids = [row[0] for row in cur.fetchall()]
        for tid in task_ids:
            cur.execute("DELETE FROM ai_prompt_log WHERE task_id = %s", (tid,))
        # 删任务（ai_analysis_result 随 task ON DELETE CASCADE）
        cur.execute(
            "DELETE FROM ai_analysis_task WHERE evaluation_id = %s", (evaluation_id,)
        )
        # 删评价主表（metric_score / dimension_score 随 eval ON DELETE CASCADE）
        return cur.execute(
            "DELETE FROM street_evaluation WHERE id = %s", (evaluation_id,)
        )


def delete_evaluations(
    conn: pymysql.connections.Connection, evaluation_ids: list[int]
) -> int:
    """批量物理删除评价。返回成功删除的 street_evaluation 行数。

    复用单条 delete_evaluation 的级联逻辑，逐条删（同一事务，整体提交/回滚）。
    """
    deleted = 0
    for eid in evaluation_ids:
        deleted += delete_evaluation(conn, eid)
    return deleted


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
            m.name AS metric_name, m.code AS metric_code, m.weight AS metric_weight,
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
    stage_detail: dict[str, Any] | None = None,
    error_message: str | None = None,
    image_url: str | None = None,
) -> None:
    sets: list[str] = []
    params: list[Any] = []
    if image_url is not None:
        # 「换图重识别」会在同一个 task 上替换图片地址
        sets.append("image_url = %s")
        params.append(image_url)
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
    if stage_detail is not None:
        sets.append("stage_detail = %s")
        params.append(json.dumps(stage_detail, ensure_ascii=False))
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


def _parse_stage_detail(raw: Any) -> dict[str, Any] | None:
    """stage_detail 可能是 dict（驱动已解码 JSON 列）或 str，统一成 dict。

    必须在此收口：SSE 端点对本函数返回的裸 dict 直接 json.dumps（api/v1/task.py），
    而轮询端点走 pydantic —— 若把 str 原样传出，SSE 会双重编码成字符串，
    前端只在 SSE 路径拿到字符串而在轮询路径拿到对象。
    """
    if raw is None or isinstance(raw, dict):
        return raw
    if isinstance(raw, (str, bytes)):
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError):
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def get_task_progress(
    conn: pymysql.connections.Connection, task_id: int
) -> dict[str, Any] | None:
    """查询任务进度（轻量，供 SSE / 轮询使用）。"""
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(
            "SELECT id AS task_id, status, progress, current_stage, "
            "stage_message, stage_detail, evaluation_id, error_message, text_input "
            "FROM ai_analysis_task WHERE id = %s",
            (task_id,),
        )
        row = cur.fetchone()
    if row is not None:
        row["stage_detail"] = _parse_stage_detail(row.get("stage_detail"))
    return row


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


def set_task_awaiting_confirm(
    conn: pymysql.connections.Connection, task_id: int
) -> bool:
    """把任务置为「等待确认地点」，仅当它仍是 analyzing 时生效。

    条件更新而非无条件写：取消请求可能恰好落在识别阶段最后一次 check_cancel
    之后：那时 DB 已被 request_cancel 改成 cancelled，无条件写会把它复活成待确认
    态，用户就会看到一个已取消任务的确认卡。

    :return: True 已置为待确认；False 任务已不是 analyzing（已取消/失败）
    """
    with conn.cursor() as cur:
        affected = cur.execute(
            "UPDATE ai_analysis_task SET status = 'awaiting_confirm' "
            "WHERE id = %s AND status = 'analyzing'",
            (task_id,),
        )
    return affected > 0


def delete_ai_results_by_task(
    conn: pymysql.connections.Connection, task_id: int
) -> int:
    """删除某任务的识别结果行，返回删除条数。

    用于「换图重识别」：旧识别结果是针对旧照片的，换图后它既不该被确认接口预填，
    也不该被 _run_scoring_phase 当成「已有结果」而走回填分支。删掉比留着更干净 ——
    留着会让 get_ai_result_by_task 的 ORDER BY id DESC 成为唯一正确性依赖。
    """
    with conn.cursor() as cur:
        return cur.execute(
            "DELETE FROM ai_analysis_result WHERE task_id = %s", (task_id,)
        )


def get_ai_result_by_task(
    conn: pymysql.connections.Connection, task_id: int
) -> dict[str, Any] | None:
    """取某任务的识别结果（最新一条）。

    照片确认流程中，第一段（识别）与第二段（评分）分属两次后台执行，识别结果
    靠这张表传递；本函数也是 _run_scoring_phase 判断「该插入还是该回填」的依据。
    """
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(
            "SELECT * FROM ai_analysis_result WHERE task_id = %s "
            "ORDER BY id DESC LIMIT 1",
            (task_id,),
        )
        return cur.fetchone()


def update_ai_result_street(
    conn: pymysql.connections.Connection,
    task_id: int,
    *,
    street_id: int,
    recognized_street: str | None = None,
    recognized_city: str | None = None,
) -> None:
    """回填识别结果最终采用的 street_id（可同时覆盖地点名）。

    确认流程里第一段先落识别结果、matched_street_id 留空；用户确认（可能改写了
    地点）后由第二段建 street 并回填。覆盖地点名是必要的 —— 否则表里留着 AI 的
    原始猜测，与实际评分的街区不一致，追溯时会误导。
    """
    sets = ["matched_street_id = %s"]
    params: list[Any] = [street_id]
    if recognized_street is not None:
        sets.append("recognized_street = %s")
        params.append(recognized_street)
    if recognized_city is not None:
        sets.append("recognized_city = %s")
        params.append(recognized_city)
    params.append(task_id)
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE ai_analysis_result SET {', '.join(sets)} WHERE task_id = %s",
            params,
        )


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


# ──────────────────────────────────────────────
# 人工标注库（图片属性匹配）
# ──────────────────────────────────────────────

def upsert_annotation_image(
    conn: pymysql.connections.Connection,
    *,
    file_name: str,
    image_url: str,
    row_no: int | None = None,
) -> tuple[int, bool]:
    """按 file_name 幂等写入标注图，返回 (annotation_id, existed)。

    重复导入同一份 xlsx 时**保留已算好的 embedding**（图片字节未变就不必重算），
    故 UPDATE 不触碰 embedding 相关列。
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM annotation_image WHERE file_name = %s LIMIT 1",
            (file_name,),
        )
        row = cur.fetchone()
        if row:
            annotation_id = row[0]
            cur.execute(
                "UPDATE annotation_image SET image_url = %s, row_no = %s WHERE id = %s",
                (image_url, row_no, annotation_id),
            )
            return annotation_id, True
        cur.execute(
            "INSERT INTO annotation_image (file_name, image_url, row_no) "
            "VALUES (%s, %s, %s)",
            (file_name, image_url, row_no),
        )
        return cur.lastrowid, False


def replace_annotation_attributes(
    conn: pymysql.connections.Connection,
    annotation_id: int,
    attributes: list[dict[str, Any]],
) -> int:
    """整体替换某标注图的属性（先删后插），返回写入条数。

    属性是「一图一组」的整体，逐条 upsert 无从判断哪条被删了；先删后插最简单也
    最不容易留下脏数据。调用方在同一事务内使用。
    """
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM annotation_attribute WHERE annotation_id = %s",
            (annotation_id,),
        )
        if not attributes:
            return 0
        cur.executemany(
            """
            INSERT INTO annotation_attribute
                (annotation_id, attr_index, raw_text, metric_name, grade_word)
            VALUES (%s, %s, %s, %s, %s)
            """,
            [
                (
                    annotation_id,
                    a["attr_index"],
                    a["raw_text"],
                    a.get("metric_name"),
                    a.get("grade_word"),
                )
                for a in attributes
            ],
        )
        return len(attributes)


def update_annotation_embedding(
    conn: pymysql.connections.Connection,
    annotation_id: int,
    vector: list[float],
    model: str,
    dim: int,
) -> None:
    """写入标注图的向量（已归一化的单位向量）。"""
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE annotation_image "
            "SET embedding = %s, embedding_model = %s, embedding_dim = %s, "
            "    embedded_time = NOW() "
            "WHERE id = %s",
            (json.dumps(vector), model, dim, annotation_id),
        )


def _parse_vector(raw: Any) -> list[float]:
    """embedding 列可能是 list（驱动已解码 JSON）或 str，统一成 list[float]。"""
    if isinstance(raw, list):
        return [float(v) for v in raw]
    if isinstance(raw, (str, bytes)):
        try:
            data = json.loads(raw)
        except (TypeError, ValueError):
            return []
        if isinstance(data, list):
            return [float(v) for v in data]
    return []


def list_annotation_embeddings(
    conn: pymysql.connections.Connection, *, model: str, dim: int
) -> list[dict[str, Any]]:
    """取可用于匹配的标注图向量。

    只返回 embedding_model / embedding_dim 与当前配置一致的行 —— 换过模型的旧向量
    属于另一个语义空间，混比会静默算出无意义的相似度。
    """
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(
            "SELECT id, file_name, image_url, embedding FROM annotation_image "
            "WHERE enabled = 1 AND embedding IS NOT NULL "
            "  AND embedding_model = %s AND embedding_dim = %s "
            "ORDER BY id",
            (model, dim),
        )
        rows = cur.fetchall()
    out: list[dict[str, Any]] = []
    for r in rows:
        r["embedding"] = _parse_vector(r.get("embedding"))
        if r["embedding"]:
            out.append(r)
    return out


def list_annotations(
    conn: pymysql.connections.Connection,
    *,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    """标注图分页列表，每项带其属性。供资源中心页面展示。"""
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute("SELECT COUNT(*) AS c FROM annotation_image")
        total = (cur.fetchone() or {}).get("c", 0)
        cur.execute(
            "SELECT id, file_name, image_url, row_no, enabled, "
            "       embedding_model, embedding_dim, embedded_time, "
            "       (embedding IS NOT NULL) AS has_embedding "
            "FROM annotation_image ORDER BY row_no, id LIMIT %s OFFSET %s",
            (limit, offset),
        )
        items = cur.fetchall()
        if items:
            ids = [i["id"] for i in items]
            placeholders = ", ".join(["%s"] * len(ids))
            cur.execute(
                "SELECT annotation_id, attr_index, raw_text, metric_name, grade_word "
                f"FROM annotation_attribute WHERE annotation_id IN ({placeholders}) "
                "ORDER BY annotation_id, attr_index",
                tuple(ids),
            )
            by_ann: dict[int, list[dict[str, Any]]] = {}
            for a in cur.fetchall():
                by_ann.setdefault(a["annotation_id"], []).append(a)
            for i in items:
                i["attributes"] = by_ann.get(i["id"], [])
    return {"total": total, "items": items}


def count_annotations(conn: pymysql.connections.Connection) -> dict[str, int]:
    """标注库概览计数：图片数 / 属性数 / 已生成向量数。"""
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(
            "SELECT COUNT(*) AS image_count, "
            "       SUM(embedding IS NOT NULL) AS embedded_count "
            "FROM annotation_image"
        )
        row = cur.fetchone() or {}
        cur.execute("SELECT COUNT(*) AS attr_count FROM annotation_attribute")
        attr = cur.fetchone() or {}
    return {
        "image_count": int(row.get("image_count") or 0),
        "embedded_count": int(row.get("embedded_count") or 0),
        "attr_count": int(attr.get("attr_count") or 0),
    }


def list_annotation_ids_without_embedding(
    conn: pymysql.connections.Connection, *, model: str, dim: int
) -> list[int]:
    """待算向量的标注图 id：无向量、或向量产自别的模型 / 别的维度。"""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM annotation_image "
            "WHERE embedding IS NULL OR embedding_model <> %s OR embedding_dim <> %s "
            "ORDER BY id",
            (model, dim),
        )
        return [r[0] for r in cur.fetchall()]


def list_all_annotation_ids(conn: pymysql.connections.Connection) -> list[int]:
    """全部标注图 id（强制重算向量时用）。"""
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM annotation_image ORDER BY id")
        return [r[0] for r in cur.fetchall()]


def get_annotation_image_url(
    conn: pymysql.connections.Connection, annotation_id: int
) -> str | None:
    """取标注图的相对 url（/static/annotations/xxx.jpg）。"""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT image_url FROM annotation_image WHERE id = %s", (annotation_id,)
        )
        row = cur.fetchone()
        return row[0] if row else None


def get_annotation_attributes(
    conn: pymysql.connections.Connection, annotation_id: int
) -> list[dict[str, Any]]:
    """取某标注图的全部属性，按源列序号排序。"""
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(
            "SELECT attr_index, raw_text, metric_name, grade_word "
            "FROM annotation_attribute WHERE annotation_id = %s ORDER BY attr_index",
            (annotation_id,),
        )
        return cur.fetchall()


def delete_all_annotations(conn: pymysql.connections.Connection) -> int:
    """清空标注库，返回删除的图片数（属性随外键级联删除）。"""
    with conn.cursor() as cur:
        return cur.execute("DELETE FROM annotation_image")


# ──────────── 点评侧：匹配结果与被赋予的属性 ────────────

def create_evaluation_image_match(
    conn: pymysql.connections.Connection,
    evaluation_id: int,
    *,
    annotation_id: int | None,
    similarity: float | None,
    candidates: list[dict[str, Any]] | None,
    embedding_model: str | None,
    attr_count: int = 0,
) -> None:
    """写入一次点评的匹配结果（evaluation_id 唯一，重复提交则覆盖）。"""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO evaluation_image_match
                (evaluation_id, annotation_id, similarity, candidates,
                 embedding_model, attr_count)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                annotation_id = VALUES(annotation_id),
                similarity = VALUES(similarity),
                candidates = VALUES(candidates),
                embedding_model = VALUES(embedding_model),
                attr_count = VALUES(attr_count)
            """,
            (
                evaluation_id,
                annotation_id,
                similarity,
                json.dumps(candidates, ensure_ascii=False) if candidates else None,
                embedding_model,
                attr_count,
            ),
        )


def bulk_insert_evaluation_image_attributes(
    conn: pymysql.connections.Connection,
    evaluation_id: int,
    rows: list[dict[str, Any]],
) -> None:
    """批量写入本次点评被赋予的图片属性。

    rows: [{metric_id, metric_name, grade_word, raw_text}]
    metric_name / grade_word / raw_text 冗余存快照，不靠 join —— 评价结果是已发生
    事实，标注库后续修改不得改变历史点评的显示内容。
    """
    if not rows:
        return
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM evaluation_image_attribute WHERE evaluation_id = %s",
            (evaluation_id,),
        )
        cur.executemany(
            """
            INSERT INTO evaluation_image_attribute
                (evaluation_id, metric_id, metric_name, grade_word, raw_text)
            VALUES (%s, %s, %s, %s, %s)
            """,
            [
                (
                    evaluation_id,
                    r.get("metric_id"),
                    r.get("metric_name"),
                    r.get("grade_word"),
                    r["raw_text"],
                )
                for r in rows
            ],
        )


def fetch_evaluation_image_attributes(
    conn: pymysql.connections.Connection, evaluation_id: int
) -> list[dict[str, Any]]:
    """取某次点评被赋予的图片属性（供结果接口下发）。"""
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(
            "SELECT metric_id, metric_name, grade_word, raw_text "
            "FROM evaluation_image_attribute WHERE evaluation_id = %s ORDER BY id",
            (evaluation_id,),
        )
        return cur.fetchall()


def fetch_evaluation_image_candidates(
    conn: pymysql.connections.Connection,
    evaluation_id: int,
    *,
    min_similarity: float = 0.0,
) -> list[dict[str, Any]]:
    """取某次点评的相似标注图候选（Top-N），按相似度降序。

    候选本身存在 evaluation_image_match.candidates（JSON 留痕），但其中只有
    annotation_id / file_name / similarity，**没有 image_url** —— 要显示缩略图
    须回 annotation_image 取。这里顺带按 id 过滤掉已被删除的标注图（清空标注库后
    历史点评的候选会指向不存在的行，此时不渲染缩略图而非给出 404 图）。

    :param min_similarity: 相似度下限（不含）。这是**展示过滤**，与匹配无关 ——
        Top-1 赋属性始终不设阈值，此处只是不把「勉强有点像」的图摆到结果页上。
    """
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(
            "SELECT candidates FROM evaluation_image_match WHERE evaluation_id = %s",
            (evaluation_id,),
        )
        row = cur.fetchone()
        if not row or not row.get("candidates"):
            return []

        raw = row["candidates"]
        if isinstance(raw, (str, bytes)):
            try:
                items = json.loads(raw)
            except (TypeError, ValueError):
                return []
        else:
            items = raw
        if not isinstance(items, list):
            return []

        picked: list[dict[str, Any]] = []
        for it in items:
            if not isinstance(it, dict):
                continue
            try:
                sim = float(it.get("similarity"))
            except (TypeError, ValueError):
                continue
            aid = it.get("annotation_id")
            if aid is None or sim <= min_similarity:
                continue
            picked.append({"annotation_id": int(aid), "similarity": sim})
        if not picked:
            return []

        placeholders = ", ".join(["%s"] * len(picked))
        cur.execute(
            "SELECT id, file_name, image_url FROM annotation_image "
            f"WHERE id IN ({placeholders})",
            tuple(p["annotation_id"] for p in picked),
        )
        by_id = {r["id"]: r for r in cur.fetchall()}

        # 同时带出各候选图的属性，供前端在缩略图上标注其风格
        cur.execute(
            "SELECT annotation_id, metric_name, grade_word FROM annotation_attribute "
            f"WHERE annotation_id IN ({placeholders}) ORDER BY annotation_id, attr_index",
            tuple(p["annotation_id"] for p in picked),
        )
        attrs_by_id: dict[int, list[dict[str, Any]]] = {}
        for a in cur.fetchall():
            attrs_by_id.setdefault(a["annotation_id"], []).append(
                {"metric_name": a["metric_name"], "grade_word": a["grade_word"]}
            )

    out: list[dict[str, Any]] = []
    for p in picked:
        img = by_id.get(p["annotation_id"])
        if not img:
            continue  # 标注图已被删除，跳过而非渲染坏图
        out.append(
            {
                "annotation_id": p["annotation_id"],
                "file_name": img["file_name"],
                "image_url": img["image_url"],
                "similarity": round(p["similarity"], 5),
                "attributes": attrs_by_id.get(p["annotation_id"], []),
            }
        )
    out.sort(key=lambda x: x["similarity"], reverse=True)
    return out

