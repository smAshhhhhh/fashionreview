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
export interface TaskProgress {
  task_id: number;
  status: "pending" | "analyzing" | "completed" | "failed";
  progress: number;
  current_stage: string | null;
  stage_message: string | null;
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
