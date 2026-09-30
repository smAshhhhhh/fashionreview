/**
 * 后端 API 封装（FastAPI）。
 * 仅文本分析 + 进度订阅；识图与真实结果页暂不接入。
 */

import type { EvaluationResult, HistoryItem } from "../app/types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api/v1";

/** 后端站点根地址（去掉 /api/v1），用于拼接 /static 静态资源。 */
const SITE_BASE = API_BASE.replace(/\/api\/v1\/?$/, "");

/**
 * 把后端返回的相对资源路径（如 /static/uploads/x.jpg）拼成完整可访问地址。
 * 传入空值时回退到本地占位图。
 */
export function assetUrl(path?: string | null): string {
  if (!path) return "/images/no_photo.jpeg";
  if (/^https?:\/\//.test(path)) return path; // 已是绝对地址
  return `${SITE_BASE}${path}`;
}

/** POST /analyze/text 的受理响应 */
export interface AnalyzeAccepted {
  task_id: number;
  status: string;
}

/** 任务进度（SSE / 轮询同构） */
/** 评分阶段的一个已完成维度。 */
export interface ScoredDimension {
  /** 真实一级维度名，如「商业业态」 */
  name: string;
  /** false = 该维度评分失败、已兜底补中位分（后端 failed_dims） */
  ok: boolean;
}

/**
 * 评分阶段的结构化明细（后端 stage_detail）。
 *
 * done 的顺序是**真实完成顺序**，并发下与 all 的顺序无关 —— all 按 dim_sort 排，
 * 而 5 个维度由 ThreadPoolExecutor 全并发、as_completed 谁先回谁先进 done。
 * 所以 done[i] 的含义是「第 i+1 个完成的维度」，不是「第 i+1 个维度」。
 */
export interface ScoringDetail {
  /** 全部一级维度名，按 dim_sort 固定顺序 */
  all: string[];
  /** 已完成的维度，按完成先后累加 */
  done: ScoredDimension[];
  /** 维度总数（当前 seed 为 5，但不要写死） */
  total: number;
}

export interface TaskProgress {
  task_id: number;
  status: "pending" | "analyzing" | "completed" | "failed" | "cancelled";
  progress: number;
  current_stage: string | null;
  stage_message: string | null;
  /**
   * 阶段结构化明细。评分阶段为 ScoringDetail；其余阶段、老任务、
   * 以及尚未执行 stage_detail 列迁移的库均为 null，前端必须按 null 降级。
   */
  stage_detail: ScoringDetail | null;
  evaluation_id: number | null;
  error_message: string | null;
  /** 用户提交的原始街道名，供进度页标题展示（刷新/守卫重定向后据此恢复） */
  text_input: string | null;
}

/** 提交文本分析，立即拿到 task_id。 */
export async function submitTextAnalysis(
  content: string,
  city?: string,
): Promise<AnalyzeAccepted> {
  const res = await fetch(`${API_BASE}/analyze/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, city: city ?? null }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`提交分析失败 (${res.status})：${detail}`);
  }
  return res.json();
}

/** 提交图片分析（multipart 上传），立即拿到 task_id。 */
export async function submitImageAnalysis(
  file: File,
  city?: string,
): Promise<AnalyzeAccepted> {
  const fd = new FormData();
  fd.append("file", file);
  if (city) fd.append("city", city);
  // 不手动设 Content-Type，浏览器会自动带上 multipart boundary
  const res = await fetch(`${API_BASE}/analyze/image`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`提交图片分析失败 (${res.status})：${detail}`);
  }
  return res.json();
}

/** SSE 进度流地址。 */
export function progressStreamUrl(taskId: number): string {
  return `${API_BASE}/task/${taskId}/progress`;
}

/** 轮询查询一次进度（SSE 不可用时降级使用）。 */
export async function fetchTaskProgress(taskId: number): Promise<TaskProgress> {
  const res = await fetch(`${API_BASE}/task/${taskId}`);
  if (!res.ok) throw new Error(`查询进度失败 (${res.status})`);
  return res.json();
}

/** 取消分析任务结果。 */
export interface CancelTaskResult {
  task_id: number;
  status: string;
  /** true=本次请求成功取消；false=任务已是终态，无需取消 */
  cancelled: boolean;
}

/** 请求取消正在分析的任务，立即返回（协作式取消）。 */
export async function cancelTask(taskId: number): Promise<CancelTaskResult> {
  const res = await fetch(`${API_BASE}/task/${taskId}/cancel`, {
    method: "POST",
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("任务不存在");
    throw new Error(`取消任务失败 (${res.status})`);
  }
  return res.json();
}

/** 按 evaluation_id 查询评价结果（分制 1.0~5.0）。 */
export async function getEvaluationResult(
  evaluationId: number,
): Promise<EvaluationResult> {
  const res = await fetch(`${API_BASE}/analyze/result/${evaluationId}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error("评价记录不存在");
    throw new Error(`查询评价结果失败 (${res.status})`);
  }
  return res.json();
}

/** 历史记录列表（已完成评价，按时间倒序）。 */
export async function listHistory(limit = 50): Promise<HistoryItem[]> {
  const res = await fetch(`${API_BASE}/analyze/history?limit=${limit}`);
  if (!res.ok) throw new Error(`查询历史记录失败 (${res.status})`);
  return res.json();
}

/** 物理删除一条评价记录（含关联明细/维度分/AI任务）。 */
export async function deleteEvaluation(evaluationId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/analyze/result/${evaluationId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("评价记录不存在");
    throw new Error(`删除失败 (${res.status})`);
  }
}

/** 批量物理删除评价记录，返回成功删除的条数。 */
export async function batchDeleteEvaluations(
  evaluationIds: number[],
): Promise<number> {
  const res = await fetch(`${API_BASE}/analyze/results/batch-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evaluation_ids: evaluationIds }),
  });
  if (!res.ok) throw new Error(`批量删除失败 (${res.status})`);
  const data = await res.json();
  return data.deleted ?? 0;
}

/* ──────────────── Prompt 模板管理 ──────────────── */

/** Prompt 模板（当前版本），字段对齐后端 PromptTemplateOut。 */
export interface PromptTemplate {
  id: number;
  /** 阶段：recognize / score / report */
  stage: string;
  /** 评分阶段的一级维度 code；recognize / report 为 null */
  dim_code: string | null;
  name: string;
  system_prompt: string | null;
  user_template: string;
  model: string | null;
  temperature: number | null;
  /** 可用占位符说明，供前端提示 */
  placeholders: string | null;
  /** 0 / 1 */
  enabled: number;
  version: number;
  remark: string | null;
}

/** Prompt 模板历史版本，字段对齐后端 PromptTemplateHistoryOut。 */
export interface PromptTemplateHistory {
  id: number;
  template_id: number;
  version: number;
  stage: string;
  dim_code: string | null;
  name: string;
  system_prompt: string | null;
  user_template: string;
  model: string | null;
  temperature: number | null;
  change_note: string | null;
}

/** 更新 Prompt 模板的可编辑字段（仅传需要改的字段）。 */
export interface PromptTemplateUpdate {
  name?: string;
  system_prompt?: string | null;
  user_template?: string;
  model?: string | null;
  temperature?: number | null;
  enabled?: number;
  /** 本次变更说明，记入历史（选填） */
  change_note?: string | null;
}

/** Prompt 模板列表。 */
export async function listPrompts(): Promise<PromptTemplate[]> {
  const res = await fetch(`${API_BASE}/prompts`);
  if (!res.ok) throw new Error(`查询模板列表失败 (${res.status})`);
  return res.json();
}

/** 单个 Prompt 模板详情。 */
export async function getPrompt(id: number): Promise<PromptTemplate> {
  const res = await fetch(`${API_BASE}/prompts/${id}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error("模板不存在");
    throw new Error(`查询模板失败 (${res.status})`);
  }
  return res.json();
}

/** 更新模板（后端自动归档旧版、version+1）。 */
export async function updatePrompt(
  id: number,
  body: PromptTemplateUpdate,
): Promise<PromptTemplate> {
  const res = await fetch(`${API_BASE}/prompts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`保存模板失败 (${res.status})：${detail}`);
  }
  return res.json();
}

/** 模板历史版本列表（按 version 倒序）。 */
export async function listPromptHistory(
  id: number,
): Promise<PromptTemplateHistory[]> {
  const res = await fetch(`${API_BASE}/prompts/${id}/history`);
  if (!res.ok) throw new Error(`查询历史版本失败 (${res.status})`);
  return res.json();
}

/** 回滚到指定历史版本（作为一次新版本写回）。 */
export async function rollbackPrompt(
  id: number,
  version: number,
): Promise<PromptTemplate> {
  const res = await fetch(`${API_BASE}/prompts/${id}/rollback/${version}`, {
    method: "POST",
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("模板或目标版本不存在");
    throw new Error(`回滚失败 (${res.status})`);
  }
  return res.json();
}

/* ──────────────── 分析中心显示配置 ──────────────── */

/** 分析中心显示区块配置，字段对齐后端 DisplayConfigOut。 */
export interface AnalyticsDisplayConfig {
  id: number;
  /** 区块稳定标识，前端据此条件渲染 */
  block_key: string;
  /** 分组：overview / visual / detail / report */
  block_group: string;
  name: string;
  description: string | null;
  /** 0 隐藏 / 1 展示 */
  enabled: number;
  sort_no: number;
}

/** 全部显示区块配置（按分组与组内排序）。 */
export async function listAnalyticsConfig(): Promise<AnalyticsDisplayConfig[]> {
  const res = await fetch(`${API_BASE}/analytics-config`);
  if (!res.ok) throw new Error(`查询显示配置失败 (${res.status})`);
  return res.json();
}

/** 更新某区块的启用状态（0 隐藏 / 1 展示）。 */
export async function updateAnalyticsConfig(
  blockKey: string,
  enabled: number,
): Promise<AnalyticsDisplayConfig> {
  const res = await fetch(`${API_BASE}/analytics-config/${blockKey}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("显示区块不存在");
    throw new Error(`保存显示配置失败 (${res.status})`);
  }
  return res.json();
}

/* ──────────────── 指标体系模板（版本） ──────────────── */

/** 模板列表项：元信息 + 各级计数 + 是否被历史评价引用。 */
export interface MetricTemplate {
  id: number;
  name: string;
  description: string | null;
  /** 1=当前启用模板 */
  is_active: number;
  sort_no: number;
  dim_count: number;
  sub_count: number;
  metric_count: number;
  /** 1=已被历史评价引用（编辑将强制另存为新模板） */
  in_use: number;
}

/** 模板元信息（详情/更新返回）。 */
export interface MetricTemplateMeta {
  id: number;
  name: string;
  description: string | null;
  is_active: number;
  sort_no: number;
}

/** 三级指标节点。 */
export interface MetricNode {
  metric_id: number;
  metric_code: string;
  metric_name: string;
  metric_desc: string | null;
  metric_weight: number;
}

/** 二级维度节点（含其下三级）。 */
export interface SubDimensionNode {
  sub_id: number;
  sub_code: string;
  sub_name: string;
  sub_weight: number;
  metrics: MetricNode[];
}

/** 一级维度节点（含其下二级）。 */
export interface DimensionNode {
  dim_id: number;
  dim_code: string;
  dim_name: string;
  dim_weight: number;
  subs: SubDimensionNode[];
}

/** 模板详情：元信息 + 嵌套维度树 + 是否被引用。 */
export interface MetricTemplateTree {
  template: MetricTemplateMeta;
  tree: DimensionNode[];
  in_use: boolean;
}

/** 保存维度树结果：is_new 表示是否另存到了新模板。 */
export interface MetricTemplateSaveResult {
  template: MetricTemplateMeta;
  is_new: boolean;
}

/** 模板列表（带计数与是否被引用）。 */
export async function listMetricTemplates(): Promise<MetricTemplate[]> {
  const res = await fetch(`${API_BASE}/metric-templates`);
  if (!res.ok) throw new Error(`查询模板列表失败 (${res.status})`);
  return res.json();
}

/** 模板详情（嵌套维度树）。 */
export async function getMetricTemplateTree(
  id: number,
): Promise<MetricTemplateTree> {
  const res = await fetch(`${API_BASE}/metric-templates/${id}/tree`);
  if (!res.ok) throw new Error(`查询模板详情失败 (${res.status})`);
  return res.json();
}

/** 新建模板：传 sourceTemplateId 为克隆，否则新建空骨架（复制当前启用模板结构）。 */
export async function createMetricTemplate(opts?: {
  name?: string;
  description?: string;
  sourceTemplateId?: number;
}): Promise<MetricTemplateMeta> {
  const res = await fetch(`${API_BASE}/metric-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: opts?.name ?? null,
      description: opts?.description ?? null,
      source_template_id: opts?.sourceTemplateId ?? null,
    }),
  });
  if (!res.ok) throw new Error(`新建模板失败 (${res.status})`);
  return res.json();
}

/** 更新模板名称/说明。 */
export async function updateMetricTemplateMeta(
  id: number,
  name: string,
  description: string | null,
): Promise<MetricTemplateMeta> {
  const res = await fetch(`${API_BASE}/metric-templates/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) throw new Error(`保存模板信息失败 (${res.status})`);
  return res.json();
}

/** 保存维度树内容。saveAsNew 或模板已被引用时落到新克隆模板。 */
export async function saveMetricTemplateTree(
  id: number,
  dims: DimensionNode[],
  opts?: { saveAsNew?: boolean; newName?: string },
): Promise<MetricTemplateSaveResult> {
  const res = await fetch(`${API_BASE}/metric-templates/${id}/tree`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dims,
      save_as_new: opts?.saveAsNew ?? false,
      new_name: opts?.newName ?? null,
    }),
  });
  if (!res.ok) throw new Error(`保存维度内容失败 (${res.status})`);
  return res.json();
}

