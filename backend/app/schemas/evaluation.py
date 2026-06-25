"""评价相关的请求 / 响应模型。"""

from __future__ import annotations

from pydantic import BaseModel, Field


# ──────────────── 请求 ────────────────

class TextAnalyzeRequest(BaseModel):
    """文本输入分析请求。"""

    content: str = Field(..., min_length=1, description="街巷名称或描述文本，如『南京东路』")
    city: str | None = Field(None, description="可选，城市，辅助消歧")


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


class SubDimensionScoreOut(BaseModel):
    sub_id: int
    sub_name: str
    dim_id: int
    score: float


class MetricScoreOut(BaseModel):
    metric_id: int
    metric_code: str
    metric_name: str
    sub_id: int
    dim_id: int
    score: int
    reason: str | None = None


class AnalyzeAccepted(BaseModel):
    """提交分析后的受理响应（异步：此刻只有 task_id）。"""

    task_id: int
    status: str


class TaskProgressOut(BaseModel):
    """任务进度（SSE / 轮询）。"""

    task_id: int
    status: str
    progress: int = 0
    current_stage: str | None = None
    stage_message: str | None = None
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
    image_url: str | None = None  # 上传原图相对路径 /static/uploads/...，文字任务为 None
    enabled_blocks: list[str] = []  # 启用中的展示区块 block_key，前端据此渲染
    dimension_scores: list[DimensionScoreOut] = []
    sub_dimension_scores: list[SubDimensionScoreOut] = []
    metric_scores: list[MetricScoreOut] = []


class HistoryItemOut(BaseModel):
    """历史记录列表项（已完成评价的概要）。"""

    evaluation_id: int
    street: str
    city: str | None = None
    district: str | None = None
    total_score: float | None = None
    status: str
    summary: str | None = None
    image_url: str | None = None  # 上传原图相对路径，文字任务为 None
    created_at: str | None = None


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
    enabled: int
    version: int
    remark: str | None = None


class PromptTemplateUpdate(BaseModel):
    """更新 Prompt 模板的可编辑字段（仅传需要改的字段）。"""

    name: str | None = None
    system_prompt: str | None = None
    user_template: str | None = None
    model: str | None = None
    temperature: float | None = None
    enabled: int | None = None
    change_note: str | None = Field(None, description="本次变更说明，记入历史")


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
    """模板列表项：元信息 + 各级计数 + 是否被历史评价引用。"""

    id: int
    name: str
    description: str | None = None
    is_active: int
    sort_no: int = 0
    dim_count: int = 0
    sub_count: int = 0
    metric_count: int = 0
    in_use: int = 0


class MetricTemplateMeta(BaseModel):
    """模板元信息（详情/更新返回）。"""

    id: int
    name: str
    description: str | None = None
    is_active: int
    sort_no: int = 0


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
    """克隆/重命名时的入参。"""

    name: str | None = Field(None, max_length=100)
    description: str | None = Field(None, max_length=500)
    source_template_id: int | None = Field(
        None, description="克隆来源模板 id；为空则新建空骨架（复制当前启用模板结构）"
    )


class MetricTemplateMetaUpdate(BaseModel):
    """更新模板名称/说明。"""

    name: str = Field(..., max_length=100)
    description: str | None = Field(None, max_length=500)


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
