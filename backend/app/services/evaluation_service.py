"""评价流程编排。

串联整条链（当前为「全 LLM 评分」阶段，RAG / POI 之后接入）：

  文本输入
    → ① 街巷识别（LLM）           落 ai_analysis_task / ai_analysis_result
    → ①.5 图片属性匹配（仅照片）   照片与人工标注库比向量，Top-1 的图片属性
                                  落 evaluation_image_match / _attribute
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
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from pathlib import Path

from app.core.config import get_settings
from app.core.logging import get_logger
from app.db import repository as repo
from app.db.session import connection_scope
from app.services import display_config_service
from app.services import progress_service as progress
from app.services import prompt_builder as pb
from app.services import scoring_service
from app.services import retriever
from app.services.annotation import matcher
from app.services.llm_client import chat, chat_vision

logger = get_logger(__name__)

# 任务提交线程池：接收 POST 后立即返回，分析在后台跑。
# max_workers=5 表示最多 5 个分析任务并行（文档建议值）。
_task_executor = ThreadPoolExecutor(max_workers=5, thread_name_prefix="analysis")

# ──────────────── 取消（协作式） ────────────────
# LLM 调用本身无法被强制打断，取消采用协作式：cancel 接口置内存标志并立即返回，
# pipeline 在每两个 LLM 调用之间检查 check_cancel()——识别后、五维度评分前、
# 总结前、保存前——命中即抛 _TaskCancelled 提前收尾，DB 状态置 cancelled。
_cancel_flags: set[int] = set()
_cancel_lock = threading.Lock()


class _TaskCancelled(Exception):
    """任务被用户取消的内部信号。"""


class StreetNotRecognized(Exception):
    """识别置信度过低：模型正常作答「认不出」，不是系统故障。

    仍然终止本次点评（任务置 failed、前端提示换图），但它属于**预期结果**而非
    错误，故 _run_pipeline 对其单独处理：记 WARNING 且不打堆栈。用 ERROR +
    traceback 表达一个正常的业务判定会掩盖真正的故障。
    """


def request_cancel(task_id: int) -> dict[str, Any]:
    """请求取消任务，立即返回不等待后台线程真正停下。

    返回 {"task_id", "status", "cancelled": bool}。
    - 任务不存在 → ValueError（API 转 404）
    - 已终态（completed/failed/cancelled）→ cancelled=False，原状态返回
    - pending/analyzing/awaiting_confirm → 置内存标志 + 立即把 DB 改 cancelled，
      cancelled=True。awaiting_confirm 不在终态集合内，故等待确认期间同样可取消
      （此时没有后台线程在跑，置标志只是为防确认请求与取消并发时继续评分）。
    """
    with connection_scope() as conn:
        row = repo.get_task_progress(conn, task_id)
        if row is None:
            raise ValueError("任务不存在")
        if row["status"] in {"completed", "failed", "cancelled"}:
            return {"task_id": task_id, "status": row["status"], "cancelled": False}
        with _cancel_lock:
            _cancel_flags.add(task_id)
        repo.update_ai_task(
            conn, task_id, status="cancelled",
            current_stage="cancelled", stage_message="分析已取消",
        )
    logger.info("任务 %s 收到取消请求", task_id)
    return {"task_id": task_id, "status": "cancelled", "cancelled": True}


def check_cancel(task_id: int) -> None:
    """LLM 调用之间的取消检查点：已取消则抛 _TaskCancelled 中断 pipeline。"""
    with _cancel_lock:
        hit = task_id in _cancel_flags
    if hit:
        raise _TaskCancelled


def _clear_cancel_flag(task_id: int) -> None:
    with _cancel_lock:
        _cancel_flags.discard(task_id)


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


# 置信度低于此值视为「认不出」。照片确认流程开启时不再据此终止任务，
# 而是带着这个判定进入确认卡，提示用户直接输入地点或换图。
LOW_CONFIDENCE_THRESHOLD = 0.5


def _is_low_confidence(value: Any) -> bool:
    """置信度是否低于阈值。

    None（模型未返回）与非数值一律视为「不低」—— 无法判定时不误杀。
    """
    if value is None:
        return False
    try:
        return float(value) < LOW_CONFIDENCE_THRESHOLD
    except (TypeError, ValueError):
        return False


def _assert_recognized(recog: dict[str, Any]) -> dict[str, Any]:
    """识别结果置信度兜底（文字 / 图片两条路径统一）。

    置信度低于阈值视为识别失败，抛 StreetNotRecognized 终止本次点评；
    None / 非数值放行（无法判定，不误杀）。

    抛专属异常而非 ValueError，是为了让 _run_pipeline 能把「模型认不出」与真正的
    故障区分开 —— 前者是预期结果，日志记 WARNING 不打堆栈。

    照片确认流程开启时**不走这个断言**（调用方传 assert_confidence=False）：
    认不出恰恰是最该问用户的情形，交由确认卡提示输入地点或换图。
    """
    if _is_low_confidence(recog.get("confidence")):
        raise StreetNotRecognized(
            "无法识别街道，请换一张更清晰、含街道标识的照片或改用文字输入"
        )
    return recog


def recognize_street(content: str, city_hint: str | None, task_id: int) -> dict[str, Any]:
    hint = f"\n用户提供的城市线索：{city_hint}" if city_hint else ""
    with connection_scope() as conn:
        rp = pb.render_template(
            conn, "recognize",
            variables={"content": content, "city_hint": hint},
        )
    # 识别街名对时效/地名准确度敏感，全局联网开启时对该阶段强制联网
    resp = chat(
        rp.system, rp.user, model=rp.model,
        temperature=rp.temperature if rp.temperature is not None else 0.3,
        forced_search=True,
    )
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
    image_path: str,
    city_hint: str | None,
    task_id: int,
    *,
    assert_confidence: bool = True,
) -> dict[str, Any]:
    """从街景照片识别街道，返回结构与 recognize_street 完全一致。

    :param assert_confidence: True（默认，保持原行为）时低置信度抛
        StreetNotRecognized；确认流程开启时传 False —— 认不出要交给用户处理，
        不是终止任务。
    """
    hint = f"\n用户提供的城市线索：{city_hint}" if city_hint else ""
    resp = chat_vision(
        _RECOGNIZE_IMAGE_SYSTEM,
        _RECOGNIZE_IMAGE_USER.format(city_hint=hint),
        image_path,
        temperature=0.3,
    )
    _log_prompt(task_id, "recognize", resp.prompt_text, resp.text, resp.model, resp.token_usage)
    data = resp.parse_json()
    recog = {
        "street_name": (data.get("streetName") or "").strip(),
        "city": data.get("city"),
        "district": data.get("district"),
        "confidence": data.get("confidence"),
        "raw": resp.text,
    }
    return _assert_recognized(recog) if assert_confidence else recog


# ──────────────── ①.5 图片属性匹配（仅照片点评） ────────────────

def match_image_attributes(
    task_id: int,
    evaluation_id: int,
    image_path: str,
    metric_tree: list[dict[str, Any]],
) -> None:
    """把上传照片与人工标注库比对，取 Top-1 的图片属性赋给本次点评。

    全程 try/except 只记 warning：**匹配失败绝不能让整次点评失败**。属性是增量
    信息，拿不到就退化成接入本功能之前的行为（与 _log_prompt / update_progress
    失败静默的取舍一致）。

    本版不设阈值，无条件取 Top-1；相似度与 Top-N 候选都落库并打进日志 —— UI 上
    不展示相似度，日志与 evaluation_image_match 表是判断匹配质量的主要抓手。
    """
    try:
        # 属性指标名全部属于 SPACE（空间美学）维度，限定后再建映射，
        # 避免与其他维度的同名指标误撞
        name_to_metric_id = {
            row["metric_name"]: row["metric_id"]
            for row in metric_tree
            if row.get("dim_code") == "SPACE"
        }

        with connection_scope() as conn:
            match = matcher.match_image(conn, image_path)
            if match is None:
                logger.info("任务 %s 标注库无可比向量，跳过图片属性匹配", task_id)
                return

            attrs = repo.get_annotation_attributes(conn, match.annotation_id)
            rows: list[dict[str, Any]] = []
            unmatched_names: list[str] = []
            for a in attrs:
                metric_name = a.get("metric_name")
                metric_id = name_to_metric_id.get(metric_name) if metric_name else None
                if metric_name and metric_id is None:
                    unmatched_names.append(metric_name)
                rows.append(
                    {
                        "metric_id": metric_id,
                        "metric_name": metric_name,
                        "grade_word": a.get("grade_word"),
                        "raw_text": a["raw_text"],
                    }
                )

            repo.create_evaluation_image_match(
                conn,
                evaluation_id,
                annotation_id=match.annotation_id,
                similarity=match.similarity,
                candidates=match.candidates,
                embedding_model=match.model,
                attr_count=len(rows),
            )
            repo.bulk_insert_evaluation_image_attributes(conn, evaluation_id, rows)

        top5 = "、".join(
            f"{c['file_name']}({c['similarity']})" for c in match.candidates
        )
        logger.info(
            "任务 %s 命中标注图 %s，similarity=%.5f，属性 %d 条，Top-%d=[%s]",
            task_id, match.file_name, match.similarity, len(rows),
            len(match.candidates), top5,
        )
        if unmatched_names:
            logger.warning(
                "任务 %s 有 %d 个属性指标名在当前模板的空间美学维度中找不到对应指标"
                "（%s），这些属性已入库但前端不会渲染",
                task_id, len(unmatched_names), "、".join(sorted(set(unmatched_names))),
            )
    except Exception as exc:  # noqa: BLE001 - 匹配失败不拖垮整条点评
        logger.warning(
            "任务 %s 图片属性匹配失败（%s: %s），本次点评不带图片属性",
            task_id, type(exc).__name__, exc, exc_info=True,
        )


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
    logger.info(
        "维度「%s」评分 prompt：\n[SYSTEM]\n%s\n[USER]\n%s",
        batch["dim_name"], rp.system, rp.user,
    )
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
    facts: "retriever.StreetFacts",
    task_id: int,
) -> dict[int, dict[str, Any]]:
    """5 个一级维度并发评分，返回 {metric_id: {"score", "reason"}}。

    每个维度只拿与其相关的裁剪 facts（tag 驱动），节省 token；
    每完成一个维度即更新进度（计数式：20 + N*13），文案「已完成 N/5 维度评分」。

    同时下发 stage_detail 结构化名单：done 数组按真实完成顺序累加（并发下不等于
    batches 的 dim_sort 顺序），失败的维度记 ok=False。前端据此显示「第 N 个完成的
    是谁」并把兜底维度与真正成功的区分开 —— 单靠 stage_message 那句文案只带得出
    最新一个，且 SSE 每秒才推一帧、同秒内完成的两个维度会丢掉中间帧。
    """
    code_to_id = {m["metric_code"]: m["metric_id"] for m in metric_tree}
    batches = pb.group_metrics_by_dimension(metric_tree)
    fallback = "（暂无结构化事实数据，请基于该街区的公开常识进行合理评估。）"
    total = len(batches)
    result: dict[int, dict[str, Any]] = {}
    done = 0
    failed_dims: list[str] = []
    # 按完成顺序累加的名单，随每帧进度下发给前端
    done_list: list[dict[str, Any]] = []
    all_names = [b["dim_name"] for b in batches]

    def _facts_for(batch: dict[str, Any]) -> str:
        """按维度裁剪 facts；空则给兜底文案。"""
        return facts.to_prompt_facts_for(batch.get("dim_code")).strip() or fallback

    logger.info(
        "任务 %s 开始并发评分：%d 个一级维度 → %s",
        task_id, total, "、".join(all_names),
    )

    # 评分起始帧：让前端在第一个维度回来之前就能显示全部维度名并进入 scoring 阶段
    # （否则从画像 20 到首个维度完成之间没有任何 scoring 信号）
    progress.update_progress(
        task_id, progress.SCORE_BASE, "scoring",
        f"正在并发评分 {total} 个维度",
        stage_detail={"all": all_names, "done": [], "total": total},
    )

    with ThreadPoolExecutor(max_workers=total, thread_name_prefix="score") as pool:
        future_to_dim = {
            pool.submit(_score_one_dimension, street_name, b, _facts_for(b), task_id): b["dim_name"]
            for b in batches
        }
        for future in as_completed(future_to_dim):
            dim_name = future_to_dim[future]
            ok = True
            try:
                scores = future.result()
            except Exception as exc:  # noqa: BLE001 - 单维度失败不拖垮整体，缺失项后面兜底补 3
                # 关键：把被吞的异常完整打出来（含 traceback），并落一条 error 日志，
                # 否则该维度既无 prompt 日志也无评分，表现为「随机少一个维度」。
                ok = False
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
            done_list.append({"name": dim_name, "ok": ok})
            progress.update_progress(
                task_id, progress.score_progress(done, total),
                "scoring", f"已完成 {done}/{total} 维度评分（最新：{dim_name}）",
                stage_detail={
                    "all": all_names,
                    "done": list(done_list),
                    "total": total,
                },
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

    **在入口按开关分叉**，而不是在链路内部分支：
    - 开关开启 → _run_recognize_phase，识别完停在 awaiting_confirm 等用户确认
    - 开关关闭 → _run_pipeline，即改动前的原函数（与文字点评同一个）

    这样「关掉开关」等于回到改动前的代码路径，是真正的回退开关；若改成「照片永远
    走双段、只是不暂停」，双段拆分自身的 bug 就无法靠关开关规避。

    :param rel_url: 对外相对路径 /static/uploads/<uuid>.ext，入库供前端展示。
    :param abs_path: 本地磁盘绝对路径，仅用于识别时 base64 读图，不入库。
    """
    with connection_scope() as conn:
        task_id = repo.create_ai_task(
            conn, task_no=None, input_type="image",
            text_input=None, image_url=rel_url, status="pending",
        )
    if display_config_service.is_enabled(CONFIRM_LOCATION_BLOCK):
        logger.info("任务 %s 走照片地点确认流程（_run_recognize_phase）", task_id)
        _task_executor.submit(_run_recognize_phase, task_id, abs_path, city_hint)
    else:
        logger.info("任务 %s 照片地点确认已关闭，走原链路（_run_pipeline）", task_id)
        _task_executor.submit(_run_pipeline, task_id, None, city_hint, abs_path)
    return {"task_id": task_id, "status": "pending"}


