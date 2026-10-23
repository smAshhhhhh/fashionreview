"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "../components/Sidebar";
import MobileBottomNav from "../components/MobileBottomNav";
import HistoryHeader, { type HistoryFilters, DEFAULT_FILTERS } from "../components/HistoryHeader";
import HistoryCard from "../components/HistoryCard";
import ResourceDialog from "../components/ResourceDialog";
import { getHistoryPage, batchDeleteEvaluations } from "../../lib/api";
import { ApiRequestError } from "../../lib/request";
import { historySection, historySince, type HistoryPageData } from "../../lib/history-data";
import type { HistoryItem } from "../types";

const PAGE_SIZE = 20;
type ReadState = { key: string; data?: HistoryPageData; error?: string };
const control = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export default function HistoryPage() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_FILTERS);
  const [sortByScore, setSortByScore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<ReadState>({ key: "" });
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Map<number, HistoryItem>>(new Map());
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [message, setMessage] = useState("");
  const deleteLock = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusResults = useRef(false);

  useEffect(() => {
    if (query.trim() === search) return;
    const timer = setTimeout(() => { setSearch(query.trim()); setOffset(0); }, 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const since = useMemo(() => historySince(filters.timeRange), [filters.timeRange]);
  const params = useMemo(() => {
    const value = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), query: search,
      score_band: filters.scoreBand, input_type: filters.inputType, sort: sortByScore ? "score" : "latest" });
    if (since) value.set("created_after", since);
    return value.toString();
  }, [offset, search, filters.scoreBand, filters.inputType, sortByScore, since]);
  const key = `${params}&attempt=${attempt}`;
  const pendingSearch = query.trim() !== search;
  const loading = read.key !== key || pendingSearch;
  const data = !loading ? read.data : undefined;
  const readError = !loading ? read.error : undefined;

  useEffect(() => {
    const controller = new AbortController();
    void getHistoryPage(new URLSearchParams(params), { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return;
      setRead({ key, data });
      if (focusResults.current) { titleRef.current?.focus(); focusResults.current = false; }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setRead({ key, error: error instanceof Error ? error.message : "历史记录加载失败，请重试。" });
    });
    return () => controller.abort();
  }, [params, key]);

  const changeFilters = (value: HistoryFilters) => { focusResults.current = false; setFilters(value); setOffset(0); };
  const clearSearch = () => { setQuery(""); setSearch(""); setOffset(0); setFilters(DEFAULT_FILTERS); };
  const toggleSelect = (record: HistoryItem) => setSelected((previous) => {
    const next = new Map(previous);
    if (next.has(record.evaluation_id)) next.delete(record.evaluation_id);
    else next.set(record.evaluation_id, record);
    return next;
  });
  const exitSelection = () => { setSelectMode(false); setSelected(new Map()); };
  const items = data?.items ?? [];
  const selectedOnPage = items.filter((item) => selected.has(item.evaluation_id)).length;
  const allOnPage = items.length > 0 && selectedOnPage === items.length;
  const hiddenSelections = selected.size - selectedOnPage;
  const togglePage = () => setSelected((previous) => {
    const next = new Map(previous);
    items.forEach((item) => allOnPage ? next.delete(item.evaluation_id) : next.set(item.evaluation_id, item));
    return next;
  });
  const refresh = () => { focusResults.current = true; setAttempt((value) => value + 1); };
  const confirmDelete = async () => {
    if (deleteLock.current || unknownOutcome || selected.size === 0) return;
    deleteLock.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      const deleted = await batchDeleteEvaluations([...selected.keys()]);
      setConfirmBatch(false);
      exitSelection();
      setMessage(deleted === selected.size ? `已删除 ${deleted} 条记录。` : `已删除 ${deleted} 条记录，其余记录可能已被移除。请核对重新加载后的列表。`);
      refresh();
    } catch (error) {
      setUnknownOutcome(error instanceof ApiRequestError && error.outcomeUnknown);
      setDeleteError(error instanceof Error ? error.message : "删除失败，请稍后重试。");
    } finally {
      deleteLock.current = false;
      setDeleting(false);
    }
  };

  const groups: [string, HistoryItem[]][] = sortByScore
    ? [["按分数（高 → 低）", items]]
    : (["今天", "昨天", "更早"] as const).map((section) => [section, items.filter((item) => historySection(item.created_at) === section)]);

  return (
    <div className="flex min-h-screen">
      <Sidebar activeHref="/history" />
      <main className="history-main min-w-0 flex-1 lg:ml-64">
        <div className="@container mx-auto flex max-w-474 flex-col gap-6 px-4 py-6 sm:py-8 lg:px-8">
          <h1 ref={titleRef} tabIndex={-1} className="w-fit text-2xl font-bold text-brand sm:text-3xl">历史记录</h1>
          <HistoryHeader query={query} onSearch={(value) => { focusResults.current = false; setQuery(value); }} filters={filters} onFilterChange={changeFilters}
            sortByScore={sortByScore} onToggleSort={() => { focusResults.current = false; setSortByScore((value) => !value); setOffset(0); }}
            canSelect={selectMode || !!read.data?.total_all} selectMode={selectMode}
            onToggleSelectMode={() => selectMode ? exitSelection() : setSelectMode(true)} />
          <p role="status" aria-atomic="true" className="text-sm text-on-surface-variant">
            {loading ? "正在加载历史记录…" : readError ? "历史记录未能加载" : data ? <>
              共 <span className="font-semibold tabular-nums text-on-surface">{data.total}</span> 条记录
              {data.total !== data.total_all && `（全部 ${data.total_all} 条）`}
              {data.total > 0 && <span className="ml-2">本页 {data.offset + 1}–{data.offset + items.length} 条</span>}
            </> : ""}
          </p>
          {message && <div role="status" className="flex items-start justify-between gap-3 rounded-xl bg-surface-container p-3 text-sm leading-relaxed">
            <p className="py-2">{message}</p><button type="button" aria-label="关闭操作提示" className={`${control} shrink-0 px-3`} onClick={() => setMessage("")}><span aria-hidden="true" className="material-symbols-outlined">close</span></button>
          </div>}
          {selectMode && <div className="sticky top-3 z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border border-divider bg-surface-container-lowest px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-3">
              <button type="button" disabled={loading || !items.length} aria-pressed={allOnPage ? true : selectedOnPage > 0 ? "mixed" : false} onClick={togglePage} className={`${control} px-2 hover:bg-surface-container-low`}>
                <span aria-hidden="true" className="material-symbols-outlined">{allOnPage ? "check_box" : selectedOnPage ? "indeterminate_check_box" : "check_box_outline_blank"}</span>{allOnPage ? "取消本页" : "全选本页"}
              </button>
              <p role="status" aria-atomic="true" className="text-sm text-on-surface-variant">已选 <span className="font-semibold tabular-nums text-on-surface">{selected.size}</span> 项{hiddenSelections > 0 && !loading && `（${hiddenSelections} 项不在本页）`}</p>
            </div>
            <button type="button" disabled={selected.size === 0 || loading} onClick={() => { if (!unknownOutcome) setDeleteError(null); setConfirmBatch(true); }} className={`${control} border border-error/30 text-error hover:bg-error hover:text-on-error`}>
              <span aria-hidden="true" className="material-symbols-outlined text-xl">delete</span>删除
            </button>
          </div>}
          {loading ? <div aria-hidden="true" className="flex justify-center py-20 text-on-surface-variant"><span className="material-symbols-outlined text-4xl motion-safe:animate-spin">progress_activity</span></div>
            : readError ? <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center">
              <p role="alert" className="text-base leading-relaxed text-error">{readError}</p>
              <button type="button" onClick={refresh} className={`${control} bg-primary text-on-primary hover:opacity-90`}>重新加载</button>
            </div>
            : data && items.length === 0 ? <div className="flex flex-col items-center gap-4 py-16 text-center">
              <span aria-hidden="true" className="material-symbols-outlined text-4xl text-on-surface-variant">history</span>
              <h2 className="text-lg font-bold">{data.total_all === 0 ? "还没有分析记录" : "没有匹配的记录"}</h2>
              {data.total_all === 0 ? <Link href="/" className={`${control} bg-primary text-on-primary`}>去首页发起分析</Link> : <button type="button" onClick={clearSearch} className={`${control} bg-primary text-on-primary`}>清空搜索和筛选</button>}
            </div>
            : groups.map(([section, records]) => records.length > 0 && <section key={section} aria-label={section} className="min-w-0">
              <div className="mb-4 flex items-center gap-3"><h2 className="shrink-0 text-base font-bold">{section}</h2><div aria-hidden="true" className="h-px flex-1 bg-divider" /></div>
              <div className="grid min-w-0 grid-cols-1 gap-4 @[42rem]:grid-cols-2 @[66rem]:grid-cols-3">
                {records.map((record) => <HistoryCard key={record.evaluation_id} record={record} priority={record === items[0]}
                  selectMode={selectMode} selected={selected.has(record.evaluation_id)} onToggleSelect={() => toggleSelect(record)} />)}
              </div>
            </section>)}
          {data && data.total > PAGE_SIZE && <nav aria-label="历史记录分页" className="flex flex-wrap items-center justify-center gap-3 border-t border-divider pt-6">
            <button type="button" disabled={data.offset === 0} onClick={() => { focusResults.current = true; setOffset(Math.max(0, data.offset - PAGE_SIZE)); }} className={`${control} border border-divider hover:bg-surface-container`}>上一页</button>
            <span className="text-sm tabular-nums text-on-surface-variant">第 {data.offset / PAGE_SIZE + 1} / {Math.ceil(data.total / PAGE_SIZE)} 页</span>
            <button type="button" disabled={data.offset + PAGE_SIZE >= data.total} onClick={() => { focusResults.current = true; setOffset(data.offset + PAGE_SIZE); }} className={`${control} border border-divider hover:bg-surface-container`}>下一页</button>
          </nav>}
        </div>
      </main>
      <MobileBottomNav activeHref="/history" />
      {confirmBatch && <ResourceDialog title={`删除选中的 ${selected.size} 条记录？`} descriptionId="history-delete-warning" busy={deleting} fallbackFocusRef={titleRef} onClose={() => setConfirmBatch(false)}>
        <p id="history-delete-warning" className="text-sm leading-relaxed text-on-surface-variant">删除后这些评价及其评分明细将被永久移除，无法恢复。请核对以下记录。</p>
        <div role="region" aria-label="待删除记录，可滚动" tabIndex={0} className="history-delete-list my-4 max-h-48 overflow-y-auto p-1 text-sm leading-relaxed [overflow-wrap:anywhere]"><ul className="list-disc space-y-2 pl-5">
          {[...selected.values()].map((record) => <li key={record.evaluation_id}><bdi>{record.street.trim() || "未命名街巷"}</bdi><span className="ml-2 text-on-surface-variant">{[record.city, record.district, record.created_at?.slice(0, 10)].filter(Boolean).join(" · ")}</span></li>)}
        </ul></div>
        {deleteError && <p role="alert" className="text-sm leading-relaxed text-error">{deleteError}</p>}
        {deleting && <p role="status" className="text-sm text-on-surface-variant">正在删除，请稍候…</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" data-dialog-initial-focus disabled={deleting} onClick={() => setConfirmBatch(false)} className={`${control} hover:bg-surface-container text-on-surface-variant`}>{unknownOutcome ? "关闭" : "取消"}</button>
          {unknownOutcome ? <button type="button" onClick={() => { setConfirmBatch(false); exitSelection(); setUnknownOutcome(false); setMessage("删除结果尚未确认，请按街巷名称核对重新加载后的历史记录，再决定后续操作。"); refresh(); }} className={`${control} bg-primary text-on-primary`}>核对历史记录</button>
            : <button type="button" disabled={deleting} aria-describedby="history-delete-warning" onClick={confirmDelete} className={`${control} bg-error text-on-error hover:opacity-90`}>{deleting ? "删除中…" : `删除 ${selected.size} 条`}</button>}
        </div>
      </ResourceDialog>}
    </div>
  );
}
