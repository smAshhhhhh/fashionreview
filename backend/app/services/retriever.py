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
    "gallery_culture": "画廊/文化",
    "bookstore": "书店",
    "nightlife": "酒吧夜生活",
    "vintage": "古着复古",
    "restaurant": "餐厅",
    "western_dining": "西式餐饮",
    "internet_famous": "网红/打卡",
}

# 维度 → 关心的标签（标签即 fashion_tags / poi_highlights 的 key）。
# tag 驱动：新增维度只需在此加一行，build_relevant_facts 拼装逻辑零改动。
_DIM_TAGS: dict[str, list[str]] = {
    "BUSINESS": ["western_dining", "boutique_cafe", "chain_cafe",
                 "designer_store", "luxury_store"],
    "VITALITY": ["internet_famous", "nightlife", "boutique_cafe"],
    "INFLUENCE": ["internet_famous", "designer_store", "luxury_store"],
    "CULTURE": ["gallery_culture", "bookstore", "vintage"],
    # 空间美学的 proxy：设计感/文化业态侧面反映街区调性，仍给少量
    "SPACE": ["gallery_culture", "designer_store"],
}


def _cn(label: str) -> str:
    base = label.removesuffix("_count").removesuffix("_pct")
    return LABEL_CN.get(base, base)


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

    def _tag_count(self, tag: str) -> int:
        """从 poi_summary 取某标签计数（兼容带/不带 _count 后缀的 key）。"""
        s = self.poi_summary or {}
        if tag in s:
            return int(s[tag] or 0)
        if f"{tag}_count" in s:
            return int(s[f"{tag}_count"] or 0)
        return 0

    def _street_profile_block(self) -> str:
        """精简总画像段：所有维度共用，保底不空。紧凑 key:value。"""
        prof = self.profile or {}
        parts: list[str] = []
        if prof.get("poi_count") is not None:
            parts.append(f"{prof['poi_count']} POIs")
        if prof.get("avg_rating") is not None:
            parts.append(f"avg rating {prof['avg_rating']}")
        if (cr := _pct(prof.get("chain_ratio"))) is not None:
            parts.append(f"chain {cr}")
        if prof.get("avg_price") is not None:
            parts.append(f"人均 {round(float(prof['avg_price']))}元")
        return "[STREET_PROFILE]\n" + ("  ".join(parts) if parts else "（基础画像数据不足）")

    def build_relevant_facts(self, tags: list[str], *, highlight_limit: int = 3) -> str:
        """按标签拼该维度相关事实：标签计数 + 代表品牌(≤limit) + 派生特征。

        只挑 tags 列出的标签；计数为 0 的跳过。无任何相关事实时返回 ""。
        """
        lines: list[str] = []
        for tag in tags:
            count = self._tag_count(tag)
            if count <= 0:
                continue
            names = (self.poi_highlights or {}).get(tag, [])[:highlight_limit]
            if names:
                lines.append(f"{_cn(tag)}:{count}（代表：{'、'.join(names)}）")
            else:
                lines.append(f"{_cn(tag)}:{count}")

        # 1~2 条派生特征：连锁占比高/低，侧面反映街区调性
        prof = self.profile or {}
        cr = prof.get("chain_ratio")
        if cr is not None:
            crf = float(cr)
            if crf <= 0.25:
                lines.append("独立店比例高")
            elif crf >= 0.5:
                lines.append("连锁品牌主导")

        if not lines:
            return ""
        return "[RELEVANT_FACTS]\n" + "  ".join(lines)

    def to_prompt_facts_for(self, dim_code: str | None) -> str:
        """按维度产出定制 facts：总画像段 + 该维度相关事实段。

        未知维度/空 tag 仍返回总画像段（不留空）。无数据返回 ""（走兜底）。
        """
        if not self.has_data:
            return ""
        blocks = [self._street_profile_block()]
        relevant = self.build_relevant_facts(_DIM_TAGS.get(dim_code or "", []))
        if relevant:
            blocks.append(relevant)
        return "\n".join(blocks)

    def to_prompt_facts(self) -> str:
        """总画像 + 全部标签的相关事实（无参，供资源中心预览 / 向后兼容）。"""
        if not self.has_data:
            return ""
        all_tags = list(LABEL_CN.keys())
        blocks = [self._street_profile_block()]
        relevant = self.build_relevant_facts(all_tags)
        if relevant:
            blocks.append(relevant)
        return "\n".join(blocks)


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
            poi_summary=extra.get("fashion_tags", extra.get("poi_summary", {})),
            poi_highlights=extra.get("poi_highlights", {}),
            profile=prof,
            has_data=True,
        )


def get_retriever() -> StreetKnowledgeRetriever:
    """检索器工厂。未来按 config 切换/组合向量召回的唯一开关点。"""
    return StructuredRetriever()