# ──────────────── 照片地点确认（两段式） ────────────────

# 功能开关的 block_key（复用 analytics_display_config 的 flow 分组）
CONFIRM_LOCATION_BLOCK = "image_confirm_location"


def _run_recognize_phase(
    task_id: int, image_path: str, city_hint: str | None = None
) -> None:
    """第一段：只做识别，然后置 awaiting_confirm 收尾，等用户确认。

    刻意**不建 street / street_evaluation** —— 用户可能否掉这个地点，先建会在
    street 表留下垃圾行。识别结果暂存 ai_analysis_result（matched_street_id 留空，
    确认后回填），确认接口据它预填。

    低置信度不抛 StreetNotRecognized：认不出恰恰最该问用户，交由确认卡提示输入。
    """
    t_start = time.monotonic()
    logger.info("任务 %s 开始（照片确认流程）：city_hint=%s", task_id, city_hint or "-")
    try:
        with connection_scope() as conn:
            repo.update_ai_task(conn, task_id, status="analyzing")

        check_cancel(task_id)
        progress.set_stage(task_id, progress.STAGE_RECOGNIZE)
        recog = recognize_street_from_image(
            image_path, city_hint, task_id, assert_confidence=False
        )
        low_confidence = _is_low_confidence(recog.get("confidence"))
        street_name = recog["street_name"]
        logger.info(
            "任务 %s 识别完成：街区=%s，城市=%s，置信度=%s%s",
            task_id, street_name or "(未识别)", recog.get("city"),
            recog.get("confidence"), "（低置信度）" if low_confidence else "",
        )

        check_cancel(task_id)
        with connection_scope() as conn:
            repo.create_ai_result(
                conn, task_id,
                recognized_street=street_name or None,
                recognized_city=recog.get("city"),
                confidence=recog.get("confidence"),
                matched_street_id=None,  # 确认后建 street 时回填
                raw_response=json.dumps(
                    {k: recog.get(k) for k in
                     ("street_name", "city", "district", "confidence")},
                    ensure_ascii=False,
                ),
            )
        # 置等待确认态。stage_detail 带 low_confidence 供前端换文案
        progress.update_progress(
            task_id,
            progress.STAGE_AWAIT_CONFIRM[1],
            progress.STAGE_AWAIT_CONFIRM[0],
            progress.STAGE_AWAIT_CONFIRM[2],
            stage_detail={"low_confidence": low_confidence},
        )
        # 条件更新（仅当仍为 analyzing）：取消请求可能恰好落在最后一次
        # check_cancel 之后，无条件写会把 cancelled 复活成待确认态，
        # 用户就会看到一个已取消任务的确认卡。
        with connection_scope() as conn:
            moved = repo.set_task_awaiting_confirm(conn, task_id)
        if not moved:
            logger.info("任务 %s 在置待确认前已终止，不再进入确认态", task_id)
            return
        logger.info(
            "任务 %s 等待用户确认地点（识别耗时 %.1fs）",
            task_id, time.monotonic() - t_start,
        )
    except _TaskCancelled:
        logger.info("任务 %s 已取消，识别阶段提前结束", task_id)
        with connection_scope() as conn:
            repo.update_ai_task(
                conn, task_id, status="cancelled",
                current_stage="cancelled", stage_message="分析已取消",
            )
    except Exception as exc:  # noqa: BLE001 - 后台任务统一兜底
        logger.exception(
            "任务 %s 识别阶段失败（%s: %s）", task_id, type(exc).__name__, exc
        )
        with connection_scope() as conn:
            repo.update_ai_task(
                conn, task_id, status="failed",
                stage_message="识别失败", error_message=str(exc)[:500],
            )
    finally:
        # 本段到此结束（无论成功进入待确认、还是取消/失败），取消标志都要清掉：
        # 它是「本次后台执行」的协作信号，留着会让用户确认后的评分阶段一启动
        # 就被旧标志判为已取消。确认后若要再取消，会重新置标志。
        _clear_cancel_flag(task_id)


