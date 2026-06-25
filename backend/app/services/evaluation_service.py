"""评价流程编排。

串联整条链（当前为「全 LLM 评分」阶段，RAG / POI 之后接入）：

  文本输入
    → ① 街巷识别（LLM）           落 ai_analysis_task / ai_analysis_result
    → ② 取画像事实               读 street_profile（无则为空，后续接 POI/RAG）
    → ③ 分 5 批指标评分（LLM）     每批一个一级维度，产出 75 个整数 1~5
    → ④ 入库 + 逐层聚合           street_metric_score → street_dimension_score
    → ⑤ 生成报告（LLM）           回写 street_evaluation.total_score / ai_summary
  全程 Prompt 落 ai_prompt_log。

事务策略：LLM 调用耗时，不长开事务。识别+建任务一个事务；最终入库一个事务。
Prompt 日志各自独立短事务写入，保证即便后续失败也留痕。
"""

from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from app.core.logging import get_logger
from app.db import repository as repo
from app.db.session import connection_scope
from app.services import display_config_service
from app.services import progress_service as progress
from app.services import prompt_builder as pb
from app.services import scoring_service
from app.services import retriever
from app.services.llm_client import chat, chat_vision

logger = get_logger(__name__)

# 任务提交线程池：接收 POST 后立即返回，分析在后台跑。
# max_workers=5 表示最多 5 个分析任务并行（文档建议值）。
_task_executor = ThreadPoolExecutor(max_workers=5, thread_name_prefix="analysis")


def _log_prompt(
    task_id: int | None,
    stage: str,
    prompt_text: str,
    response_text: str,
    model: str,
    token_usage: int | None,
) -> None:
    """独立短事务写一条 Prompt 日志，失败不影响主流程。"""
    try:
        with connection_scope() as conn:
            repo.create_prompt_log(
                conn, task_id, stage, prompt_text, response_text, model, token_usage
            )
    except Exception:  # noqa: BLE001 - 日志失败不应中断评价
        logger.warning("写 prompt 日志失败（stage=%s, task=%s）", stage, task_id, exc_info=True)


# ──────────────── ① 街巷识别 ────────────────

# 识图 prompt 暂硬编码（与文字识别同形输出）；如需可配再补 ai_prompt_template 种子。
_RECOGNIZE_IMAGE_SYSTEM = (
    "你是一名中国城市街区识别专家。根据用户提供的街景照片，判断其所在的街巷/街区。"
    "只返回 JSON，不要多余文字。"
)
_RECOGNIZE_IMAGE_USER = (
    "请识别这张街景照片所在的街道/街区，返回 JSON："
    '{{"streetName": "街道名", "city": "城市", "district": "区", "confidence": 0~1 置信度}}。'
    "{city_hint}"
)


def _assert_recognized(recog: dict[str, Any]) -> dict[str, Any]:
    """识别结果置信度兜底（文字 / 图片两条路径统一）。

    confidence 低于 0.5 视为识别失败，抛错进 _run_pipeline 的 failed 兜底；
    confidence 为 None 时放行（模型未返回置信度，不误杀）。
    """
    c = recog.get("confidence")
    if c is not None:
        try:
            score = float(c)
        except (TypeError, ValueError):
            return recog  # 置信度非数值，无法判定，放行
        if score < 0.5:
            raise ValueError("无法识别街道，请换一张更清晰、含街道标识的照片或改用文字输入")
    return recog


def recognize_street(content: str, city_hint: str | None, task_id: int) -> dict[str, Any]:
    hint = f"\n用户提供的城市线索：{city_hint}" if city_hint else ""
    with connection_scope() as conn:
        rp = pb.render_template(
            conn, "recognize",
            variables={"content": content, "city_hint": hint},
        )
    resp = chat(rp.system, rp.user, model=rp.model, temperature=rp.temperature if rp.temperature is not None else 0.3)
    _log_prompt(task_id, "recognize", resp.prompt_text, resp.text, resp.model, resp.token_usage)
    data = resp.parse_json()
    return _assert_recognized({
        "street_name": (data.get("streetName") or content).strip(),
        "city": data.get("city"),
        "district": data.get("district"),
        "confidence": data.get("confidence"),
        "raw": resp.text,
    })


