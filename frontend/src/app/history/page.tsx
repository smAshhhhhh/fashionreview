"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import MobileBottomNav from "../components/MobileBottomNav";
import HistoryHeader, {
  type HistoryFilters,
  DEFAULT_FILTERS,
} from "../components/HistoryHeader";
import HistoryCard from "../components/HistoryCard";
import { listHistory, batchDeleteEvaluations } from "../../lib/api";
import type { HistoryItem } from "../types";

/** 按创建日期把记录分到 今天 / 昨天 / 更早。 */
function sectionOf(createdAt: string | null): "今天" | "昨天" | "更早" {
  if (!createdAt) return "更早";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "更早";
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return "今天";
  if (t >= startOfToday - 86400000) return "昨天";
  return "更早";
}

const SECTIONS = ["今天", "昨天", "更早"] as const;

/** 时间范围筛选：记录是否落在所选范围内。 */
function inTimeRange(createdAt: string | null, range: HistoryFilters["timeRange"]): boolean {
  if (range === "all") return true;
  if (!createdAt) return false;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return false;
  const now = Date.now();
  const t = d.getTime();
  if (range === "today") {
    const n = new Date();
    const startOfToday = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    return t >= startOfToday;
  }
  if (range === "7d") return t >= now - 7 * 86400000;
  if (range === "30d") return t >= now - 30 * 86400000;
  return true;
}

/** 分数区间筛选。 */
function inScoreBand(score: number | null, band: HistoryFilters["scoreBand"]): boolean {
  if (band === "all") return true;
  if (score == null) return false;
  if (band === "high") return score >= 4;
  if (band === "mid") return score >= 3 && score < 4;
  if (band === "low") return score < 3;
  return true;
}

export default function HistoryPage() {
  const [records, setRecords] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_FILTERS);
  const [sortByScore, setSortByScore] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // 多选模式
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // 批量删除二次确认
  const [confirmBatch, setConfirmBatch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listHistory();
        if (!cancelled) setRecords(data);
      } catch (e: unknown) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "加载历史记录失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return records.filter((r) => {
      if (q) {
        const hit =
          r.street.toLowerCase().includes(q) ||
          (r.city ?? "").toLowerCase().includes(q) ||
          (r.district ?? "").toLowerCase().includes(q) ||
          (r.summary ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (!inScoreBand(r.total_score, filters.scoreBand)) return false;
      if (filters.inputType !== "all" && (r.input_type ?? "text") !== filters.inputType)
        return false;
      if (!inTimeRange(r.created_at, filters.timeRange)) return false;
      return true;
    });
  }, [records, searchQuery, filters]);

  // 多选：切换单条选中
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 退出多选模式并清空已选
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  // 全选 / 取消全选（基于当前筛选后的列表）
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selectedIds.has(r.evaluation_id));
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.evaluation_id)));
    }
  };

  // 批量删除：确认后调批量接口，乐观移除
  const confirmBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      await batchDeleteEvaluations(ids);
      const removed = new Set(ids);
      setRecords((prev) => prev.filter((r) => !removed.has(r.evaluation_id)));
      setConfirmBatch(false);
      exitSelectMode();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "批量删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const renderBody = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-4xl">
            progress_activity
          </span>
          <p className="text-sm">正在加载历史记录…</p>
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl text-error">
            error
          </span>
          <p className="text-sm">{error}</p>
        </div>
      );
    }
    if (filtered.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl">history</span>
          <p className="text-sm">
            {records.length === 0 ? "还没有分析记录" : "没有匹配的记录"}
          </p>
        </div>
      );
    }

    // 高分优先：整体按分数降序平铺，不分组
    if (sortByScore) {
      const sorted = [...filtered].sort(
        (a, b) => (b.total_score ?? -1) - (a.total_score ?? -1),
      );
      return (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-base font-bold text-on-surface">按分数（高 → 低）</h3>
            <div className="h-px flex-1 bg-outline-variant/50" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 justify-items-center">
            {sorted.map((record, i) => (
              <HistoryCard
                key={record.evaluation_id}
                record={record}
                priority={i === 0}
                selectMode={selectMode}
                selected={selectedIds.has(record.evaluation_id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        </section>
      );
    }

    // 默认：按时间分组
    return SECTIONS.map((section) => {
      const items = filtered.filter((r) => sectionOf(r.created_at) === section);
      if (items.length === 0) return null;
      return (
        <section key={section}>
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-base font-bold text-on-surface">{section}</h3>
            <div className="h-px flex-1 bg-outline-variant/50" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 justify-items-center">
            {items.map((record, i) => (
              <HistoryCard
                key={record.evaluation_id}
                record={record}
                priority={section === "今天" && i === 0}
                selectMode={selectMode}
                selected={selectedIds.has(record.evaluation_id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        </section>
      );
    });
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar activeHref="/history" />

      <main className="flex-1 min-w-0 min-h-screen md:ml-64">
        <div className="max-w-474 mx-auto px-4 lg:px-8 py-6 flex flex-col gap-6">
          <HistoryHeader
            onSearch={setSearchQuery}
            filters={filters}
            onFilterChange={setFilters}
            sortByScore={sortByScore}
            onToggleSort={() => setSortByScore((v) => !v)}
          />

          {/* 多选工具栏 */}
          {!loading && !error && records.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              {selectMode ? (
                <>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="flex items-center gap-1 text-sm font-medium text-on-surface hover:text-primary transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {allFilteredSelected ? "check_box" : "check_box_outline_blank"}
                      </span>
                      {allFilteredSelected ? "取消全选" : "全选"}
                    </button>
                    <span className="text-sm text-on-surface-variant">
                      已选 {selectedIds.size} 项
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={selectedIds.size === 0}
                      onClick={() => setConfirmBatch(true)}
                      className="flex items-center gap-1 bg-error text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                      删除选中
                    </button>
                    <button
                      type="button"
                      onClick={exitSelectMode}
                      className="px-4 py-2 rounded-full text-sm font-medium bg-outline-variant/30 hover:bg-surface-variant text-on-surface transition-colors"
                    >
                      退出
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectMode(true)}
                  className="ml-auto flex items-center gap-1 bg-outline-variant/30 hover:bg-surface-variant text-on-surface px-4 py-2 rounded-full text-sm font-medium transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">checklist</span>
                  选择
                </button>
              )}
            </div>
          )}

          {renderBody()}
        </div>
      </main>

      <MobileBottomNav activeHref="/history" />

      {/* 批量删除二次确认弹窗 */}
      {confirmBatch && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deleting && setConfirmBatch(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-surface-container-lowest p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-on-surface">
              <span className="material-symbols-outlined text-error">delete_sweep</span>
              <h3 className="text-lg font-bold">删除选中的 {selectedIds.size} 条记录？</h3>
            </div>
            <p className="mt-3 text-sm text-on-surface-variant">
              删除后这些评价及其评分明细将被永久移除，无法恢复。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmBatch(false)}
                className="rounded-full px-5 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmBatchDelete}
                className="rounded-full bg-error px-5 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {deleting ? "删除中…" : `删除 ${selectedIds.size} 条`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
