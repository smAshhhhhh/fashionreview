/** 导航项 */
export interface NavItem {
  icon: string;
  label: string;
  href: string;
  active?: boolean;
}

/** 分析进度阶段状态 */
export type ProgressStatus = "done" | "active" | "pending";

/** 分析进度阶段 */
export interface ProgressStage {
  /** 后端阶段标识，如 recognize / profile / scoring / report / done */
  stage: string;
  /** 进度百分比 0~100，对齐后端 progress_service 节点 */
  progress: number;
  /** 标题文案 */
  title: string;
  /** 副标题/详情文案 */
  detail: string;
}

/* ──── 评价结果（对齐后端 /analyze/result/{id}，分制 1.0~5.0）──── */

/** 一级维度聚合分（雷达图轴 / 指标拆解） */
export interface DimensionScoreResult {
  dim_id: number;
  dim_name: string;
  /** 1.0~5.0 */
  score: number;
}

/** 二级维度聚合分 */
export interface SubDimensionScoreResult {
  sub_id: number;
  sub_name: string;
  dim_id: number;
  score: number;
}

/** 三级指标得分（含 AI 评分理由） */
export interface MetricScoreResult {
  metric_id: number;
  metric_code: string;
  metric_name: string;
  sub_id: number;
  dim_id: number;
  /** 整数 1~5 */
  score: number;
  reason: string | null;
}

/** 评价结果查询响应 */
export interface EvaluationResult {
  evaluation_id: number;
  street: string;
  status: string;
  /** 综合分 1.0~5.0；分析未完成时可能为 null */
  total_score: number | null;
  /** AI 生成的街道画像 */
  summary: string | null;
  /** 上传原图相对路径 /static/uploads/...，文字发起的点评为 null */
  image_url?: string | null;
  /** 启用中的展示区块 block_key（后端按「分析管理」配置过滤后下发），前端据此渲染 */
  enabled_blocks: string[];
  dimension_scores: DimensionScoreResult[];
  sub_dimension_scores: SubDimensionScoreResult[];
  metric_scores: MetricScoreResult[];
}

/** 历史记录列表项（对齐后端 /analyze/history，分制 1.0~5.0） */
export interface HistoryItem {
  evaluation_id: number;
  street: string;
  city: string | null;
  district: string | null;
  total_score: number | null;
  status: string;
  /** 截断后的 summary 摘要 */
  summary: string | null;
  /** 上传原图相对路径，文字发起的点评为 null */
  image_url?: string | null;
  /** ISO 时间字符串 */
  created_at: string | null;
}