def recognize_street_from_image(
    image_path: str, city_hint: str | None, task_id: int
) -> dict[str, Any]:
    """从街景照片识别街道，返回结构与 recognize_street 完全一致。"""
    hint = f"\n用户提供的城市线索：{city_hint}" if city_hint else ""
    resp = chat_vision(
        _RECOGNIZE_IMAGE_SYSTEM,
        _RECOGNIZE_IMAGE_USER.format(city_hint=hint),
        image_path,
        temperature=0.3,
    )
    _log_prompt(task_id, "recognize", resp.prompt_text, resp.text, resp.model, resp.token_usage)
    data = resp.parse_json()
    return _assert_recognized({
        "street_name": (data.get("streetName") or "").strip(),
        "city": data.get("city"),
        "district": data.get("district"),
        "confidence": data.get("confidence"),
        "raw": resp.text,
    })


# ──────────────── ③ 分批评分（并发） ────────────────

def _score_one_dimension(
    street_name: str,
    batch: dict[str, Any],
    facts: str,
    task_id: int,
) -> list[dict[str, Any]]:
    """对单个一级维度的指标评分。线程内独立开连接取模板、写日志。

    返回 [{"code", "score", "reason"}]。
    """
    variables = {
        "street_name": street_name,
        "dim_name": batch["dim_name"],
        "facts": facts,
        "metric_count": len(batch["metrics"]),
        "metrics_block": pb.build_metrics_block(batch["metrics"]),
    }
    with connection_scope() as conn:
        rp = pb.render_template(
            conn, "score", dim_code=batch.get("dim_code"), variables=variables
        )
    expected = len(batch["metrics"])
    logger.info("维度「%s」开始评分（%d 项指标）", batch["dim_name"], expected)
    t0 = time.monotonic()
    resp = chat(
        rp.system, rp.user, model=rp.model,
        temperature=rp.temperature if rp.temperature is not None else 0.3,
    )
    elapsed = time.monotonic() - t0
    _log_prompt(
        task_id, f"score:{batch['dim_name']}", resp.prompt_text,
        resp.text, resp.model, resp.token_usage,
    )
    data = resp.parse_json()
    scores = data.get("scores", [])
    logger.info(
        "维度「%s」评分完成：耗时 %.1fs，返回 %d/%d 项，tokens=%s",
        batch["dim_name"], elapsed, len(scores), expected, resp.token_usage,
    )
    if len(scores) < expected:
        logger.warning(
            "维度「%s」模型返回指标数不足：期望 %d，实际 %d（缺失项将兜底补中位分）",
            batch["dim_name"], expected, len(scores),
        )
    return scores


def score_all_metrics(
    street_name: str,
    metric_tree: list[dict[str, Any]],
    facts_text: str,
    task_id: int,
) -> dict[int, dict[str, Any]]:
    """5 个一级维度并发评分，返回 {metric_id: {"score", "reason"}}。

    每完成一个维度即更新进度（计数式：20 + N*13），文案「已完成 N/5 维度评分」。
    """
    code_to_id = {m["metric_code"]: m["metric_id"] for m in metric_tree}
    batches = pb.group_metrics_by_dimension(metric_tree)
    facts = facts_text.strip() or "（暂无结构化事实数据，请基于该街区的公开常识进行合理评估。）"
    total = len(batches)
    result: dict[int, dict[str, Any]] = {}
    done = 0
    failed_dims: list[str] = []

    logger.info(
        "任务 %s 开始并发评分：%d 个一级维度 → %s",
        task_id, total, "、".join(b["dim_name"] for b in batches),
    )

    with ThreadPoolExecutor(max_workers=total, thread_name_prefix="score") as pool:
        future_to_dim = {
            pool.submit(_score_one_dimension, street_name, b, facts, task_id): b["dim_name"]
            for b in batches
        }
        for future in as_completed(future_to_dim):
            dim_name = future_to_dim[future]
            try:
                scores = future.result()
            except Exception as exc:  # noqa: BLE001 - 单维度失败不拖垮整体，缺失项后面兜底补 3
                # 关键：把被吞的异常完整打出来（含 traceback），并落一条 error 日志，
                # 否则该维度既无 prompt 日志也无评分，表现为「随机少一个维度」。
                failed_dims.append(dim_name)
                logger.exception(
                    "维度「%s」评分失败（%s: %s）——该维度全部指标将兜底补中位分",
                    dim_name, type(exc).__name__, exc,
                )
                _log_prompt(
                    task_id, f"score-error:{dim_name}", "(见 error_message)",
                    f"{type(exc).__name__}: {exc}", "-", None,
                )
                scores = []
            for item in scores:
                mid = code_to_id.get(item.get("code"))
                if mid is None:
                    logger.warning(
                        "维度「%s」返回了未知指标 code=%r，已忽略", dim_name, item.get("code")
                    )
                    continue
                s = _clamp_score(item.get("score"))
                result[mid] = {"score": s, "reason": (item.get("reason") or "")[:500]}
            done += 1
            progress.update_progress(
                task_id, progress.score_progress(done, total),
                "scoring", f"已完成 {done}/{total} 维度评分（最新：{dim_name}）",
            )

    if failed_dims:
        logger.error(
            "任务 %s 评分阶段有 %d/%d 个维度失败：%s",
            task_id, len(failed_dims), total, "、".join(failed_dims),
        )
    else:
        logger.info("任务 %s 全部 %d 个维度评分成功", task_id, total)

    # 兜底：模型漏掉/失败的指标给中位分 3，保证 75 项齐全可聚合
    scored_before = len(result)
    for m in metric_tree:
        result.setdefault(m["metric_id"], {"score": 3, "reason": "(模型未返回，默认中位分)"})
    filled = len(result) - scored_before
    if filled:
        logger.warning(
            "任务 %s 共 %d/%d 个指标缺失，已兜底补中位分 3",
            task_id, filled, len(metric_tree),
        )

    return result


