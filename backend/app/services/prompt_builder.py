"""Prompt 构造。

三类 Prompt：
- 街巷识别（recognize）：从用户文本中提取规范街巷名 + 城市
- 指标评分（score）：按一级维度分批，让模型对该批三级指标各打 1~5 整数
- 报告生成（report）：依据各维度得分写综合画像

评分采用 1~5 整数档（5 极高 / 4 较高 / 3 一般 / 2 较低 / 1 极低），
对齐数据库 street_metric_score.score 的取值，避免 0~100 再换算带来的失真。
"""

from __future__ import annotations

import json
from typing import Any

# ──────────────── 街巷识别 ────────────────

RECOGNIZE_SYSTEM = (
    "你是一名中国城市街区识别专家。根据用户输入，判断其指向的街巷/街区。"
    "只返回 JSON，不要多余文字。"
)


def build_recognize_prompt(content: str, city_hint: str | None) -> str:
    hint = f"\n用户提供的城市线索：{city_hint}" if city_hint else ""
    return (
        f"用户输入：{content}{hint}\n\n"
        "请识别并返回如下 JSON：\n"
        "{\n"
        '  "streetName": "规范的街巷名称，如 南京东路",\n'
        '  "city": "所属城市，如 上海，未知填 null",\n'
        '  "district": "所属行政区，如 黄浦区，未知填 null",\n'
        '  "confidence": 0~1 的置信度数字\n'
        "}"
    )


# ──────────────── 指标评分（分批） ────────────────

SCORE_SYSTEM = (
    "你是一名资深的城市街区时尚度评价专家。"
    "你将依据给定的评价指标，对一条街区逐项打分。"
    "评分为整数，取值 1~5：5=极高，4=较高，3=一般，2=较低，1=极低。"
    "请基于常识与所给事实客观判断，对每个指标给出分数与简短理由。"
    "只返回 JSON，不要多余文字。"
)


def build_score_prompt(
    street_name: str,
    dim_name: str,
    metrics: list[dict[str, Any]],
    facts_text: str,
) -> str:
    """构造单个一级维度的评分 Prompt。

    :param metrics: 该维度下的三级指标 [{metric_id, metric_code, metric_name, metric_desc}]
    :param facts_text: 街巷事实包（MVP 为画像文本；无则给出说明）
    """
    metric_lines = []
    for m in metrics:
        desc = f"（观察要点：{m['metric_desc']}）" if m.get("metric_desc") else ""
        metric_lines.append(
            f"- code={m['metric_code']}｜{m['metric_name']}{desc}"
        )
    metrics_block = "\n".join(metric_lines)

    facts = facts_text.strip() or "（暂无结构化事实数据，请基于该街区的公开常识进行合理评估。）"

    return (
        f"待评价街区：{street_name}\n"
        f"当前评价维度：{dim_name}\n\n"
        f"【街区事实】\n{facts}\n\n"
        f"【本批需打分的指标（共 {len(metrics)} 项）】\n{metrics_block}\n\n"
        "请对以上每个指标打分，返回如下 JSON：\n"
        "{\n"
        '  "scores": [\n'
        '    {"code": "指标code", "score": 1到5的整数, "reason": "简短理由"}\n'
        "  ]\n"
        "}\n"
        "注意：scores 必须覆盖本批全部指标，code 必须与上面给出的完全一致。"
    )


# ──────────────── 报告生成 ────────────────

REPORT_SYSTEM = (
    "你是一名城市街区分析报告撰写专家。依据各维度评分，"
    "撰写一段凝练、专业、可读的中文综合评价。只返回 JSON。"
)


def build_report_prompt(
    street_name: str,
    total_score: float,
    dimension_scores: list[dict[str, Any]],
) -> str:
    dim_block = "\n".join(
        f"- {d['dim_name']}：{d['score']} 分" for d in dimension_scores
    )
    return (
        f"街区：{street_name}\n"
        f"综合时尚度评分（5 分制）：{total_score}\n"
        f"各一级维度得分：\n{dim_block}\n\n"
        "请生成如下 JSON：\n"
        "{\n"
        '  "summary": "150字以内的综合画像，概括该街区的时尚度特征",\n'
        '  "strengths": ["优势1", "优势2"],\n'
        '  "weaknesses": ["短板1", "短板2"],\n'
        '  "suggestions": ["提升建议1", "提升建议2"]\n'
        "}"
    )