def replace_image_and_recognize(
    task_id: int, rel_url: str, abs_path: str, city_hint: str | None = None
) -> dict[str, Any]:
    """换一张照片，在**同一个 task 上**重新识别。立即返回，识别在后台跑。

    保留同一个 taskId（而非取消旧任务 + 新建）：换图是「这次点评的一次重试」，
    不是另一次点评。复用同一条任务记录可以让历史里只留一条终态，不会堆积
    cancelled 的半截任务，前端 URL 的 taskId 也不必跟着变。

    旧图片文件与旧识别结果行一并清掉 —— 它们都是针对旧照片的，留着会让确认接口
    预填出上一张图的地点，也会让 _run_scoring_phase 误判「已有识别结果」。

    :raises ValueError: 任务不存在 / 不处于 awaiting_confirm / 不是图片任务
    """
    with connection_scope() as conn:
        task = repo.get_ai_task(conn, task_id)
        if task is None:
            raise ValueError("任务不存在")
        if task["status"] != "awaiting_confirm":
            raise ValueError(f"任务当前状态为 {task['status']}，不处于待确认状态")
        if task.get("input_type") != "image":
            raise ValueError("只有照片点评任务可以更换图片")
        old_image_url = task.get("image_url")
        # 换图即重置：清掉旧识别结果，置回 analyzing 并写入新图地址
        repo.delete_ai_results_by_task(conn, task_id)
        repo.update_ai_task(conn, task_id, status="analyzing", image_url=rel_url)

    # 删旧图（失败不影响主流程，仅留痕）
    if old_image_url and old_image_url != rel_url:
        try:
            Path(get_settings().upload_dir, Path(old_image_url).name).unlink(
                missing_ok=True
            )
        except OSError:
            logger.warning("任务 %s 删除旧图失败：%s", task_id, old_image_url)

    # 换图后重新进入识别阶段。取消标志由上一段的 finally 清过，这里是干净的。
    _task_executor.submit(_run_recognize_phase, task_id, abs_path, city_hint)
    logger.info("任务 %s 已更换照片，重新识别", task_id)
    return {"task_id": task_id, "status": "analyzing"}