def _clamp_score(value: Any) -> int:
    try:
        s = int(round(float(value)))
    except (TypeError, ValueError):
        return 3
    return max(1, min(5, s))


# ──────────────── ⑤ 报告 ────────────────

def generate_report(
    street_name: str,
    total_score: float,
    dimension_scores: list[dict[str, Any]],
    task_id: int,
) -> str:
    variables = {
        "street_name": street_name,
        "total_score": total_score,
        "dim_block": pb.build_dim_block(dimension_scores),
    }
    with connection_scope() as conn:
        rp = pb.render_template(conn, "report", variables=variables)
    resp = chat(
        rp.system, rp.user, model=rp.model,
        temperature=rp.temperature if rp.temperature is not None else 0.3,
    )
    _log_prompt(task_id, "report", resp.prompt_text, resp.text, resp.model, resp.token_usage)
    try:
        return pb.render_report_summary(resp.parse_json())
    except Exception:  # noqa: BLE001
        return resp.text.strip()


# ──────────────── 编排入口（异步） ────────────────

def submit_text_analysis(content: str, city_hint: str | None = None) -> dict[str, Any]:
    """提交文本分析：建任务 → 丢到后台线程池 → 立即返回 {task_id, status}。"""
    with connection_scope() as conn:
        task_id = repo.create_ai_task(
            conn, task_no=None, input_type="text", text_input=content, status="pending"
        )
    _task_executor.submit(_run_pipeline, task_id, content, city_hint)
    return {"task_id": task_id, "status": "pending"}


def submit_image_analysis(
    rel_url: str, abs_path: str, city_hint: str | None = None
) -> dict[str, Any]:
    """提交图片分析：建任务（存相对 url）→ 后台线程池（识别用磁盘绝对路径）→ 立即返回。

    :param rel_url: 对外相对路径 /static/uploads/<uuid>.ext，入库供前端展示。
    :param abs_path: 本地磁盘绝对路径，仅用于识别时 base64 读图，不入库。
    """
    with connection_scope() as conn:
        task_id = repo.create_ai_task(
            conn, task_no=None, input_type="image",
            text_input=None, image_url=rel_url, status="pending",
        )
    _task_executor.submit(_run_pipeline, task_id, None, city_hint, abs_path)
    return {"task_id": task_id, "status": "pending"}