/** 启用模板（影响后续 AI 点评与新评价的维度名）。 */
export async function activateMetricTemplate(
  id: number,
): Promise<MetricTemplateMeta> {
  const res = await fetch(`${API_BASE}/metric-templates/${id}/activate`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`启用模板失败 (${res.status})`);
  return res.json();
}

/** 删除模板（启用中/已被引用会被后端拒绝，错误信息透传）。 */
export async function deleteMetricTemplate(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/metric-templates/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    let detail = `删除模板失败 (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* 忽略解析失败，用默认文案 */
    }
    throw new Error(detail);
  }
}

/* ──────────────── 资源中心：POI / 街巷画像 ──────────────── */

export interface ResourceStreet {
  street_id: number;
  street_name: string;
  city: string | null;
  district: string | null;
  poi_total: number;
  amap_count: number;
  dianping_count: number;
  has_profile: number;
  profile_update_time: string | null;
}

export interface PoiImportResult {
  street: { id: number; name: string; city: string | null; district: string | null };
  detected_format: string;
  source: string;
  total_rows: number;
  inserted: number;
  updated: number;
  skipped: number;
  field_coverage: Record<string, number>;
  sample_rows: Record<string, unknown>[];
  warnings: string[];
}

export interface PoiListResult {
  total: number;
  items: Record<string, unknown>[];
}

export interface StreetProfileDetail {
  street: { id: number; name: string; city: string | null; district: string | null };
  has_profile: boolean;
  poi_total: number;
  amap_count: number;
  dianping_count: number;
  profile: Record<string, unknown> | null;
  extra_stats: Record<string, unknown>;
  facts_preview: string;
}

export interface ProfileJobStatus {
  job_id: string;
  street_id: number;
  status: "running" | "completed" | "failed";
  error: string | null;
}

export async function listResourceStreets(): Promise<ResourceStreet[]> {
  const res = await fetch(`${API_BASE}/resource/streets`);
  if (!res.ok) throw new Error(`查询街区资源失败 (${res.status})`);
  return res.json();
}

export async function importPoiFile(
  file: File,
  street: { street_name: string; city?: string; district?: string },
  clearExisting = false,
): Promise<PoiImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("street_name", street.street_name);
  if (street.city) fd.append("city", street.city);
  if (street.district) fd.append("district", street.district);
  fd.append("clear_existing", String(clearExisting));
  const res = await fetch(`${API_BASE}/resource/poi/import`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`导入 POI 失败 (${res.status})：${detail}`);
  }
  return res.json();
}

export async function listPoiRows(params: {
  streetId?: number;
  source?: string;
  limit?: number;
  offset?: number;
}): Promise<PoiListResult> {
  const qs = new URLSearchParams();
  if (params.streetId != null) qs.set("street_id", String(params.streetId));
  if (params.source) qs.set("source", params.source);
  qs.set("limit", String(params.limit ?? 50));
  qs.set("offset", String(params.offset ?? 0));
  const res = await fetch(`${API_BASE}/resource/poi?${qs}`);
  if (!res.ok) throw new Error(`查询 POI 明细失败 (${res.status})`);
  return res.json();
}

export async function deletePoiByStreet(
  streetId: number,
  source = "all",
): Promise<{ deleted: number }> {
  const res = await fetch(
    `${API_BASE}/resource/poi/by-street/${streetId}?source=${encodeURIComponent(source)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`删除 POI 失败 (${res.status})`);
  return res.json();
}

export async function getStreetProfile(
  streetId: number,
): Promise<StreetProfileDetail> {
  const res = await fetch(`${API_BASE}/resource/profiles/${streetId}`);
  if (!res.ok) throw new Error(`查询街巷画像失败 (${res.status})`);
  return res.json();
}

export async function startRebuildStreetProfile(
  streetId: number,
): Promise<ProfileJobStatus> {
  const res = await fetch(`${API_BASE}/resource/profiles/${streetId}/rebuild`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`启动画像生成失败 (${res.status})`);
  return res.json();
}

export async function fetchProfileJob(jobId: string): Promise<ProfileJobStatus> {
  const res = await fetch(`${API_BASE}/resource/profile-jobs/${jobId}`);
  if (!res.ok) throw new Error(`查询画像任务失败 (${res.status})`);
  return res.json();
}