def get_confirm_info(task_id: int) -> dict[str, Any] | None:
    """取待确认详情（供确认页预填）。

    :return: 待确认结构；任务不存在返回 None
    :raises ValueError: 任务不处于 awaiting_confirm（状态机不可乱入）
    """
    with connection_scope() as conn:
        task = repo.get_ai_task(conn, task_id)
        if task is None:
            return None
        if task["status"] != "awaiting_confirm":
            raise ValueError(f"任务当前状态为 {task['status']}，不处于待确认状态")
        result = repo.get_ai_result_by_task(conn, task_id)

    recog = _parse_raw_response((result or {}).get("raw_response"))
    confidence = (result or {}).get("confidence")
    # 上一次改写归一化失败的提示（_back_to_awaiting_confirm 写入），
    # 让用户知道为什么又回到了这张卡上
    stage_detail = task.get("stage_detail")
    if isinstance(stage_detail, (str, bytes)):
        stage_detail = _parse_raw_response(stage_detail)
    confirm_error = (
        stage_detail.get("confirm_error") if isinstance(stage_detail, dict) else None
    )
    return {
        "task_id": task_id,
        "image_url": task.get("image_url"),
        "street": (result or {}).get("recognized_street") or recog.get("street_name"),
        "city": (result or {}).get("recognized_city") or recog.get("city"),
        "district": recog.get("district"),
        "confidence": float(confidence) if confidence is not None else None,
        "low_confidence": _is_low_confidence(confidence),
        "confirm_error": confirm_error,
    }


