import type { HistoryItem } from "../app/types";

export interface HistoryPageData {
  items: HistoryItem[];
  total: number;
  total_all: number;
  offset: number;
  limit: number;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const optionalText = (value: unknown) => value == null || typeof value === "string";
const integer = (value: unknown, min = 0): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min;

export function validHistoryItem(value: unknown): value is HistoryItem {
  return object(value) && integer(value.evaluation_id, 1) && typeof value.street === "string"
    && [value.city, value.district, value.summary, value.image_url, value.created_at].every(optionalText)
    && typeof value.status === "string"
    && (value.input_type == null || value.input_type === "text" || value.input_type === "image")
    && (value.total_score === null || (typeof value.total_score === "number" && Number.isFinite(value.total_score) && value.total_score >= 1 && value.total_score <= 5));
}

export function parseHistoryPage(value: unknown): HistoryPageData {
  if (!object(value) || !Array.isArray(value.items) || !value.items.every(validHistoryItem)
    || !integer(value.total) || !integer(value.total_all) || !integer(value.offset) || !integer(value.limit, 1)
    || value.total_all < value.total || value.items.length > value.limit
    || value.items.length > value.total || value.offset % value.limit !== 0
    || (value.total === 0 ? value.offset !== 0 : value.offset >= value.total)
    || new Set(value.items.map((item) => item.evaluation_id)).size !== value.items.length) {
    throw new Error("历史记录暂时无法读取，请重新加载。");
  }
  return value as unknown as HistoryPageData;
}

export function historySection(createdAt: string | null, now = new Date()): "今天" | "昨天" | "更早" {
  const date = createdAt ? new Date(createdAt) : null;
  if (!date || !Number.isFinite(date.getTime())) return "更早";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date >= today) return "今天";
  return date >= yesterday ? "昨天" : "更早";
}

/** Match the existing interpretation of timezone-free database timestamps. */
export function historySince(range: string, now = new Date()): string | null {
  if (range === "all") return null;
  const date = new Date(now);
  if (range === "today") date.setHours(0, 0, 0, 0);
  else date.setTime(date.getTime() - (range === "7d" ? 7 : 30) * 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
