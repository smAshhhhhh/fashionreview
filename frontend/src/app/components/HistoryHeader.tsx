"use client";

import { useState } from "react";

/** 历史记录筛选条件。"all" 表示不限。 */
export type HistoryFilters = {
  scoreBand: "all" | "high" | "mid" | "low"; // ≥4 / 3~4 / <3
  inputType: "all" | "text" | "image";
  timeRange: "all" | "today" | "7d" | "30d";
};

export const DEFAULT_FILTERS: HistoryFilters = {
  scoreBand: "all",
  inputType: "all",
  timeRange: "all",
};

const SCORE_OPTS: { value: HistoryFilters["scoreBand"]; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "high", label: "≥4 分" },
  { value: "mid", label: "3~4 分" },
  { value: "low", label: "<3 分" },
];
const TYPE_OPTS: { value: HistoryFilters["inputType"]; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "text", label: "文字" },
  { value: "image", label: "图片" },
];
const TIME_OPTS: { value: HistoryFilters["timeRange"]; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "today", label: "今天" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
];

function activeCount(f: HistoryFilters): number {
  return (
    (f.scoreBand !== "all" ? 1 : 0) +
    (f.inputType !== "all" ? 1 : 0) +
    (f.timeRange !== "all" ? 1 : 0)
  );
}

export default function HistoryHeader({
  onSearch,
  filters,
  onFilterChange,
  sortByScore,
  onToggleSort,
}: {
  onSearch?: (query: string) => void;
  filters: HistoryFilters;
  onFilterChange: (f: HistoryFilters) => void;
  sortByScore: boolean;
  onToggleSort: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const count = activeCount(filters);

  const handleChange = (value: string) => {
    setQuery(value);
    onSearch?.(value);
  };

  const ChipRow = <K extends keyof HistoryFilters>(
    label: string,
    opts: { value: HistoryFilters[K]; label: string }[],
    key: K,
  ) => (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold text-on-surface-variant">{label}</span>
      <div className="flex flex-wrap gap-2">
        {opts.map((o) => {
          const selected = filters[key] === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => onFilterChange({ ...filters, [key]: o.value })}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                selected
                  ? "bg-primary text-white"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-variant"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex items-center justify-center gap-3">
      {/* Search */}
      <div className="relative group flex-1 max-w-xl">
        <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">
          search
        </span>
        <input
          className="w-full bg-outline-variant/30 border-none rounded-full h-12 pl-14 pr-4 text-lg text-on-surface placeholder:text-on-surface-variant focus:ring-1 focus:ring-primary focus:bg-white transition-all"
          placeholder="搜索街道或趋势..."
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
        />
      </div>

      {/* Filter buttons */}
      <div className="flex gap-2 shrink-0">
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`flex items-center gap-1 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              count > 0
                ? "bg-primary/10 text-primary"
                : "bg-outline-variant/30 hover:bg-surface-variant text-on-surface"
            }`}
          >
            <span>筛选{count > 0 ? `·${count}` : ""}</span>
            <span className="material-symbols-outlined text-[18px]">tune</span>
          </button>

          {open && (
            <>
              {/* 点击外部关闭 */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setOpen(false)}
              />
              <div className="absolute right-0 top-12 z-50 w-72 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 shadow-xl p-4 flex flex-col gap-4">
                {ChipRow("综合评分", SCORE_OPTS, "scoreBand")}
                {ChipRow("输入类型", TYPE_OPTS, "inputType")}
                {ChipRow("时间范围", TIME_OPTS, "timeRange")}
                <div className="flex justify-between pt-1 border-t border-outline-variant/30">
                  <button
                    type="button"
                    onClick={() => onFilterChange(DEFAULT_FILTERS)}
                    className="text-sm text-on-surface-variant hover:text-on-surface transition-colors"
                  >
                    重置
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-sm font-bold text-primary hover:opacity-80 transition-opacity"
                  >
                    完成
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleSort}
          className={`flex items-center gap-1 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            sortByScore
              ? "bg-primary text-white"
              : "bg-outline-variant/30 hover:bg-surface-variant text-on-surface"
          }`}
        >
          <span>高分优先</span>
        </button>
      </div>
    </div>
  );
}