def _run_pipeline(
    task_id: int, content: str | None, city_hint: str | None, image_path: str | None = None
) -> None:
    """后台执行整条评价链，逐阶段更新进度。异常时标记 failed 并记录原因。

    输入来源二选一：image_path 非空走识图分支，否则走文字分支；识别后阶段一致。
    """
    evaluation_id: int | None = None
    t_start = time.monotonic()
    logger.info(
        "任务 %s 开始：input_type=%s, city_hint=%s",
        task_id, "image" if image_path else "text", city_hint or "-",
    )
    try:
        with connection_scope() as conn:
            repo.update_ai_task(conn, task_id, status="analyzing")

        # ① 识别（文字 / 图片分支，返回结构一致）
        progress.set_stage(task_id, progress.STAGE_RECOGNIZE)
        if image_path:
            recog = recognize_street_from_image(image_path, city_hint, task_id)
        else:
            recog = recognize_street(content or "", city_hint, task_id)
        street_name = recog["street_name"]
        logger.info(
            "任务 %s 识别完成：街区=%s，城市=%s，置信度=%s",
            task_id, street_name, recog.get("city"), recog.get("confidence"),
        )

        # 建街巷 + 评价表头 + 识别结果（短事务）
        with connection_scope() as conn:
            street_id = repo.get_or_create_street(
                conn, street_name, recog.get("city"), recog.get("district")
            )
            evaluation_id = repo.create_evaluation(
                conn, street_id, task_no=None, source="ai", status="analyzing"
            )
            repo.update_ai_task(conn, task_id, evaluation_id=evaluation_id)
            repo.create_ai_result(
                conn, task_id,
                recognized_street=street_name,
                recognized_city=recog.get("city"),
                confidence=recog.get("confidence"),
                matched_street_id=street_id,
                raw_response=json.dumps(
                    {k: recog[k] for k in ("street_name", "city", "district", "confidence")},
                    ensure_ascii=False,
                ),
            )
            profile_facts = retriever.get_retriever().retrieve(
                conn, street_id, street_name
            )
            metric_tree = repo.fetch_metric_tree(conn)

        # ② 画像事实（POI 召回 → 结构化摘要，无 POI 时为空走兜底）
        progress.set_stage(task_id, progress.STAGE_PROFILE)
        facts_text = profile_facts.to_prompt_facts()

        # ③ 并发评分（内部逐维度更新进度）
        scored = score_all_metrics(street_name, metric_tree, facts_text, task_id)
        metric_scores = {mid: v["score"] for mid, v in scored.items()}

        # ④ 聚合
        aggregated = scoring_service.aggregate(metric_tree, metric_scores)

        # ⑤ 报告
        progress.set_stage(task_id, progress.STAGE_REPORT)
        summary = generate_report(
            street_name, aggregated["total_score"], aggregated["dimension_scores"], task_id
        )

        # 入库（一个事务：明细 + 维度聚合 + 回写表头）
        with connection_scope() as conn:
            repo.bulk_insert_metric_scores(
                conn,
                evaluation_id,
                [
                    {
                        "metric_id": mid,
                        "score": v["score"],
                        "score_reason": v["reason"],
                        "source_type": "LLM",
                    }
                    for mid, v in scored.items()
                ],
            )
            repo.bulk_insert_dimension_scores(
                conn, evaluation_id, scoring_service.build_dimension_rows(aggregated)
            )
            repo.finalize_evaluation(
                conn, evaluation_id, aggregated["total_score"], summary, status="completed"
            )
            repo.update_ai_task(
                conn, task_id, status="completed",
                progress=100, current_stage="done", stage_message="分析完成",
            )
        logger.info(
            "任务 %s 完成：街区=%s，综合分=%s，总耗时 %.1fs",
            task_id, street_name, aggregated["total_score"], time.monotonic() - t_start,
        )
    except Exception as exc:  # noqa: BLE001 - 后台任务统一兜底，写明失败原因
        logger.exception(
            "任务 %s 失败（%s: %s），总耗时 %.1fs",
            task_id, type(exc).__name__, exc, time.monotonic() - t_start,
        )
        with connection_scope() as conn:
            if evaluation_id is not None:
                repo.mark_evaluation_failed(conn, evaluation_id)
            repo.update_ai_task(
                conn, task_id, status="failed",
                stage_message="分析失败", error_message=str(exc)[:500],
            )


def list_history(limit: int = 50) -> list[dict[str, Any]]:
    """历史记录列表：返回已完成评价的概要，按时间倒序。

    summary 截断为短摘要供卡片展示；完整内容在结果页按 eid 查询。
    """
    with connection_scope() as conn:
        rows = repo.list_evaluations(conn, limit=limit, status="completed")

    items: list[dict[str, Any]] = []
    for r in rows:
        summary = r.get("ai_summary") or ""
        short = summary.strip().replace("\n", " ")
        if len(short) > 120:
            short = short[:120].rstrip() + "…"
        created = r.get("create_time")
        items.append(
            {
                "evaluation_id": r["evaluation_id"],
                "street": r.get("street_name") or "",
                "city": r.get("city"),
                "district": r.get("district"),
                "total_score": (
                    float(r["total_score"]) if r.get("total_score") is not None else None
                ),
                "status": r.get("status") or "completed",
                "summary": short or None,
                "image_url": r.get("image_url"),
                "created_at": created.isoformat() if created is not None else None,
            }
        )
    return items