def _parse_raw_response(raw: Any) -> dict[str, Any]:
    """ai_analysis_result.raw_response 可能是 dict（驱动已解码）或 str，统一成 dict。"""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, (str, bytes)):
        try:
            data = json.loads(raw)
        except (TypeError, ValueError):
            return {}
        if isinstance(data, dict):
            return data
    return {}


def confirm_location(task_id: int, street: str | None = None) -> dict[str, Any]:
    """用户确认地点，继续点评。立即返回，评分在后台跑。

    :param street: None/空 = 采用 AI 识别结果（已规范化，直接进评分）；
        非空 = 用户改写的地点，归一化放到后台（见 _run_confirm_override_phase），
        走的仍是 recognize_street() 这条与文字点评一致的归一化路径。
    :raises ValueError: 任务不存在或不处于 awaiting_confirm
    """
    with connection_scope() as conn:
        task = repo.get_ai_task(conn, task_id)
        if task is None:
            raise ValueError("任务不存在")
        if task["status"] != "awaiting_confirm":
            raise ValueError(f"任务当前状态为 {task['status']}，不处于待确认状态")
        result = repo.get_ai_result_by_task(conn, task_id)
        image_url = task.get("image_url")

    # 由 rel_url 还原磁盘路径供图片属性匹配使用（abs_path 不入库，
    # 与 annotation_import_service._run_embedding_job 的还原方式一致）
    image_path: str | None = None
    if image_url:
        image_path = str(Path(get_settings().upload_dir) / Path(image_url).name)

    override = (street or "").strip()
    if override:
        # 归一化要调 LLM，放后台跑，避免确认卡冻住等待
        with connection_scope() as conn:
            repo.update_ai_task(conn, task_id, status="analyzing")
        progress.update_progress(
            task_id,
            progress.STAGE_RECOGNIZE[1],
            progress.STAGE_RECOGNIZE[0],
            f"正在核对地点「{override}」",
        )
        _task_executor.submit(
            _run_confirm_override_phase, task_id, override, image_path
        )
        logger.info("任务 %s 用户改写地点为「%s」，后台归一化中", task_id, override)
        return {"task_id": task_id, "status": "analyzing"}

    # 采用 AI 识别结果：已规范化过，直接进评分
    recog_raw = _parse_raw_response((result or {}).get("raw_response"))
    street_name = (
        (result or {}).get("recognized_street") or recog_raw.get("street_name") or ""
    ).strip()
    city = (result or {}).get("recognized_city") or recog_raw.get("city")
    district = recog_raw.get("district")
    if not street_name:
        raise ValueError("未能识别出地点，请直接输入地点名称或重新上传照片")

    with connection_scope() as conn:
        repo.update_ai_task(conn, task_id, status="analyzing")
    _task_executor.submit(
        _run_scoring_phase, task_id, street_name, city, district, image_path
    )
    logger.info(
        "任务 %s 已确认 AI 识别的地点：街区=%s，城市=%s，继续评分",
        task_id, street_name, city,
    )
    return {
        "task_id": task_id,
        "status": "analyzing",
        "street": street_name,
        "city": city,
        "district": district,
    }


