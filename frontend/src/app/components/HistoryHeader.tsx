"use client";

import { useEffect, useState } from "react";

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

type Opt<K extends keyof HistoryFilters> = { value: HistoryFilters[K]; label: string };

const SCORE_OPTS: Opt<"scoreBand">[] = [
  { value: "all", label: "全部" },
  { value: "high", label: "≥4 分" },
  { value: "mid", label: "3~4 分" },
  { value: "low", label: "<3 分" },
];
const TYPE_OPTS: Opt<"inputType">[] = [
  { value: "all", label: "全部" },
  { value: "text", label: "文字" },
  { value: "image", label: "图片" },
];
const TIME_OPTS: Opt<"timeRange">[] = [
  { value: "all", label: "全部" },
  { value: "today", label: "今天" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
];

const labelOf = <K extends keyof HistoryFilters>(opts: Opt<K>[], v: HistoryFilters[K]) =>
  opts.find((o) => o.value === v)?.label ?? "";

/* 控件统一外观：细描边胶囊，按下轻微回弹 */
const pill =
  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-all duration-200 active:scale-[0.97] motion-reduce:transition-none";
const pillIdle =
  "border-divider bg-surface-container-lowest text-on-surface hover:bg-surface-container-low";
const pillActive = "border-primary/30 bg-primary/5 text-primary";

export default function HistoryHeader({
  onSearch,
  filters,
  onFilterChange,
  sortByScore,
  onToggleSort,
  canSelect = false,
  selectMode = false,
  onToggleSelectMode,
}: {
  onSearch?: (query: string) => void;
  filters: HistoryFilters;
  onFilterChange: (f: HistoryFilters) => void;
  sortByScore: boolean;
  onToggleSort: () => void;
  /** 有记录时才显示「选择」入口 */
  canSelect?: boolean;
  selectMode?: boolean;
  onToggleSelectMode?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const setFilter = <K extends keyof HistoryFilters>(key: K, value: HistoryFilters[K]) =>
    onFilterChange({ ...filters, [key]: value });

  const chips: { key: keyof HistoryFilters; text: string }[] = [];
  if (filters.scoreBand !== "all")
    chips.push({ key: "scoreBand", text: `评分 ${labelOf(SCORE_OPTS, filters.scoreBand)}` });
  if (filters.inputType !== "all")
    chips.push({ key: "inputType", text: `${labelOf(TYPE_OPTS, filters.inputType)}点评` });
  if (filters.timeRange !== "all")
    chips.push({ key: "timeRange", text: labelOf(TIME_OPTS, filters.timeRange) });
  const count = chips.length;

  const optionGroup = <K extends keyof HistoryFilters>(
    label: string,
    opts: Opt<K>[],
    key: K,
  ) => (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-on-surface-variant">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => {
          const selected = filters[key] === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={selected}
              onClick={() => setFilter(key, o.value)}
              className={`h-8 rounded-full px-3 text-[13px] transition-colors duration-150 ${
                selected
                  ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                  : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="w-full md:max-w-md">
          <input
            className="neu-input w-full h-12 rounded-full border-none px-5 text-lg text-on-surface placeholder:text-on-surface-variant"
            placeholder="搜索街道或趋势..."
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              onSearch?.(e.target.value);
            }}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          {canSelect && (
            <button
              type="button"
              aria-pressed={selectMode}
              onClick={onToggleSelectMode}
              className={`${pill} ${selectMode ? pillActive : pillIdle}`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {selectMode ? "close" : "checklist"}
              </span>
              {selectMode ? "取消" : "选择"}
            </button>
          )}

          {/* 排序：分段切换，滑块随选中项平移 */}
          <div
            role="group"
            aria-label="排序方式"
            className="relative grid h-10 shrink-0 grid-cols-2 rounded-full border border-divider bg-surface-container-lowest p-1"
          >
            <span
              aria-hidden
              className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-surface-container shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none ${
                sortByScore ? "translate-x-full" : ""
              }`}
            />
            {(
              [
                ["最新", false],
                ["高分", true],
              ] as const
            ).map(([label, value]) => (
              <button
                key={label}
                type="button"
                aria-pressed={sortByScore === value}
                onClick={() => sortByScore !== value && onToggleSort()}
                className={`relative z-10 px-3.5 text-sm font-medium transition-colors ${
                  sortByScore === value
                    ? "text-on-surface"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative">
            <button
              type="button"
              aria-expanded={open}
              aria-haspopup="dialog"
              onClick={() => setOpen((v) => !v)}
              className={`${pill} ${open || count > 0 ? pillActive : pillIdle}`}
            >
              <span
                className={`material-symbols-outlined text-[18px] transition-transform duration-300 motion-reduce:transition-none ${
                  open ? "rotate-90" : ""
                }`}
              >
                tune
              </span>
              筛选
              {count > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-white">
                  {count}
                </span>
              )}
            </button>

            {open && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                <div
                  role="dialog"
                  aria-label="筛选条件"
                  className="fx-pop-in absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] origin-top-right rounded-2xl border border-divider bg-surface-container-lowest p-5 shadow-[0_12px_32px_rgb(0,0,0,0.08)]"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <h4 className="text-sm font-bold text-on-surface">筛选条件</h4>
                    <button
                      type="button"
                      disabled={count === 0}
                      onClick={() => onFilterChange(DEFAULT_FILTERS)}
                      className="text-xs font-medium text-on-surface-variant transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                    >
                      重置
                    </button>
                  </div>
                  <div className="flex flex-col gap-4">
                    {optionGroup("综合评分", SCORE_OPTS, "scoreBand")}
                    {optionGroup("输入类型", TYPE_OPTS, "inputType")}
                    {optionGroup("时间范围", TIME_OPTS, "timeRange")}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="mt-5 h-10 w-full rounded-full bg-primary text-sm font-medium text-white transition-all hover:opacity-90 active:scale-[0.98]"
                  >
                    完成
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 已生效的筛选，点击单个即可移除 */}
      {count > 0 && (
        <div className="fx-fade-down flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-label={`移除筛选：${c.text}`}
              onClick={() => setFilter(c.key, "all")}
              className="group inline-flex h-8 items-center gap-1 rounded-full border border-divider bg-surface-container-lowest pl-3 pr-2 text-[13px] text-on-surface transition-colors hover:border-primary/30 hover:text-primary"
            >
              {c.text}
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant transition-colors group-hover:text-primary">
                close
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => onFilterChange(DEFAULT_FILTERS)}
            className="ml-1 text-[13px] text-on-surface-variant transition-colors hover:text-on-surface"
          >
            清除全部
          </button>
        </div>
      )}
    </div>
  );
}
