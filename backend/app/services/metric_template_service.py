"""指标体系模板服务：版本（模板）管理 + 维度内容编辑。

模型为「复制式」：每个模板拥有自己完整一套 5/25/75 维度树。
- 切换模板（activate）只改 metric_template.is_active，影响后续 AI 点评与新评价；
  历史评价按 metric_id 隔离，维度名不变。
- 编辑被历史评价引用过的模板（in_use）时，强制「另存为新模板」——
  service 层不在原模板上落更新，而是先克隆再改，保护历史维度名。
"""

from __future__ import annotations

from typing import Any

import pymysql

from app.db import repository as repo
from app.db.session import connection_scope


def list_templates() -> list[dict[str, Any]]:
    with connection_scope() as conn:
        return repo.list_templates(conn)


def get_tree(template_id: int) -> dict[str, Any] | None:
    """模板元信息 + 三级展开的维度树，供编辑页渲染。"""
    with connection_scope() as conn:
        meta = repo.get_template(conn, template_id)
        if meta is None:
            return None
        rows = repo.fetch_template_tree(conn, template_id)
        in_use = repo.template_in_use(conn, template_id)
    return {"template": meta, "tree": _nest_tree(rows), "in_use": in_use}


def _nest_tree(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """把扁平的 75 行嵌套成 一级 → 二级 → 三级 结构（保持排序）。"""
    dims: dict[int, dict[str, Any]] = {}
    subs: dict[int, dict[str, Any]] = {}
    for r in rows:
        d = dims.setdefault(
            r["dim_id"],
            {
                "dim_id": r["dim_id"],
                "dim_code": r["dim_code"],
                "dim_name": r["dim_name"],
                "dim_weight": float(r["dim_weight"]),
                "subs": [],
                "_sub_seen": set(),
            },
        )
        s = subs.get(r["sub_id"])
        if s is None:
            s = {
                "sub_id": r["sub_id"],
                "sub_code": r["sub_code"],
                "sub_name": r["sub_name"],
                "sub_weight": float(r["sub_weight"]),
                "metrics": [],
            }
            subs[r["sub_id"]] = s
            if r["sub_id"] not in d["_sub_seen"]:
                d["subs"].append(s)
                d["_sub_seen"].add(r["sub_id"])
        s["metrics"].append(
            {
                "metric_id": r["metric_id"],
                "metric_code": r["metric_code"],
                "metric_name": r["metric_name"],
                "metric_desc": r["metric_desc"],
                "metric_weight": float(r["metric_weight"]),
            }
        )
    result = list(dims.values())
    for d in result:
        d.pop("_sub_seen", None)
    return result


def create_blank() -> int:
    """新建空骨架模板：克隆当前启用模板的结构，名称留作占位待用户改。

    「从 0 开始填」在固定 5/25/75 结构下落地为：复制一份当前结构作为骨架，
    用户在编辑页逐项改名即可，省去前端自行拼 105 行的复杂度。
    """
    with connection_scope() as conn:
        active_id = repo.get_active_template_id(conn)
        # 命名：模板N（N = 现有数量 + 1）
        existing = repo.list_templates(conn)
        new_no = len(existing) + 1
        new_id = repo.create_template(
            conn, f"模板{new_no}", "新建模板（复制自当前启用模板，待编辑）",
            sort_no=new_no,
        )
        repo.clone_template_tree(conn, active_id, new_id)
    return new_id


def clone_from(src_template_id: int, name: str | None = None) -> int | None:
    """从指定模板克隆一份新模板。源不存在返回 None。"""
    with connection_scope() as conn:
        src = repo.get_template(conn, src_template_id)
        if src is None:
            return None
        existing = repo.list_templates(conn)
        new_no = len(existing) + 1
        new_name = name or f"{src['name']} 副本"
        new_id = repo.create_template(
            conn, new_name, f"克隆自「{src['name']}」", sort_no=new_no
        )
        repo.clone_template_tree(conn, src_template_id, new_id)
    return new_id


def update_meta(template_id: int, name: str, description: str | None) -> dict[str, Any] | None:
    with connection_scope() as conn:
        affected = repo.update_template_meta(conn, template_id, name, description)
        if affected == 0:
            return None
        return repo.get_template(conn, template_id)


def activate(template_id: int) -> dict[str, Any] | None:
    """启用模板。返回启用后的模板；不存在返回 None。"""
    with connection_scope() as conn:
        affected = repo.activate_template(conn, template_id)
        if affected == 0:
            return None
        return repo.get_template(conn, template_id)


def delete(template_id: int) -> dict[str, str] | None:
    """删除模板。返回 None=成功；返回 {"error": ...} = 被拒绝原因。

    拒绝条件：模板不存在 / 为当前启用模板 / 已被历史评价引用。
    """
    with connection_scope() as conn:
        meta = repo.get_template(conn, template_id)
        if meta is None:
            return {"error": "not_found"}
        if meta["is_active"] == 1:
            return {"error": "active"}
        if repo.template_in_use(conn, template_id):
            return {"error": "in_use"}
        repo.delete_template(conn, template_id)
    return None


# ──────────────── 权重校验 ────────────────

class WeightSumError(ValueError):
    """同级权重之和不为 100%。errors 为全部不合规分组的中文说明。"""

    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__("；".join(errors))



# 同级权重和的容差。通例是和恰为 1（如三级 0.5/0.3/0.2、一级 5 个 0.2），
# 但等分时除不尽：3 个 0.3333 和为 0.9999（DECIMAL(6,4) 存不下 1/3）。
# 故留 0.001 的余量只为放过这类等分舍入；对不等权的情形没有任何放松 ——
# 0.9 / 1.1 这类真错填差值达 0.1，是容差的 100 倍，照样拦住。
WEIGHT_SUM_TOLERANCE = 0.001


def _check_weight_group(
    label: str, weights: list[float], errors: list[str]
) -> None:
    """校验一组同级权重之和是否约等于 1，不合规则向 errors 追加一条中文说明。"""
    if not weights:
        return
    total = sum(weights)
    if abs(total - 1.0) > WEIGHT_SUM_TOLERANCE:
        errors.append(
            f"{label}：{len(weights)} 项权重之和为 {round(total * 100, 2)}%，应为 100%"
        )


def validate_tree_weights(dims: list[dict[str, Any]]) -> list[str]:
    """校验整棵维度树的权重：每一组同级兄弟之和须约等于 1。

    共三类分组：一级维度（全表一组）、各一级下的二级、各二级下的三级。
    返回全部不合规的说明列表（空列表表示通过）—— 一次返回所有问题，
    而不是遇到第一个就停，否则用户要改好几轮才知道全部错在哪。

    这里必须校验，不能只靠前端：API 可被直接调用；且 scoring_service 会按实际
    权重和归一化，和不为 1 时评分照样跑，只是界面显示的百分比与真实生效的权重
    不一致 —— 静默失真比直接报错更难排查。
    """
    errors: list[str] = []
    _check_weight_group(
        "一级维度", [float(d.get("dim_weight", 0)) for d in dims], errors
    )
    for d in dims:
        dim_name = d.get("dim_name") or f"维度#{d.get('dim_id')}"
        subs = d.get("subs", [])
        _check_weight_group(
            f"「{dim_name}」下的二级维度",
            [float(s.get("sub_weight", 0)) for s in subs],
            errors,
        )
        for s in subs:
            sub_name = s.get("sub_name") or f"二级#{s.get('sub_id')}"
            _check_weight_group(
                f"「{dim_name}」→「{sub_name}」下的三级指标",
                [float(m.get("metric_weight", 0)) for m in s.get("metrics", [])],
                errors,
            )
    return errors


# ──────────────── 维度内容编辑（含「已用则另存」保护） ────────────────

def save_tree(
    template_id: int,
    dims: list[dict[str, Any]],
    save_as_new: bool = False,
    new_name: str | None = None,
) -> dict[str, Any] | None:
    """保存整棵维度树的内容修改（仅名称/权重/说明，结构不变）。

    规则：
    - 目标模板被历史评价引用，或显式 save_as_new=True → 先克隆出新模板，改动落到新模板，
      原模板保持不变（保护历史维度名）。返回的 template 指向新模板，is_new=True。
    - 否则原地更新，is_new=False。

    :param dims: 嵌套结构 [{dim_id, dim_name, dim_weight, subs:[{sub_id, sub_name,
        sub_weight, metrics:[{metric_id, metric_name, metric_desc, metric_weight}]}]}]
        其中各 id 必须属于 template_id（原地改）或与之同构（克隆改时按相对位置映射）。
    :return: {"template": <模板元信息>, "is_new": bool} 或 None（模板不存在）
    :raises WeightSumError: 任一组同级权重之和不等于 100%（容差见 WEIGHT_SUM_TOLERANCE）
    """
    weight_errors = validate_tree_weights(dims)
    if weight_errors:
        raise WeightSumError(weight_errors)

    with connection_scope() as conn:
        meta = repo.get_template(conn, template_id)
        if meta is None:
            return None
        force_new = save_as_new or repo.template_in_use(conn, template_id)

        if not force_new:
            _apply_tree_updates(conn, template_id, dims)
            return {"template": repo.get_template(conn, template_id), "is_new": False}

        # 另存为新模板：先按源结构克隆，再把改动按「源 id → 新 id」映射后写入新模板
        existing = repo.list_templates(conn)
        new_no = len(existing) + 1
        nm = new_name or f"{meta['name']} v{new_no}"
        new_id = repo.create_template(
            conn, nm, f"由「{meta['name']}」编辑另存", sort_no=new_no
        )
        repo.clone_template_tree(conn, template_id, new_id)
        # 克隆出的新树 id 全新，需把 dims 里的源 id 映射到新 id（按 code 对齐）
        _apply_tree_updates_by_code(conn, template_id, new_id, dims)
        return {"template": repo.get_template(conn, new_id), "is_new": True}


def _apply_tree_updates(
    conn: pymysql.connections.Connection, template_id: int, dims: list[dict[str, Any]]
) -> None:
    """原地按 id 更新（id 必须属于 template_id，repo 层已带 template_id 约束）。"""
    for d in dims:
        repo.update_dimension(
            conn, d["dim_id"], template_id, d["dim_name"], float(d["dim_weight"])
        )
        for s in d.get("subs", []):
            repo.update_sub_dimension(
                conn, s["sub_id"], template_id, s["sub_name"], float(s["sub_weight"])
            )
            for m in s.get("metrics", []):
                repo.update_metric(
                    conn, m["metric_id"], template_id,
                    m["metric_name"], m.get("metric_desc"), float(m["metric_weight"]),
                )


def _apply_tree_updates_by_code(
    conn: pymysql.connections.Connection,
    src_template_id: int,
    dst_template_id: int,
    dims: list[dict[str, Any]],
) -> None:
    """另存场景：源 id → 新模板同 code 行的 id 映射后更新。

    克隆保留了各级 code，故按 code 在新模板里定位对应行。
    """
    new_rows = repo.fetch_template_tree(conn, dst_template_id)
    src_rows = repo.fetch_template_tree(conn, src_template_id)
    # 源 id → code
    src_dim_code = {r["dim_id"]: r["dim_code"] for r in src_rows}
    src_sub_code = {r["sub_id"]: r["sub_code"] for r in src_rows}
    src_metric_code = {r["metric_id"]: r["metric_code"] for r in src_rows}
    # 新模板 code → id
    dst_dim_by_code = {r["dim_code"]: r["dim_id"] for r in new_rows}
    dst_sub_by_code = {r["sub_code"]: r["sub_id"] for r in new_rows}
    dst_metric_by_code = {r["metric_code"]: r["metric_id"] for r in new_rows}

    for d in dims:
        code = src_dim_code.get(d["dim_id"])
        new_dim_id = dst_dim_by_code.get(code)
        if new_dim_id is not None:
            repo.update_dimension(
                conn, new_dim_id, dst_template_id, d["dim_name"], float(d["dim_weight"])
            )
        for s in d.get("subs", []):
            scode = src_sub_code.get(s["sub_id"])
            new_sub_id = dst_sub_by_code.get(scode)
            if new_sub_id is not None:
                repo.update_sub_dimension(
                    conn, new_sub_id, dst_template_id, s["sub_name"], float(s["sub_weight"])
                )
            for m in s.get("metrics", []):
                mcode = src_metric_code.get(m["metric_id"])
                new_metric_id = dst_metric_by_code.get(mcode)
                if new_metric_id is not None:
                    repo.update_metric(
                        conn, new_metric_id, dst_template_id,
                        m["metric_name"], m.get("metric_desc"), float(m["metric_weight"]),
                    )
