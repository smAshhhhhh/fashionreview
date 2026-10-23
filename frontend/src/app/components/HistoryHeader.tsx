"use client";

import { useEffect, useId, useRef, useState } from "react";

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

type Opt<K extends keyof HistoryFilters> = {
  value: HistoryFilters[K];
  label: string;
};

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

const labelOf = <K extends keyof HistoryFilters>(
  opts: Opt<K>[],
  v: HistoryFilters[K],
) => opts.find((o) => o.value === v)?.label ?? "";

/* 控件统一外观：细描边胶囊，按下轻微回弹 */
const pill =
  "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium transition-colors duration-200 motion-reduce:transition-none";
const pillIdle =
  "border-divider bg-surface-container-lowest text-on-surface hover:bg-surface-container-low";
const pillActive = "border-primary/30 bg-primary/5 text-primary";

export default function HistoryHeader({
  query,
  onSearch,
  filters,
  onFilterChange,
  sortByScore,
  onToggleSort,
  canSelect = false,
  selectMode = false,
  onToggleSelectMode,
}: {
  query: string;
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
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const filterRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !filterRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutside);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutside);
    };
  }, [open]);

  const setFilter = <K extends keyof HistoryFilters>(
    key: K,
    value: HistoryFilters[K],
  ) => onFilterChange({ ...filters, [key]: value });

  const chips: { key: keyof HistoryFilters; text: string }[] = [];
  if (filters.scoreBand !== "all")
    chips.push({
      key: "scoreBand",
      text: `评分 ${labelOf(SCORE_OPTS, filters.scoreBand)}`,
    });
  if (filters.inputType !== "all")
    chips.push({
      key: "inputType",
      text: `${labelOf(TYPE_OPTS, filters.inputType)}点评`,
    });
  if (filters.timeRange !== "all")
    chips.push({
      key: "timeRange",
      text: labelOf(TIME_OPTS, filters.timeRange),
    });
  const count = chips.length;

  const optionGroup = <K extends keyof HistoryFilters>(
    label: string,
    opts: Opt<K>[],
    key: K,
  ) => (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-on-surface-variant">
        {label}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => {
          const selected = filters[key] === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={selected}
              onClick={() => setFilter(key, o.value)}
              className={`min-h-11 rounded-full px-3 text-sm transition-colors duration-150 ${
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
    </fieldset>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-4 @[52rem]:flex-row @[52rem]:items-center @[52rem]:justify-between">
        <div className="w-full min-w-0 @[52rem]:max-w-md">
          <input
            className="neu-input w-full h-12 rounded-full border-none px-5 text-lg text-on-surface placeholder:text-on-surface-variant"
            placeholder="搜索街道或趋势..."
            aria-label="搜索历史记录"
            maxLength={300}
            type="search"
            value={query}
            onChange={(e) => {
              onSearch?.(e.target.value);
            }}
          />
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {canSelect && (
            <button
              type="button"
              aria-pressed={selectMode}
              onClick={onToggleSelectMode}
              className={`${pill} ${selectMode ? pillActive : pillIdle}`}
            >
              <span aria-hidden="true" className="hidden sm:contents">
                <span className="material-symbols-outlined text-[18px]">
                  {selectMode ? "close" : "checklist"}
                </span>
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
                className={`relative z-10 rounded-full px-3 text-sm font-medium transition-colors ${
                  sortByScore === value
                    ? "text-on-surface"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div
            ref={filterRef}
            className="relative"
            onBlur={(event) => {
              if (
                event.relatedTarget instanceof Node &&
                !event.currentTarget.contains(event.relatedTarget)
              )
                setOpen(false);
            }}
          >
            <button
              type="button"
              ref={triggerRef}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((v) => !v)}
              className={`${pill} ${open || count > 0 ? pillActive : pillIdle}`}
            >
              <span
                aria-hidden="true"
                className={`material-symbols-outlined text-[18px] transition-transform duration-300 motion-reduce:transition-none ${
                  open ? "rotate-90" : ""
                }`}
              >
                tune
              </span>
              筛选
              {count > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-on-primary">
                  {count}
                </span>
              )}
            </button>

            {open && (
              <>
                <div
                  id={panelId}
                  role="group"
                  aria-label="筛选条件"
                  className="fx-pop-in absolute right-0 top-full z-40 mt-2 max-h-[calc(100dvh-14rem)] w-80 max-w-[calc(100vw-2rem)] origin-top-right overflow-y-auto rounded-2xl bg-surface-container-lowest p-5 shadow-[0_12px_32px_rgb(0,0,0,0.12)] max-sm:fixed max-sm:inset-x-4 max-sm:top-4 max-sm:bottom-[calc(5rem+env(safe-area-inset-bottom))] max-sm:mt-0 max-sm:max-h-none max-sm:w-auto"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-base font-bold text-on-surface">
                      筛选条件
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={count === 0}
                        onClick={() => onFilterChange(DEFAULT_FILTERS)}
                        className="min-h-11 px-2 text-sm font-medium text-on-surface-variant transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                      >
                        重置
                      </button>
                      <button
                        type="button"
                        aria-label="关闭筛选"
                        onClick={() => {
                          setOpen(false);
                          triggerRef.current?.focus();
                        }}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
                      >
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined text-xl"
                        >
                          close
                        </span>
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4">
                    {optionGroup("综合评分", SCORE_OPTS, "scoreBand")}
                    {optionGroup("输入类型", TYPE_OPTS, "inputType")}
                    {optionGroup("时间范围", TIME_OPTS, "timeRange")}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                    className="mt-5 min-h-11 w-full rounded-full bg-primary text-sm font-medium text-on-primary transition-colors hover:opacity-90"
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
              className="group inline-flex min-h-11 items-center gap-1 rounded-full border border-divider bg-surface-container-lowest pl-3 pr-2 text-sm text-on-surface transition-colors hover:border-primary/30 hover:text-primary"
            >
              {c.text}
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[16px] text-on-surface-variant transition-colors group-hover:text-primary"
              >
                close
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => onFilterChange(DEFAULT_FILTERS)}
            className="min-h-11 px-2 text-sm text-on-surface-variant transition-colors hover:text-on-surface"
          >
            清除全部
          </button>
        </div>
      )}
    </div>
  );
}