def _run_confirm_override_phase(
    task_id: int, override: str, image_path: str | None
) -> None:
    """后台：把用户输入的地点归一化，然后续跑评分。

    归一化失败不判 failed，而是退回待确认态带上提示 —— 照片还在，让用户重输或换图。
    """
    t_start = time.monotonic()
    try:
        check_cancel(task_id)
        recog = recognize_street(override, None, task_id)
    except _TaskCancelled:
        logger.info("任务 %s 已取消，地点核对提前结束", task_id)
        with connection_scope() as conn:
            repo.update_ai_task(
                conn, task_id, status="cancelled",
                current_stage="cancelled", stage_message="分析已取消",
            )
        _clear_cancel_flag(task_id)
        return
    except StreetNotRecognized as exc:
        logger.warning("任务 %s 地点「%s」无法识别：%s", task_id, override, exc)
        _back_to_awaiting_confirm(
            task_id, f"无法识别「{override}」，请换一个更具体的地点名称，或重新上传照片"
        )
        return
    except Exception as exc:  # noqa: BLE001 - 归一化失败退回确认，不毁掉整次点评
        logger.exception(
            "任务 %s 核对地点「%s」失败（%s: %s）",
            task_id, override, type(exc).__name__, exc,
        )
        _back_to_awaiting_confirm(task_id, f"核对地点失败：{exc}")
        return

    logger.info(
        "任务 %s 地点归一化完成：「%s」→ %s / %s",
        task_id, override, recog["street_name"], recog.get("city"),
    )
    _run_scoring_phase(
        task_id,
        recog["street_name"],
        recog.get("city"),
        recog.get("district"),
        image_path,
        confidence=recog.get("confidence"),
        t_start=t_start,
    )


def _back_to_awaiting_confirm(task_id: int, message: str) -> None:
    """退回待确认态，失败原因写 stage_detail.confirm_error 带给确认卡。

    不占用 error_message —— 那是「任务失败原因」，此刻任务并未失败。
    """
    detail: dict[str, Any] = {}
    try:
        with connection_scope() as conn:
            row = repo.get_task_progress(conn, task_id)
        if row and isinstance(row.get("stage_detail"), dict):
            detail = dict(row["stage_detail"])  # 保留 low_confidence
    except Exception:  # noqa: BLE001
        logger.warning("任务 %s 读取 stage_detail 失败，仅写入本次提示", task_id)
    detail["confirm_error"] = message

    progress.update_progress(
        task_id,
        progress.STAGE_AWAIT_CONFIRM[1],
        progress.STAGE_AWAIT_CONFIRM[0],
        progress.STAGE_AWAIT_CONFIRM[2],
        stage_detail=detail,
    )
    with connection_scope() as conn:
        # 条件更新：期间若被取消，不把 cancelled 复活
        moved = repo.set_task_awaiting_confirm(conn, task_id)
    if not moved:
        logger.info("任务 %s 已终止，不再退回待确认态", task_id)
    _clear_cancel_flag(task_id)


def _run_pipeline(
    task_id: int, content: str | None, city_hint: str | None, image_path: str | None = None
) -> None:
    """后台执行整条评价链（识别 → 评分 → 报告），逐阶段更新进度。

    输入来源二选一：image_path 非空走识图分支，否则走文字分支；识别后阶段一致。

    这是**文字点评**的链路，也是照片地点确认开关关闭时照片点评走的链路 ——
    保持与接入确认流程之前完全一致的行为。识别之后的部分委托给
    _run_scoring_phase（两条路径共用），本函数只负责识别与异常兜底。
    """
    t_start = time.monotonic()
    logger.info(
        "任务 %s 开始：input_type=%s, city_hint=%s",
        task_id, "image" if image_path else "text", city_hint or "-",
    )
    try:
        with connection_scope() as conn:
            repo.update_ai_task(conn, task_id, status="analyzing")

        # ① 识别（文字 / 图片分支，返回结构一致）
        check_cancel(task_id)
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
    except _TaskCancelled:
        logger.info("任务 %s 已取消，识别阶段提前结束", task_id)
        with connection_scope() as conn:
            repo.update_ai_task(
                conn, task_id, status="cancelled",
                current_stage="cancelled", stage_message="分析已取消",
            )
        _clear_cancel_flag(task_id)
        return
    except StreetNotRecognized as exc:
        # 模型正常作答「认不出」，属预期结果而非故障：记 WARNING 且不打堆栈。
        logger.warning(
            "任务 %s 未能识别街道，已终止（总耗时 %.1fs）：%s",
            task_id, time.monotonic() - t_start, exc,
        )
        with connection_scope() as conn:
            repo.update_ai_task(
                conn, task_id, status="failed",
                stage_message="未能识别街道", error_message=str(exc)[:500],
            )
        _clear_cancel_flag(task_id)
        return
    except Exception as exc:  # noqa: BLE001 - 后台任务统一兜底，写明失败原因
        logger.exception(
            "任务 %s 失败（%s: %s），总耗时 %.1fs",
            task_id, type(exc).__name__, exc, time.monotonic() - t_start,
        )
        with connection_scope() as conn:
            repo.update_ai_task(
                conn, task_id, status="failed",
                stage_message="分析失败", error_message=str(exc)[:500],
            )
        _clear_cancel_flag(task_id)
        return
    # 注意：识别成功的分支不在此清取消标志 —— 紧接着要调 _run_scoring_phase，
    # 它的 finally 会清。这里提前清会让「识别期间点的取消」对评分阶段失效。

    # ② 之后的全部阶段（建街巷 → 评分 → 报告），与确认流程共用
    _run_scoring_phase(
        task_id,
        street_name,
        recog.get("city"),
        recog.get("district"),
        image_path,
        confidence=recog.get("confidence"),
        t_start=t_start,
    )