def get_result(evaluation_id: int) -> dict[str, Any] | None:
    """查询评价结果，组装为响应字典。

    按「分析管理」显示配置（analytics_display_config）做服务端过滤：
    关闭的区块对应字段直接清空/不下发，并在 enabled_blocks 里告知前端哪些区块可渲染。
    维度聚合分（dimension_scores / sub_dimension_scores）是明细分组的结构依赖，
    只要相关区块任一开启就保留；纯展示性区块（雷达图/拆解）由前端按 enabled_blocks 决定渲染。
    """
    with connection_scope() as conn:
        evaluation = repo.get_evaluation(conn, evaluation_id)
        if not evaluation:
            return None
        # 取 street 名
        with conn.cursor() as cur:
            cur.execute(
                "SELECT street_name FROM street WHERE id = %s",
                (evaluation["street_id"],),
            )
            row = cur.fetchone()
            street_name = row[0] if row else ""

        dim_rows = repo.fetch_dimension_scores(conn, evaluation_id, dim_level=1)
        sub_rows = repo.fetch_dimension_scores(conn, evaluation_id, dim_level=2)
        metric_rows = repo.fetch_metric_scores(conn, evaluation_id)
        image_url = repo.get_task_image_url(conn, evaluation_id)
        blocks = display_config_service.enabled_blocks(conn)

    # 维度名映射：跨所有模板的全量 id→名称（历史评价按当时模板的维度名还原，
    # 不受当前启用模板影响）
    with connection_scope() as conn:
        name_map = repo.fetch_dimension_name_map(conn)
    dim_name = name_map["dim"]
    sub_name = name_map["sub"]
    sub_dim = name_map["sub_parent"]

    # ── 按显示配置过滤字段 ──
    # 一级维度分被雷达图 / 一级拆解 / 二三级明细共同依赖（分组与标签），任一开启即保留
    need_dimensions = bool(
        blocks & {"radar_chart", "dimension_break", "sub_dimension", "metric_score"}
    )
    dimension_scores = (
        [
            {"dim_id": r["ref_id"], "dim_name": dim_name.get(r["ref_id"], ""), "score": float(r["score"])}
            for r in dim_rows
        ]
        if need_dimensions
        else []
    )
    # 二级明细：仅在二级或三级区块开启时下发（三级需二级做分组）
    sub_dimension_scores = (
        [
            {
                "sub_id": r["ref_id"],
                "sub_name": sub_name.get(r["ref_id"], ""),
                "dim_id": sub_dim.get(r["ref_id"], 0),
                "score": float(r["score"]),
            }
            for r in sub_rows
        ]
        if blocks & {"sub_dimension", "metric_score"}
        else []
    )
    # 三级得分：仅在三级区块开启时下发；得分依据 reason 再受 metric_reason 控制
    show_reason = "metric_reason" in blocks
    metric_scores = (
        [
            {
                "metric_id": r["metric_id"],
                "metric_code": r["metric_code"],
                "metric_name": r["metric_name"],
                "sub_id": r["sub_id"],
                "dim_id": r["dim_id"],
                "score": int(r["score"]),
                "reason": (r["score_reason"] if show_reason else None),
            }
            for r in metric_rows
        ]
        if "metric_score" in blocks
        else []
    )

    return {
        "evaluation_id": evaluation_id,
        "street": street_name,
        "status": evaluation["status"],
        "total_score": (
            float(evaluation["total_score"])
            if evaluation["total_score"] is not None and "total_score" in blocks
            else None
        ),
        "summary": (evaluation["ai_summary"] if "ai_summary" in blocks else None),
        "image_url": (image_url if "header_image" in blocks else None),
        "enabled_blocks": sorted(blocks),
        "dimension_scores": dimension_scores,
        "sub_dimension_scores": sub_dimension_scores,
        "metric_scores": metric_scores,
    }
