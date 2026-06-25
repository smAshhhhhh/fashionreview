"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Sidebar from "../../components/Sidebar";
import MobileBottomNav from "../../components/MobileBottomNav";
import {
  listMetricTemplates,
  getMetricTemplateTree,
  createMetricTemplate,
  activateMetricTemplate,
  deleteMetricTemplate,
  saveMetricTemplateTree,
  type MetricTemplate,
  type DimensionNode,
} from "../../../lib/api";

/* ──────────────────────────────────────────────
 * 指标体系模板管理 /resources/metrics
 * 左：模板列表（启用态 + 一键切换 / 克隆新建 / 删除）。
 * 右：所选模板的一/二/三级维度可编辑树（名称、权重、指标说明）。
 * 保存：若模板已被历史评价引用（in_use），强制另存为新模板；否则原地保存。
 * 启用模板将影响后续 AI 点评与新评价展示的维度名。
 * ────────────────────────────────────────────── */

export default function MetricTemplatesPage() {
  const [templates, setTemplates] = useState<MetricTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dims, setDims] = useState<DimensionNode[]>([]);
  const [inUse, setInUse] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingTree, setLoadingTree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const reloadList = async (keepId?: number) => {
    const data = await listMetricTemplates();
    setTemplates(data);
    if (data.length === 0) return;
    const pick =
      keepId != null && data.some((t) => t.id === keepId)
        ? keepId
        : (selectedId != null && data.some((t) => t.id === selectedId)
            ? selectedId
            : data[0].id);
    setSelectedId(pick);
  };

  // 初次加载模板列表
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reloadList();
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载模板失败");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 选中模板变化时拉取维度树
  useEffect(() => {
    if (selectedId == null) return;
    let cancelled = false;
    (async () => {
      setLoadingTree(true);
      setNotice(null);
      try {
        const t = await getMetricTemplateTree(selectedId);
        if (cancelled) return;
        setDims(t.tree);
        setInUse(t.in_use);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载模板内容失败");
      } finally {
        if (!cancelled) setLoadingTree(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  /* ── 模板级操作 ── */
  const handleActivate = async (id: number) => {
    setBusy(true);
    setError(null);
    try {
      await activateMetricTemplate(id);
      await reloadList(id);
      setNotice("已切换启用模板，后续 AI 点评与新评价将使用该模板维度。");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "启用失败");
    } finally {
      setBusy(false);
    }
  };

  const handleClone = async () => {
    setBusy(true);
    setError(null);
    try {
      const meta = await createMetricTemplate({
        sourceTemplateId: selectedId ?? undefined,
      });
      await reloadList(meta.id);
      setNotice(`已新建模板「${meta.name}」（复制自当前模板），可直接编辑。`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "新建模板失败");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    setBusy(true);
    setError(null);
    try {
      await deleteMetricTemplate(id);
      if (selectedId === id) setSelectedId(null);
      await reloadList();
      setNotice("模板已删除。");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
      setPendingDeleteId(null);
    }
  };

  const handleSave = async () => {
    if (selectedId == null) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await saveMetricTemplateTree(selectedId, dims);
      await reloadList(r.template.id);
      setSelectedId(r.template.id);
      setNotice(
        r.is_new
          ? `原模板已被历史评价引用，改动已另存为新模板「${r.template.name}」。`
          : "已保存到当前模板。",
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  /* ── 维度树本地编辑（不可变更新） ── */
  const editDim = (di: number, patch: Partial<DimensionNode>) =>
    setDims((ds) => ds.map((d, i) => (i === di ? { ...d, ...patch } : d)));

  const editSub = (
    di: number,
    si: number,
    patch: Partial<DimensionNode["subs"][number]>,
  ) =>
    setDims((ds) =>
      ds.map((d, i) =>
        i === di
          ? { ...d, subs: d.subs.map((s, j) => (j === si ? { ...s, ...patch } : s)) }
          : d,
      ),
    );

  const editMetric = (
    di: number,
    si: number,
    mi: number,
    patch: Partial<DimensionNode["subs"][number]["metrics"][number]>,
  ) =>
    setDims((ds) =>
      ds.map((d, i) =>
        i === di
          ? {
              ...d,
              subs: d.subs.map((s, j) =>
                j === si
                  ? {
                      ...s,
                      metrics: s.metrics.map((m, k) =>
                        k === mi ? { ...m, ...patch } : m,
                      ),
                    }
                  : s,
              ),
            }
          : d,
      ),
    );

  return (
    <div className="flex min-h-screen">
      <Sidebar activeHref="/resources" />

      <main className="flex-1 min-w-0 min-h-screen md:ml-64 flex flex-col">
        {/* 顶部应用栏 */}
        <header className="flex justify-between items-center w-full px-6 h-16 bg-surface-container-lowest/80 backdrop-blur-md sticky top-0 z-40 border-b border-outline-variant/30">
          <div className="flex items-center gap-3">
            <Link
              href="/resources"
              className="flex items-center gap-2 text-primary font-bold hover:opacity-70 transition-opacity"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              <span className="text-[15px] font-semibold">返回资源中心</span>
            </Link>
            <div className="h-4 w-px bg-outline-variant mx-2" />
            <h2 className="text-[18px] font-bold text-on-surface">维度指标管理</h2>
          </div>
          <button
            type="button"
            onClick={handleClone}
            disabled={busy || loadingList}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新建模板
          </button>
        </header>

        <section className="p-6 max-w-[1280px] mx-auto w-full flex-1 pb-28 lg:pb-12">
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-low/40 p-4">
            <span className="material-symbols-outlined text-primary">info</span>
            <p className="text-[13px] leading-relaxed text-on-surface-variant">
              左侧管理指标模板（启用 / 克隆 / 删除），右侧编辑所选模板的一/二/三级维度。启用的模板将影响后续
              <Link href="/analytics" className="text-primary font-semibold mx-1 hover:underline">
                分析中心
              </Link>
              的 AI 点评与新评价的维度展示；被历史评价引用的模板保存时会自动另存为新模板。
            </p>
          </div>

          {(error || notice) && (
            <div
              className={`mb-6 flex items-start gap-3 rounded-xl border p-4 ${
                error
                  ? "border-error/30 bg-error/5 text-error"
                  : "border-primary/30 bg-primary/5 text-on-surface-variant"
              }`}
            >
              <span className="material-symbols-outlined">
                {error ? "error" : "check_circle"}
              </span>
              <p className="text-[13px] leading-relaxed">{error ?? notice}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
            <TemplateList
              templates={templates}
              loading={loadingList}
              selectedId={selectedId}
              busy={busy}
              onSelect={setSelectedId}
              onActivate={handleActivate}
              onDelete={setPendingDeleteId}
            />
            <TreeEditor
              selected={selected}
              dims={dims}
              inUse={inUse}
              loading={loadingTree}
              busy={busy}
              onEditDim={editDim}
              onEditSub={editSub}
              onEditMetric={editMetric}
              onSave={handleSave}
            />
          </div>
        </section>
      </main>

      {/* 删除确认 Modal */}
      {pendingDeleteId != null && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-3"
          onClick={() => !busy && setPendingDeleteId(null)}
        >
          <div
            className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant/30"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-[20px] font-bold mb-3">确认删除模板？</h4>
            <p className="text-[15px] text-on-surface-variant mb-6">
              删除后该模板将无法恢复。历史评价已生成的维度结果不受影响。
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingDeleteId(null)}
                disabled={busy}
                className="px-4 py-3 rounded-lg text-[15px] font-bold text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => handleDelete(pendingDeleteId)}
                disabled={busy}
                className="px-6 py-3 rounded-lg text-[15px] font-bold bg-error text-white shadow-md hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {busy && (
                  <span className="material-symbols-outlined animate-spin text-[18px]">
                    progress_activity
                  </span>
                )}
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      <MobileBottomNav activeHref="/resources" />
    </div>
  );
}

/* ──────────────── 左侧：模板列表 ──────────────── */

function TemplateList({
  templates,
  loading,
  selectedId,
  busy,
  onSelect,
  onActivate,
  onDelete,
}: {
  templates: MetricTemplate[];
  loading: boolean;
  selectedId: number | null;
  busy: boolean;
  onSelect: (id: number) => void;
  onActivate: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="bg-white/50 rounded-xl border border-outline-variant/20 p-4 animate-pulse"
          >
            <div className="space-y-2">
              <div className="h-3 bg-surface-container-highest/50 rounded w-1/2" />
              <div className="h-2 bg-surface-container-highest/50 rounded w-3/4" />
              <div className="h-8 bg-surface-container-highest/50 rounded-lg mt-3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3 lg:sticky lg:top-24 self-start">
      {templates.map((t) => {
        const active = t.is_active === 1;
        const isSel = t.id === selectedId;
        return (
          <div
            key={t.id}
            className={`rounded-xl border p-4 cursor-pointer shadow-sm transition-all ${
              isSel
                ? "border-primary bg-primary/5"
                : "border-outline-variant/30 bg-surface-container-lowest hover:border-outline-variant/60"
            }`}
            onClick={() => onSelect(t.id)}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[15px] font-bold text-on-surface truncate">
                {t.name}
              </h3>
              {active && (
                <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">
                  启用中
                </span>
              )}
            </div>
            <p className="text-[12px] text-on-surface-variant mt-1">
              {t.dim_count} 一级 · {t.sub_count} 二级 · {t.metric_count} 三级
            </p>
            <div className="flex items-center gap-2 mt-3">
              {!active && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    onActivate(t.id);
                  }}
                  className="flex-1 h-8 rounded-lg bg-primary/10 text-primary text-[12px] font-semibold hover:bg-primary/20 disabled:opacity-50 transition-colors"
                >
                  一键切换
                </button>
              )}
              <button
                type="button"
                disabled={busy || active}
                title={active ? "启用中的模板不可删除" : "删除模板"}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(t.id);
                }}
                className="h-8 w-8 grid place-items-center rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error disabled:opacity-30 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────── 右侧：维度树编辑器 ──────────────── */

// 编辑态文本输入统一样式：明显的边框 + 浅背景，聚焦时主色高亮，一眼可辨可编辑
const editInputClass =
  "flex-1 min-w-0 rounded-md border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all";

// 一级维度图标：按名称关键词匹配，回退到顺序色板
const DIM_ICON_BY_KEYWORD: Array<[RegExp, string]> = [
  [/空间|美学|建筑|风貌|景观/, "architecture"],
  [/商业|业态|零售|店|消费/, "storefront"],
  [/文化|体验|艺术|历史|活动/, "theater_comedy"],
  [/活力|人气|客流|热度|氛围/, "bolt"],
  [/传播|影响|社交|媒体|品牌/, "hub"],
  [/环境|品质|卫生|绿化|设施/, "eco"],
];
const DIM_ICON_FALLBACK = ["architecture", "storefront", "theater_comedy", "bolt", "hub", "category"];

function dimIcon(name: string, index: number): string {
  for (const [re, icon] of DIM_ICON_BY_KEYWORD) {
    if (re.test(name)) return icon;
  }
  return DIM_ICON_FALLBACK[index % DIM_ICON_FALLBACK.length];
}

function TreeEditor({
  selected,
  dims,
  inUse,
  loading,
  busy,
  onEditDim,
  onEditSub,
  onEditMetric,
  onSave,
}: {
  selected: MetricTemplate | null;
  dims: DimensionNode[];
  inUse: boolean;
  loading: boolean;
  busy: boolean;
  onEditDim: (di: number, patch: Partial<DimensionNode>) => void;
  onEditSub: (
    di: number,
    si: number,
    patch: Partial<DimensionNode["subs"][number]>,
  ) => void;
  onEditMetric: (
    di: number,
    si: number,
    mi: number,
    patch: Partial<DimensionNode["subs"][number]["metrics"][number]>,
  ) => void;
  onSave: () => void;
}) {
  // 一级维度折叠态：默认全部收起，dim_id -> 是否展开
  const [openDims, setOpenDims] = useState<Record<number, boolean>>({});
  const toggleDim = (dimId: number) =>
    setOpenDims((m) => ({ ...m, [dimId]: !m[dimId] }));

  // 阅读 / 编辑模式：默认阅读，点击「修改」才进入编辑
  const [editMode, setEditMode] = useState(false);
  // 切换模板时回到阅读模式（渲染期派生，避免 effect 内 setState）
  const prevIdRef = useRef<number | null>(selected?.id ?? null);
  if (prevIdRef.current !== (selected?.id ?? null)) {
    prevIdRef.current = selected?.id ?? null;
    if (editMode) setEditMode(false);
  }

  const handleSaveClick = () => {
    onSave();
    setEditMode(false);
  };

  if (!selected) {
    return (
      <div className="grid place-items-center rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm min-h-100 text-on-surface-variant">
        <p className="text-[15px]">请选择左侧模板，或点击右上角新建一个模板。</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="rounded-xl border border-outline-variant/30 bg-white/50 shadow-sm min-h-100 animate-pulse" />
    );
  }

  const allOpen = dims.length > 0 && dims.every((d) => openDims[d.dim_id]);

  return (
    <div>
      {/* 头部信息条：面包屑 + 标题 + 操作 */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4 mb-8 border-b border-outline-variant/30 pb-6">
        <div className="min-w-0">
          <nav className="flex items-center gap-2 text-on-surface-variant text-[13px] mb-2">
            <span>模板中心</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-primary font-semibold truncate">{selected.name}</span>
            {inUse && (
              <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded bg-on-surface/5 text-on-surface-variant">
                已被引用
              </span>
            )}
          </nav>
          <h3 className="text-[28px] leading-8 font-black tracking-tight text-on-surface">
            当前权重配置
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setOpenDims(
                allOpen ? {} : Object.fromEntries(dims.map((d) => [d.dim_id, true])),
              )
            }
            className="flex items-center gap-1 rounded-full border border-outline-variant/40 px-3 py-2 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">
              {allOpen ? "unfold_less" : "unfold_more"}
            </span>
            {allOpen ? "全部收起" : "全部展开"}
          </button>
          {editMode ? (
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={busy}
              className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-white shadow-md hover:opacity-90 disabled:opacity-50 transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">save</span>
              {inUse ? "另存为新模板" : "保存更改"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="flex items-center gap-2 rounded-full border border-outline-variant/40 px-5 py-2 text-sm font-bold text-on-surface hover:bg-surface-container transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
              点击修改
            </button>
          )}
        </div>
      </div>

      {/* 维度手风琴（发丝线分隔） */}
      <div className="space-y-px bg-outline-variant/40 border border-outline-variant/40 rounded-xl overflow-hidden">
        {dims.map((d, di) => {
          const open = !!openDims[d.dim_id];
          const dimPct = Math.round(d.dim_weight * 1000) / 10;
          return (
          <div key={d.dim_id} className="bg-surface-container-lowest">
            {/* 一级维度（手风琴头部） */}
            <div
              onClick={() => toggleDim(d.dim_id)}
              className="w-full flex items-center justify-between gap-4 p-5 hover:bg-surface-container transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <span className="w-10 h-10 rounded-lg bg-primary/5 grid place-items-center text-primary shrink-0">
                  <span className="material-symbols-outlined">
                    {dimIcon(d.dim_name, di)}
                  </span>
                </span>
                {editMode ? (
                  <input
                    value={d.dim_name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onEditDim(di, { dim_name: e.target.value })}
                    className={`${editInputClass} text-[17px] font-bold max-w-md`}
                    placeholder="一级维度名称"
                  />
                ) : (
                  <h4 className="text-[17px] font-bold text-on-surface truncate">
                    {d.dim_name}
                  </h4>
                )}
              </div>
              <div className="flex items-center gap-6 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase hidden sm:inline">
                    权重占比
                  </span>
                  {editMode ? (
                    <PercentInput
                      value={d.dim_weight}
                      onChange={(v) => onEditDim(di, { dim_weight: v })}
                    />
                  ) : (
                    <span className="text-[20px] font-black text-primary tabular-nums">
                      {dimPct}%
                    </span>
                  )}
                </div>
                <span
                  className="material-symbols-outlined text-on-surface-variant transition-transform duration-300"
                  style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
                >
                  expand_more
                </span>
              </div>
            </div>

            {/* 展开内容 */}
            {open && (
            <div className="border-t border-outline-variant/30 bg-surface-container-low/30 p-5 space-y-5">
              {d.subs.map((s, si) => (
                <div
                  key={s.sub_id}
                  className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest overflow-hidden"
                >
                  {/* 二级维度头部 */}
                  <div className="flex items-center gap-3 bg-surface-container/50 px-4 py-3 border-b border-outline-variant/30">
                    {editMode ? (
                      <input
                        value={s.sub_name}
                        onChange={(e) => onEditSub(di, si, { sub_name: e.target.value })}
                        className={`${editInputClass} text-[14px] font-bold`}
                        placeholder="二级维度名称"
                      />
                    ) : (
                      <span className="flex-1 min-w-0 text-[14px] font-bold text-on-surface truncate">
                        {s.sub_name}
                      </span>
                    )}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-bold text-on-surface-variant uppercase">
                        权重占比
                      </span>
                      {editMode ? (
                        <PercentInput
                          value={s.sub_weight}
                          onChange={(v) => onEditSub(di, si, { sub_weight: v })}
                        />
                      ) : (
                        <span className="text-[16px] font-black text-primary tabular-nums">
                          {Math.round(s.sub_weight * 1000) / 10}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 三级指标表格 */}
                  <table className="w-full text-left">
                    <thead className="bg-surface-container/30 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-2 font-bold">三级指标</th>
                        <th className="px-4 py-2 font-bold text-right w-28">权重 (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/30">
                      {s.metrics.map((m, mi) => (
                        <tr key={m.metric_id} className="align-top">
                          <td className="px-4 py-3">
                            {editMode ? (
                              <>
                                <input
                                  value={m.metric_name}
                                  onChange={(e) =>
                                    onEditMetric(di, si, mi, { metric_name: e.target.value })
                                  }
                                  className={`${editInputClass} w-full text-[13px] font-medium`}
                                  placeholder="指标名称"
                                />
                                <textarea
                                  value={m.metric_desc ?? ""}
                                  onChange={(e) =>
                                    onEditMetric(di, si, mi, { metric_desc: e.target.value })
                                  }
                                  placeholder="指标说明（用于 AI 点评参考）"
                                  rows={2}
                                  className="mt-2 w-full resize-y rounded-md border border-outline-variant bg-surface-container-lowest p-2 text-[12px] text-on-surface-variant outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                />
                              </>
                            ) : (
                              <>
                                <p className="text-[13px] font-medium text-on-surface">
                                  {m.metric_name}
                                </p>
                                {m.metric_desc && (
                                  <p className="mt-1 text-[12px] text-on-surface-variant leading-relaxed">
                                    {m.metric_desc}
                                  </p>
                                )}
                              </>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {editMode ? (
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={Math.round(m.metric_weight * 1000) / 10}
                                onChange={(e) =>
                                  onEditMetric(di, si, mi, {
                                    metric_weight: Number(e.target.value) / 100,
                                  })
                                }
                                className="w-20 text-right rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-[13px] font-bold text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                              />
                            ) : (
                              <span className="text-[13px] font-bold text-on-surface tabular-nums">
                                {Math.round(m.metric_weight * 1000) / 10}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────── 权重输入（百分比，存回 0-1） ──────────────── */

function PercentInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="shrink-0 flex items-center gap-1 text-[12px] font-bold text-on-surface-variant">
      <input
        type="number"
        step="0.1"
        min="0"
        max="100"
        value={Math.round(value * 1000) / 10}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-16 rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-[13px] font-bold text-on-surface text-right outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
      />
      %
    </label>
  );
}