def _run_scoring_phase(
    task_id: int,
    street_name: str,
    city: str | None,
    district: str | None,
    image_path: str | None = None,
    *,
    confidence: float | None = None,
    t_start: float | None = None,
) -> None:
    """地点既定之后的全部阶段：建街巷/评价 → 图片属性 → 画像 → 评分 → 报告。

    两条路径共用：
    - _run_pipeline（文字点评、照片确认开关关闭）识别完直接调用
    - confirm_location（照片确认流程）在用户确认地点后提交为独立后台任务

    :param confidence: 识别置信度，仅用于落 ai_analysis_result；确认流程里该行
        已由第一段写好，此时传 None 表示只回填 matched_street_id 而不重复插入。
    :param t_start: 计时起点；确认流程中第二段独立计时。
    """
    evaluation_id: int | None = None
    if t_start is None:
        t_start = time.monotonic()
    try:
        # 建街巷 + 评价表头 + 识别结果（短事务）
        check_cancel(task_id)
        with connection_scope() as conn:
            street_id = repo.get_or_create_street(conn, street_name, city, district)
            evaluation_id = repo.create_evaluation(
                conn, street_id, task_no=None, source="ai", status="analyzing"
            )
            repo.update_ai_task(conn, task_id, evaluation_id=evaluation_id)
            existing = repo.get_ai_result_by_task(conn, task_id)
            if existing is None:
                repo.create_ai_result(
                    conn, task_id,
                    recognized_street=street_name,
                    recognized_city=city,
                    confidence=confidence,
                    matched_street_id=street_id,
                    raw_response=json.dumps(
                        {
                            "street_name": street_name,
                            "city": city,
                            "district": district,
                            "confidence": confidence,
                        },
                        ensure_ascii=False,
                    ),
                )
            else:
                # 确认流程：第一段已写过识别结果，这里只回填最终采用的 street_id，
                # 并把用户改写后的地点覆盖进去（否则留着 AI 的原始猜测会误导追溯）
                repo.update_ai_result_street(
                    conn, task_id,
                    street_id=street_id,
                    recognized_street=street_name,
                    recognized_city=city,
                )
            profile_facts = retriever.get_retriever().retrieve(
                conn, street_id, street_name
            )
            metric_tree = repo.fetch_metric_tree(conn)

        # ①.5 图片属性匹配（仅照片点评；文字点评整段跳过）
        if image_path:
            check_cancel(task_id)
            progress.set_stage(task_id, progress.STAGE_MATCH_IMAGE)
            match_image_attributes(task_id, evaluation_id, image_path, metric_tree)

        # ② 画像事实（POI 召回 → 按维度裁剪，无 POI 时各维度走兜底）
        progress.set_stage(task_id, progress.STAGE_PROFILE)
        if profile_facts.has_data:
            prof = profile_facts.profile or {}
            logger.info(
                "任务 %s 命中 POI 画像：街区=%s，POI 总数=%s，标签=%s",
                task_id, street_name, prof.get("poi_count"),
                profile_facts.poi_summary,
            )
            logger.info(
                "任务 %s 画像 facts（总览，实际按维度裁剪后下发）：\n%s",
                task_id, profile_facts.to_prompt_facts(),
            )
        else:
            logger.info(
                "任务 %s 未命中 POI 画像，评分将走「暂无结构化事实」兜底", task_id
            )

        # ③ 并发评分（内部逐维度按 dim_code 裁剪 facts + 更新进度）
        check_cancel(task_id)
        scored = score_all_metrics(street_name, metric_tree, profile_facts, task_id)
        metric_scores = {mid: v["score"] for mid, v in scored.items()}

        # ④ 聚合
        aggregated = scoring_service.aggregate(metric_tree, metric_scores)

        # ⑤ 报告
        check_cancel(task_id)
        progress.set_stage(task_id, progress.STAGE_REPORT)
        summary = generate_report(
            street_name, aggregated["total_score"], aggregated["dimension_scores"], task_id
        )

        # 入库（一个事务：明细 + 维度聚合 + 回写表头）
        check_cancel(task_id)
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
    except _TaskCancelled:
        # 协作式取消：DB 状态已由 request_cancel 置为 cancelled，这里只收尾。
        logger.info(
            "任务 %s 已取消，提前结束（总耗时 %.1fs）",
            task_id, time.monotonic() - t_start,
        )
        with connection_scope() as conn:
            if evaluation_id is not None:
                repo.mark_evaluation_failed(conn, evaluation_id)
            # 兜底确保终态（request_cancel 已写过，这里幂等覆盖文案）
            repo.update_ai_task(
                conn, task_id, status="cancelled",
                current_stage="cancelled", stage_message="分析已取消",
            )
    except Exception as exc:  # noqa: BLE001 - 后台任务统一兜底，写明失败原因
        # 此处不再捕 StreetNotRecognized：识别发生在本函数之前（_run_pipeline 或
        # _run_recognize_phase），进到这里时地点已经定了，该异常不可能出现。
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
    finally:
        _clear_cancel_flag(task_id)


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
                "input_type": r.get("input_type"),
                "created_at": created.isoformat() if created is not None else None,
            }
        )
    return items