def group_metrics_by_dimension(
    metric_tree: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """把 75 个三级指标按一级维度分组，得到 5 批。"""
    dims: dict[int, dict[str, Any]] = {}
    for row in metric_tree:
        d = dims.setdefault(
            row["dim_id"],
            {
                "dim_id": row["dim_id"],
                "dim_code": row.get("dim_code"),
                "dim_name": row["dim_name"],
                "dim_sort": row["dim_sort"],
                "metrics": [],
            },
        )
        d["metrics"].append(
            {
                "metric_id": row["metric_id"],
                "metric_code": row["metric_code"],
                "metric_name": row["metric_name"],
                "metric_desc": row.get("metric_desc"),
            }
        )
    return sorted(dims.values(), key=lambda x: x["dim_sort"])


def render_report_summary(report: dict[str, Any]) -> str:
    """把报告 JSON 拼成入库用的 ai_summary 文本。"""
    parts = [report.get("summary", "").strip()]
    if report.get("strengths"):
        parts.append("【优势】" + "；".join(report["strengths"]))
    if report.get("weaknesses"):
        parts.append("【短板】" + "；".join(report["weaknesses"]))
    if report.get("suggestions"):
        parts.append("【建议】" + "；".join(report["suggestions"]))
    return "\n".join(p for p in parts if p)


# ──────────────── 占位符变量构造 ────────────────

def build_metrics_block(metrics: list[dict[str, Any]]) -> str:
    """把指标列表渲染成给模型阅读的清单文本。"""
    lines = []
    for m in metrics:
        desc = f"（观察要点：{m['metric_desc']}）" if m.get("metric_desc") else ""
        lines.append(f"- code={m['metric_code']}｜{m['metric_name']}{desc}")
    return "\n".join(lines)


def build_dim_block(dimension_scores: list[dict[str, Any]]) -> str:
    return "\n".join(f"- {d['dim_name']}：{d['score']} 分" for d in dimension_scores)


# ──────────────── 模板渲染（DB 可配 + 硬编码兜底） ────────────────

# 硬编码默认模板：表里查不到对应 (stage, dim_code) 时回退使用，
# user_template 用 {占位符}，与 seed 中入库的模板保持一致。

_DEFAULT_TEMPLATES: dict[str, dict[str, str]] = {
    "recognize": {
        "system": RECOGNIZE_SYSTEM,
        "user": (
            "用户输入：{content}{city_hint}\n\n"
            "请识别并返回如下 JSON：\n"
            "{{\n"
            '  "streetName": "规范的街巷名称，如 南京东路",\n'
            '  "city": "所属城市，如 上海，未知填 null",\n'
            '  "district": "所属行政区，如 黄浦区，未知填 null",\n'
            '  "confidence": 0~1 的置信度数字\n'
            "}}"
        ),
    },
    "score": {
        "system": SCORE_SYSTEM,
        "user": (
            "待评价街区：{street_name}\n"
            "当前评价维度：{dim_name}\n\n"
            "【街区事实】\n{facts}\n\n"
            "【本批需打分的指标（共 {metric_count} 项）】\n{metrics_block}\n\n"
            "请对以上每个指标打分，返回如下 JSON：\n"
            "{{\n"
            '  "scores": [\n'
            '    {{"code": "指标code", "score": 1到5的整数, "reason": "简短理由"}}\n'
            "  ]\n"
            "}}\n"
            "注意：scores 必须覆盖本批全部指标，code 必须与上面给出的完全一致。"
        ),
    },
    "report": {
        "system": REPORT_SYSTEM,
        "user": (
            "街区：{street_name}\n"
            "综合时尚度评分（5 分制）：{total_score}\n"
            "各一级维度得分：\n{dim_block}\n\n"
            "请生成如下 JSON：\n"
            "{{\n"
            '  "summary": "150字以内的综合画像，概括该街区的时尚度特征",\n'
            '  "strengths": ["优势1", "优势2"],\n'
            '  "weaknesses": ["短板1", "短板2"],\n'
            '  "suggestions": ["提升建议1", "提升建议2"]\n'
            "}}"
        ),
    },
}


class RenderedPrompt:
    """模板渲染结果：system / user 文本 + 可选模型与温度覆盖。"""

    def __init__(
        self,
        system: str,
        user: str,
        model: str | None = None,
        temperature: float | None = None,
    ) -> None:
        self.system = system
        self.user = user
        self.model = model
        self.temperature = temperature


def render_template(
    conn,
    stage: str,
    *,
    dim_code: str | None = None,
    variables: dict[str, Any],
) -> RenderedPrompt:
    """取 (stage, dim_code) 模板并用 variables 填充；查不到则用硬编码默认。

    :param conn: 已开启的数据库连接（由调用方提供，避免重复开连接）
    """
    from app.db import repository as repo  # 局部导入避免循环依赖

    tpl = repo.get_prompt_template(conn, stage, dim_code)
    if tpl:
        system = tpl["system_prompt"] or ""
        user_tpl = tpl["user_template"]
        model = tpl["model"]
        temperature = float(tpl["temperature"]) if tpl["temperature"] is not None else None
    else:
        default = _DEFAULT_TEMPLATES[stage]
        system = default["system"]
        user_tpl = default["user"]
        model = None
        temperature = None

    try:
        user = user_tpl.format(**variables)
    except (KeyError, IndexError, ValueError):
        # 模板占位符与变量不匹配时，回退到硬编码默认，保证不中断
        user = _DEFAULT_TEMPLATES[stage]["user"].format(**variables)
        system = system or _DEFAULT_TEMPLATES[stage]["system"]

    return RenderedPrompt(system=system, user=user, model=model, temperature=temperature)

