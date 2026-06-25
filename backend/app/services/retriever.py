"""街巷知识检索（表现层）。

把 street_profile 的稳定事实（数值字段 + extra_stats 摘要）组装成喂给评分 LLM
的 facts 文本。所有面向 LLM 的文案都在这里临时生成——改文案/换模型不用动库。

当前仅 StructuredRetriever（查 DB 聚合）；get_retriever() 工厂是未来插入
VectorRetriever / CompositeRetriever（向量召回小红书/历史/点评）的唯一开关点。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.services import profile_service

# 细分类英文标签 → 中文短语（用于 facts 文本展示）
LABEL_CN: dict[str, str] = {
    "boutique_cafe": "精品咖啡",
    "chain_cafe": "连锁咖啡",
    "designer_store": "设计师/买手店",
    "luxury_store": "奢侈品/旗舰",
    "gallery": "画廊艺术",
    "bookstore": "书店",
    "nightlife": "酒吧夜生活",
    "vintage": "古着复古",
    "restaurant": "餐厅",
}


def _cn(label: str) -> str:
    return LABEL_CN.get(label, label)


def _parse_extra(raw: Any) -> dict[str, Any]:
    """extra_stats 可能是 dict（驱动已解码 JSON 列）或 str（文本），统一成 dict。"""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, (str, bytes)):
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return {}
    return {}


def _pct(ratio: Any) -> str | None:
    """0~1 比例转百分比字符串；None 返回 None。"""
    if ratio is None:
        return None
    return f"{round(float(ratio) * 100)}%"


@dataclass
class StreetFacts:
    """一次检索得到的街巷事实包（结构化，可被多种表现层消费）。"""

    poi_summary: dict[str, int] = field(default_factory=dict)
    poi_highlights: dict[str, list[str]] = field(default_factory=dict)
    profile: dict[str, Any] | None = None
    has_data: bool = False

    def to_prompt_facts(self) -> str:
        """序列化成结构化标签格式喂给 {facts}。

        用 [SECTION] key:value 而非自然语言句子——跨模型（Qwen/DeepSeek/
        Claude/GPT）结构一致，prompt 更稳。无数据返回 ""（交给下游兜底）。
        """
        if not self.has_data:
            return ""

        prof = self.profile or {}
        lines: list[str] = ["[POI_SUMMARY]"]
        for label, count in sorted(
            self.poi_summary.items(), key=lambda kv: kv[1], reverse=True
        ):
            lines.append(f"{_cn(label)}:{count}")
        # 关键比例指标同段附上
        metrics: list[str] = []
        if (cr := _pct(prof.get("chain_ratio"))) is not None:
            metrics.append(f"连锁占比:{cr}")
        if (hr := _pct(prof.get("high_rating_ratio"))) is not None:
            metrics.append(f"高评分占比:{hr}")
        if prof.get("avg_rating") is not None:
            metrics.append(f"平均评分:{prof['avg_rating']}")
        if prof.get("avg_price") is not None:
            metrics.append(f"人均:{round(float(prof['avg_price']))}元")
        if metrics:
            lines.append("  ".join(metrics))

        if self.poi_highlights:
            lines.append("")
            lines.append("[POI_HIGHLIGHTS]")
            for label, names in self.poi_highlights.items():
                lines.append(f"{_cn(label)}: {'、'.join(names)}")

        lines.append("")
        lines.append("[STREET_PROFILE]")
        lines.append(build_profile_text(self.poi_summary, self.poi_highlights, prof))
        return "\n".join(lines)


def build_profile_text(
    poi_summary: dict[str, int],
    poi_highlights: dict[str, list[str]],
    profile: dict[str, Any],
) -> str:
    """由稳定事实临时生成一句话画像定位（不调 LLM）。"""
    poi_count = profile.get("poi_count") or 0
    chain_ratio = profile.get("chain_ratio")
    # 业态倾向：取计数最高的前两类
    top = sorted(poi_summary.items(), key=lambda kv: kv[1], reverse=True)[:2]
    top_desc = "、".join(_cn(l) for l, _ in top) if top else "综合业态"

    if chain_ratio is not None and float(chain_ratio) >= 0.5:
        tone = "以连锁与大众零售为主的成熟商业街区"
    elif chain_ratio is not None and float(chain_ratio) <= 0.25:
        tone = "以独立主理人小店为主、连锁稀少的高调性街区"
    else:
        tone = "独立小店与连锁品牌并存的街区"

    return f"收录商户 {poi_count} 家，{tone}，业态集中于{top_desc}。"


class StreetKnowledgeRetriever(Protocol):
    """街巷知识检索接口。未来 VectorRetriever 实现同签名即可互换。"""

    def retrieve(self, conn, street_id: int, street_name: str) -> StreetFacts: ...


class StructuredRetriever:
    """结构化检索：按 street_id 查 DB 聚合画像（按需触发构建）。"""

    def retrieve(self, conn, street_id: int, street_name: str) -> StreetFacts:
        prof = profile_service.get_or_build_profile(conn, street_id)
        if not prof:
            return StreetFacts()
        extra = _parse_extra(prof.get("extra_stats"))
        return StreetFacts(
            poi_summary=extra.get("poi_summary", {}),
            poi_highlights=extra.get("poi_highlights", {}),
            profile=prof,
            has_data=True,
        )


def get_retriever() -> StreetKnowledgeRetriever:
    """检索器工厂。未来按 config 切换/组合向量召回的唯一开关点。"""
    return StructuredRetriever()