def delete_evaluation(evaluation_id: int) -> bool:
    """物理删除一条评价及其全部关联数据。返回是否删除成功(False=不存在)。"""
    with connection_scope() as conn:
        affected = repo.delete_evaluation(conn, evaluation_id)
    return affected > 0


def delete_evaluations(evaluation_ids: list[int]) -> int:
    """批量物理删除评价，返回成功删除的条数（同一事务）。"""
    ids = [int(i) for i in evaluation_ids]
    if not ids:
        return 0
    with connection_scope() as conn:
        return repo.delete_evaluations(conn, ids)


def get_result(evaluation_id: int) -> dict[str, Any] | None:
    """查询评价结果，组装为响应字典。

    按「分析管理」显示配置（analytics_display_config）做服务端过滤：
    关闭的区块对应字段直接清空/不下发，并在 enabled_blocks 里告知前端哪些区块可渲染。
    维度聚合分（dimension_scores / sub_dimension_scores）是明细分组的结构依赖，
    只要相关区块任一开启就保留；纯展示性区块（雷达图/拆解）由前端按 enabled_blocks 决定渲染。
    image_attributes（图片属性标签）挂在三级指标行上，故额外依赖 metric_score 区块。
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
        image_attr_rows = repo.fetch_evaluation_image_attributes(conn, evaluation_id)
        similar_rows = (
            repo.fetch_evaluation_image_candidates(
                conn,
                evaluation_id,
                min_similarity=get_settings().annotation_similar_min_similarity,
            )
            if "similar_streets" in blocks
            else []
        )

    # 维度名映射：跨所有模板的全量 id→名称（历史评价按当时模板的维度名还原，
    # 不受当前启用模板影响）
    with connection_scope() as conn:
        name_map = repo.fetch_dimension_name_map(conn)
    dim_name = name_map["dim"]
    sub_name = name_map["sub"]
    sub_dim = name_map["sub_parent"]
    dim_weight = name_map["dim_weight"]
    sub_weight = name_map["sub_weight"]

    # ── 按显示配置过滤字段 ──
    # 一级维度分被雷达图 / 一级拆解 / 二三级明细共同依赖（分组与标签），任一开启即保留
    need_dimensions = bool(
        blocks & {"radar_chart", "dimension_break", "sub_dimension", "metric_score"}
    )
    dimension_scores = (
        [
            {
                "dim_id": r["ref_id"],
                "dim_name": dim_name.get(r["ref_id"], ""),
                "score": float(r["score"]),
                "weight": dim_weight.get(r["ref_id"]),
            }
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
                "weight": sub_weight.get(r["ref_id"]),
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
                "weight": (
                    float(r["metric_weight"]) if r["metric_weight"] is not None else None
                ),
            }
            for r in metric_rows
        ]
        if "metric_score" in blocks
        else []
    )
    # 图片属性：照片点评才有；依赖三级指标区块（属性标签挂在指标行上，
    # 指标行不渲染时属性无处可挂）
    image_attributes = (
        [
            {
                "metric_id": r["metric_id"],
                "metric_name": r["metric_name"],
                "grade_word": r["grade_word"],
            }
            for r in image_attr_rows
            if r.get("metric_id") is not None and r.get("grade_word")
        ]
        if blocks & {"image_attribute"} and "metric_score" in blocks
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
        "image_attributes": image_attributes,
        "similar_annotations": similar_rows,
    }
