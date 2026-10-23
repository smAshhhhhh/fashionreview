import type { EvaluationResult } from "../app/types/index.ts";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const text = (value: unknown) => typeof value === "string";
const optionalText = (value: unknown) => value == null || text(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const score = (value: unknown) => finite(value) && value >= 0 && value <= 5;
const weight = (value: unknown) => value == null || (finite(value) && value >= 0 && value <= 1);
const rows = (value: unknown, valid: (row: Record<string, unknown>) => boolean) =>
  Array.isArray(value) && value.every((row) => record(row) && valid(row));

/** Reject unrelated or malformed responses before rendering charts and nested details. */
export function parseEvaluationResult(value: unknown, expectedId: number): EvaluationResult {
  if (!record(value) || !id(value.evaluation_id) || value.evaluation_id !== expectedId ||
      !text(value.street) || !text(value.status) || !value.status ||
      !(value.total_score == null || score(value.total_score)) ||
      !optionalText(value.summary) || !optionalText(value.image_url) ||
      !Array.isArray(value.enabled_blocks) || !value.enabled_blocks.every(text) ||
      !rows(value.dimension_scores, (r) => id(r.dim_id) && text(r.dim_name) && score(r.score) && weight(r.weight)) ||
      !rows(value.sub_dimension_scores, (r) => id(r.sub_id) && id(r.dim_id) && text(r.sub_name) && score(r.score) && weight(r.weight)) ||
      !rows(value.metric_scores, (r) => id(r.metric_id) && id(r.sub_id) && id(r.dim_id) && text(r.metric_name) && text(r.metric_code) && score(r.score) && optionalText(r.reason) && weight(r.weight)) ||
      !rows(value.image_attributes, (r) => id(r.metric_id) && optionalText(r.metric_name) && text(r.grade_word)) ||
      !rows(value.similar_streets, (r) => id(r.evaluation_id) && text(r.street) && optionalText(r.image_url) &&
        finite(r.similarity) && r.similarity >= -1 && r.similarity <= 1 &&
        Array.isArray(r.shared_strengths) && r.shared_strengths.every(text))) {
    throw new Error("评价结果暂时无法读取，请重新加载；若仍失败，请稍后重试。");
  }
  return value as unknown as EvaluationResult;
}

export function evaluationId(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
