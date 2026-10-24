"""评价相关的请求 / 响应模型。"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


# ──────────────── 请求 ────────────────

class TextAnalyzeRequest(BaseModel):
    """文本输入分析请求。"""

    content: str = Field(..., min_length=1, description="街巷名称或描述文本，如『南京东路』")
    city: str | None = Field(None, description="可选，城市，辅助消歧")


class BatchDeleteRequest(BaseModel):
    """批量删除评价请求。"""

    evaluation_ids: list[int] = Field(..., min_length=1, description="待删除的 evaluation_id 列表")


# ──────────────── LLM 评分中间结构 ────────────────

class MetricScoreItem(BaseModel):
    """单个三级指标的打分结果（LLM 产出 / 入库前的中间态）。"""

    metric_id: int
    metric_code: str
    score: int = Field(..., ge=1, le=5, description="整数 1~5")
    reason: str = ""


# ──────────────── 响应 ────────────────

class DimensionScoreOut(BaseModel):
    """一级维度聚合分（雷达图轴）。"""

    dim_id: int
    dim_name: str
    score: float
    weight: float | None = None


class SubDimensionScoreOut(BaseModel):
    sub_id: int
    sub_name: str
    dim_id: int
    score: float
    weight: float | None = None


class MetricScoreOut(BaseModel):
    metric_id: int
    metric_code: str
    metric_name: str
    sub_id: int
    dim_id: int
    score: int
    reason: str | None = None
    weight: float | None = None


class ImageAttributeOut(BaseModel):
    """一条图片属性（匹配人工标注库得到）。

    挂在三级指标行上渲染，故 metric_id 必有值（解析不到的已在服务层过滤）。
    本版只下发成语原文，不折算分值、不下发相似度与标注图信息。
    """

    metric_id: int
    metric_name: str | None = None
    grade_word: str


class SimilarStreetOut(BaseModel):
    """历史点评中维度画像相似的一个街区（「相似审美节点」区块）。"""

    evaluation_id: int
    street: str
    city: str | None = None
    district: str | None = None
    total_score: float | None = None
    image_url: str | None = None
    similarity: float  # 二级维度分的皮尔逊相关
    shared_strengths: list[str] = []  # 两条街都高于自身均分的一级维度名


class AnalyzeAccepted(BaseModel):
    """提交分析后的受理响应（异步：此刻只有 task_id）。"""

    task_id: int
    status: str


# ──────────────── 照片地点确认 ────────────────

class ConfirmInfoOut(BaseModel):
    """待确认的识别地点详情（供确认卡预填）。"""

    task_id: int
    # 上传原图相对路径 /static/uploads/...，供确认卡展示让用户对照判断
    image_url: str | None = None
    street: str | None = None
    city: str | None = None
    district: str | None = None
    confidence: float | None = None
    # True 表示模型置信度低于阈值：前端应改成「未能确定地点，请直接输入」的文案
    low_confidence: bool = False
    # 上一次改写地点归一化失败的原因（如输入的地点无法识别）；首次进入为 None。
    # 归一化在后台进行，失败时任务退回待确认态，靠这个字段告诉用户为什么
    confirm_error: str | None = None


class ConfirmLocationRequest(BaseModel):
    """确认地点请求。

    street 省略/为空 = 采用 AI 识别结果；非空 = 用户改写的地点，服务端会调
    recognize_street() 把这行文本规范化（与文字点评同一条归一化路径）。
    """

    street: str | None = Field(
        None, max_length=200, description="用户改写的地点名称；为空表示采用识别结果"
    )


class ConfirmLocationResult(BaseModel):
    """确认后的受理响应：任务已回到 analyzing，后续在后台继续。

    采用 AI 识别结果时地点已规范化，三个地点字段直接回填；用户改写地点时归一化
    在后台进行（要调一次 LLM，不能让前端等），此刻尚不知规范化结果，故均为 None。
    前端无论哪种情况都只需切回时间线看进度。
    """

    task_id: int
    status: str
    street: str | None = None
    city: str | None = None
    district: str | None = None


# ──────────────── 街区类型选择 ────────────────

class DimensionLabelOut(BaseModel):
    """当前启用模板的一级维度（类型权重按 code 对应）。"""

    code: str
    name: str


class TypeOptionOut(BaseModel):
    """选择卡上的一个街区类型。match_score 为 None 表示 AI 未给出匹配度。"""

    id: int
    code: str
    name: str
    description: str | None = None
    weights: dict[str, float] = {}
    match_score: float | None = None
    reason: str | None = None


class TypeInfoOut(BaseModel):
    """待选类型详情：types 已按匹配度降序。"""

    task_id: int
    image_url: str | None = None
    street: str | None = None
    city: str | None = None
    district: str | None = None
    has_candidates: bool = False
    recommended_type_id: int | None = None
    dimensions: list[DimensionLabelOut] = []
    types: list[TypeOptionOut] = []


class ConfirmTypeRequest(BaseModel):
    street_type_id: int = Field(..., ge=1, description="用户选定的街区类型 id")


class ConfirmTypeResult(BaseModel):
    task_id: int
    status: str
    street_type_id: int


class StreetTypeOut(BaseModel):
    """街区类型（指标体系页的分组）。权重由该类型分组下的指标模板承载。"""

    id: int
    code: str
    name: str
    description: str | None = None
    sort_no: int = 0


class StreetTypeUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=2000)

    @field_validator("name")
    @classmethod
    def nonblank_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("类型名称不能留空")
        return value.strip()


class StreetTypeTag(BaseModel):
    """结果页展示的类型标签。"""

    code: str
    name: str


class TemplateSourceOut(BaseModel):
    """评价所用的指标模板来源。deleted=True 表示该模板已被（软）删除。"""

    group: str
    name: str
    deleted: bool = False


class TaskProgressOut(BaseModel):
    """任务进度（SSE / 轮询）。"""

    task_id: int
    status: str
    progress: int = 0
    current_stage: str | None = None
    stage_message: str | None = None
    # 阶段结构化明细。评分阶段为 {"all": [...], "done": [{"name","ok"}...], "total": N}，
    # done 的顺序即真实完成顺序。老任务 / 非评分阶段为 None，前端需按 null 降级。
    stage_detail: dict[str, Any] | None = None
    evaluation_id: int | None = None
    error_message: str | None = None
    text_input: str | None = None  # 用户提交的原始街道名，供进度页标题展示


class EvaluationResult(BaseModel):
    """评价结果查询响应。"""

    evaluation_id: int
    street: str
    status: str
    total_score: float | None = None
    summary: str | None = None
    image_url: str | None = None  # 上传原图相对路径；文字任务为街道封面（高德图片 URL）或 None
    enabled_blocks: list[str] = []  # 启用中的展示区块 block_key，前端据此渲染
    street_type: StreetTypeTag | None = None  # 用户选定的街区类型；未选为 None
    template_source: TemplateSourceOut | None = None  # 评测所用模板；无评分明细为 None
    dimension_scores: list[DimensionScoreOut] = []
    sub_dimension_scores: list[SubDimensionScoreOut] = []
    metric_scores: list[MetricScoreOut] = []
    # 图片属性标签（照片点评匹配标注库所得）；文字点评恒为空数组
    image_attributes: list[ImageAttributeOut] = []
    # 历史点评中维度画像相似的街区，供「相似审美节点」区块展示
    similar_streets: list[SimilarStreetOut] = []


class HistoryItemOut(BaseModel):
    """历史记录列表项（已完成评价的概要）。"""

    evaluation_id: int
    street: str
    city: str | None = None
    district: str | None = None
    total_score: float | None = None
    status: str
    summary: str | None = None
    image_url: str | None = None  # 上传原图相对路径；文字任务为街道封面或 None
    input_type: str | None = None  # text / image，供历史页筛选
    created_at: str | None = None


class HistoryPageOut(BaseModel):
    items: list[HistoryItemOut]
    total: int
    total_all: int
    offset: int
    limit: int


# ──────────────── Prompt 模板 ────────────────

class PromptTemplateOut(BaseModel):
    """Prompt 模板（当前版本）。"""

    id: int
    stage: str
    dim_code: str | None = None
    name: str
    system_prompt: str | None = None
    user_template: str
    model: str | None = None
    temperature: float | None = None
    placeholders: str | None = None
    version: int
    remark: str | None = None


class PromptTemplateUpdate(BaseModel):
    """更新 Prompt 模板的可编辑字段（仅传需要改的字段）。"""

    name: str | None = Field(None, min_length=1, max_length=100)
    system_prompt: str | None = None
    user_template: str | None = None
    model: str | None = Field(None, max_length=100)
    temperature: float | None = Field(None, ge=0, le=2)
    change_note: str | None = Field(None, max_length=500, description="本次变更说明，记入历史")

    @field_validator("name", "user_template")
    @classmethod
    def nonblank_content(cls, value: str | None) -> str:
        # 省略字段仍是部分更新；显式空值不能覆盖数据库中的必填内容。
        if value is None or not value.strip():
            raise ValueError("模板名称和用户模板不能留空")
        return value


class PromptTemplateHistoryOut(BaseModel):
    """Prompt 模板历史版本。"""

    id: int
    template_id: int
    version: int
    stage: str
    dim_code: str | None = None
    name: str
    system_prompt: str | None = None
    user_template: str
    model: str | None = None
    temperature: float | None = None
    change_note: str | None = None


# ──────────────── 分析中心显示配置 ────────────────

class DisplayConfigOut(BaseModel):
    """分析中心显示区块配置（全局统一）。"""

    id: int
    block_key: str
    block_group: str
    name: str
    description: str | None = None
    enabled: int
    sort_no: int


class DisplayConfigUpdate(BaseModel):
    """更新显示区块的启用状态。"""

    enabled: int = Field(..., ge=0, le=1, description="0 隐藏 / 1 展示")


# ──────────────── 指标体系模板（版本） ────────────────

class MetricTemplateOut(BaseModel):
    """模板列表项：元信息 + 所属分组 + 各级计数 + 是否被历史评价引用。"""

    id: int
    name: str
    description: str | None = None
    street_type_id: int | None = None  # 所属街区类型；None=通用
    is_active: int
    sort_no: int = 0
    create_time: datetime | None = None
    dim_count: int = 0
    sub_count: int = 0
    metric_count: int = 0
    in_use: int = 0


class MetricTemplateMeta(BaseModel):
    """模板元信息（详情/更新返回）。"""

    id: int
    name: str
    description: str | None = None
    street_type_id: int | None = None
    is_active: int
    sort_no: int = 0
    create_time: datetime | None = None


class MetricNodeOut(BaseModel):
    """三级指标节点。"""

    metric_id: int
    metric_code: str
    metric_name: str
    metric_desc: str | None = None
    metric_weight: float


class SubDimensionNodeOut(BaseModel):
    """二级维度节点（含其下三级）。"""

    sub_id: int
    sub_code: str
    sub_name: str
    sub_weight: float
    metrics: list[MetricNodeOut] = []


class DimensionNodeOut(BaseModel):
    """一级维度节点（含其下二级）。"""

    dim_id: int
    dim_code: str
    dim_name: str
    dim_weight: float
    subs: list[SubDimensionNodeOut] = []


class MetricTemplateTreeOut(BaseModel):
    """模板详情：元信息 + 嵌套维度树 + 是否被引用。"""

    template: MetricTemplateMeta
    tree: list[DimensionNodeOut] = []
    in_use: bool = False


class MetricTemplateCreate(BaseModel):
    """新建模板入参。"""

    name: str | None = Field(None, max_length=100)
    description: str | None = Field(None, max_length=500)
    street_type_id: int | None = Field(
        None, description="新模板所属街区类型；为空=通用。仅新建时生效，克隆时沿用源模板分组"
    )
    source_template_id: int | None = Field(
        None, description="克隆来源模板 id；为空则新建标准体系、权重平均分配的模板"
    )


class MetricTemplateMetaUpdate(BaseModel):
    """更新模板名称/说明。"""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)

    @field_validator("name")
    @classmethod
    def nonblank_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("模板名称不能留空")
        return value.strip()


# 维度树保存入参（与 MetricTemplateTreeOut.tree 同构，但只取可编辑字段）

class MetricNodeUpdate(BaseModel):
    metric_id: int
    metric_name: str = Field(..., max_length=200)
    metric_desc: str | None = None
    metric_weight: float = Field(..., ge=0)


class SubDimensionNodeUpdate(BaseModel):
    sub_id: int
    sub_name: str = Field(..., max_length=100)
    sub_weight: float = Field(..., ge=0)
    metrics: list[MetricNodeUpdate] = []


class DimensionNodeUpdate(BaseModel):
    dim_id: int
    dim_name: str = Field(..., max_length=100)
    dim_weight: float = Field(..., ge=0)
    subs: list[SubDimensionNodeUpdate] = []


class MetricTemplateSaveTree(BaseModel):
    """保存维度树内容。save_as_new=True 或模板已被引用时落到新克隆模板。"""

    dims: list[DimensionNodeUpdate]
    save_as_new: bool = False
    new_name: str | None = Field(None, max_length=100)


class MetricTemplateSaveResult(BaseModel):
    """保存结果：is_new 表示是否另存到了新模板。"""

    template: MetricTemplateMeta
    is_new: bool
