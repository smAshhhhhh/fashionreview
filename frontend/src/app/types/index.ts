/** 导航项 */
export interface NavItem {
  icon: string;
  label: string;
  href: string;
  active?: boolean;
}

/** 分析进度阶段状态 */
export type ProgressStatus = "done" | "active" | "pending";

/** 节点色调：warn 用于「已完成但结果需注意」（如维度评分失败已兜底中位分） */
export type ProgressTone = "normal" | "warn";

/** 分析进度阶段 */
export interface ProgressStage {
  /** 后端阶段标识，如 recognize / profile / scoring / report / done */
  stage: string;
  /** 进度百分比 0~100，对齐后端 progress_service 节点 */
  progress: number;
  /**
   * 三态标题：同一节点会在 pending / active / done 下各渲染一次，必须分别写。
   * 只给一份会出现「未开始的节点灰着写已完成」「转着 sync 图标却宣布自己完成了」。
   * 评分节点的标题在运行时按 stage_detail 改写为真实维度名，此处仅作降级兜底。
   */
  titles: Record<ProgressStatus, string>;
  /** 副标题/详情文案（active 段会被 SSE 的 stage_message 覆盖） */
  detail: string;
  /** 评分节点的完成名次（1-based）；非评分节点为 undefined */
  rank?: number;
}

/* ──── 评价结果（对齐后端 /analyze/result/{id}，分制 1.0~5.0）──── */

/** 一级维度聚合分（雷达图轴 / 指标拆解） */
export interface DimensionScoreResult {
  dim_id: number;
  dim_name: string;
  /** 1.0~5.0 */
  score: number;
  /** 维度权重 0~1，后端下发；旧记录可能为空 */
  weight?: number | null;
}

/** 二级维度聚合分 */
export interface SubDimensionScoreResult {
  sub_id: number;
  sub_name: string;
  dim_id: number;
  score: number;
  /** 二级维度权重 0~1 */
  weight?: number | null;
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
  /** 三级指标权重 0~1 */
  weight?: number | null;
}

/**
 * 一条图片属性（照片点评匹配人工标注库所得）。
 *
 * 挂在三级指标行上渲染，故 metric_id 必有值 —— 后端已过滤掉解析不到指标的条目。
 * 本版只有成语原文，不带分值、不带相似度与标注图信息。
 */
export interface ImageAttribute {
  /** 对齐的三级指标 id */
  metric_id: number;
  /** 属性指标名，如「色彩控制力」 */
  metric_name: string | null;
  /** 等级成语，如「繁简相宜」 */
  grade_word: string;
}

/**
 * 一个相似标注图候选（「相似审美节点」区块）。
 *
 * 相似度下限由后端 annotation_similar_min_similarity 控制（默认 0.5），只作展示
 * 过滤 —— Top-1 赋属性本身不设阈值。故此数组可能比后端留痕的 Top-N 更短，
 * 甚至为空（全部候选都不够像）。
 */
export interface SimilarAnnotation {
  annotation_id: number;
  file_name: string;
  /** 标注图相对路径 /static/annotations/...，用 assetUrl() 拼完整地址 */
  image_url: string;
  /** 余弦相似度 0~1 */
  similarity: number;
  /** 该标注图自身的属性，用于缩略图下的风格标注 */
  attributes: { metric_name: string | null; grade_word: string | null }[];
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
  /** 图片属性标签；文字点评、或「图片属性」区块关闭时为空数组 */
  image_attributes: ImageAttribute[];
  /** 相似标注图候选；文字点评、或「相似审美节点」区块关闭时为空数组 */
  similar_annotations: SimilarAnnotation[];
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
  /** 输入类型：text / image，供历史页筛选 */
  input_type?: string | null;
  /** ISO 时间字符串 */
  created_at: string | null;
}


