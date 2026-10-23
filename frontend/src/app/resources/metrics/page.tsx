"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ResourceDialog from "../../components/ResourceDialog";
import ResourceFeedback from "../../components/ResourceFeedback";
import useResourceDraft from "../../components/useResourceDraft";
import { metricFieldProblems } from "../../../lib/resource-validation";
import ResourceShell from "../../components/ResourceShell";
import ResourceContentCard from "../../components/ResourceContentCard";
import ResourceMasterList from "../../components/ResourceMasterList";
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
  const [listError, setListError] = useState<string | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [treeRevision, setTreeRevision] = useState(0);
  const [snapshot, setSnapshot] = useState("[]");
  const dirty = !loadingTree && !treeError && JSON.stringify(dims) !== snapshot;
  const { confirmDiscard, dialog: draftDialog } = useResourceDraft(dirty);
  const selectTemplate = (id: number) => {
    if (id === selectedId || busy) return;
    confirmDiscard(() => {
      setNotice(null);
      setError(null);
      setSelectedId(id);
    });
  };
  const retryList = async () => {
    setLoadingList(true);
    setListError(null);
    try {
      await reloadList();
    } catch (e) {
      setListError(e instanceof Error ? e.message : "加载模板失败，请重试。");
    } finally {
      setLoadingList(false);
    }
  };

  const reloadList = async (keepId?: number) => {
    const data = await listMetricTemplates();
    setTemplates(data);
    if (data.length === 0) {
      setSelectedId(null);
      setDims([]);
      setSnapshot("[]");
      return;
    }
    const pick =
      keepId != null && data.some((t) => t.id === keepId)
        ? keepId
        : selectedId != null && data.some((t) => t.id === selectedId)
          ? selectedId
          : data[0].id;
    setSelectedId(pick);
  };

  // 初次加载模板列表
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listMetricTemplates();
        if (cancelled) return;
        setTemplates(data);
        setSelectedId(data[0]?.id ?? null);
      } catch (e: unknown) {
        if (!cancelled)
          setListError(
            e instanceof Error ? e.message : "加载模板失败，请重试。",
          );
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 选中模板变化时拉取维度树
  useEffect(() => {
    if (selectedId == null) return;
    let cancelled = false;
    (async () => {
      setLoadingTree(true);
      setTreeError(null);
      setDims([]);
      setSnapshot("[]");
      setNotice(null);
      try {
        const t = await getMetricTemplateTree(selectedId);
        if (cancelled) return;
        setDims(t.tree);
        setSnapshot(JSON.stringify(t.tree));
        setInUse(t.in_use);
      } catch (e: unknown) {
        if (!cancelled)
          setTreeError(
            e instanceof Error ? e.message : "加载模板内容失败，请重试。",
          );
      } finally {
        if (!cancelled) setLoadingTree(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, treeRevision]);

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  const refreshAfterMutation = async (id?: number) => {
    try {
      await reloadList(id);
    } catch {
      setError(
        "操作已完成，但模板列表刷新失败。请重新加载后核对，避免重复提交。",
      );
    }
  };

  /* ── 模板级操作 ── */
  const handleActivate = async (id: number) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await activateMetricTemplate(id);
      await refreshAfterMutation(id);
      setNotice("已切换启用模板，后续 AI 点评与新评价将使用该模板维度。");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "启用失败");
    } finally {
      setBusy(false);
    }
  };

  const handleClone = async () => {
    if (busy || loadingTree || treeError) return;
    setBusy(true);
    setError(null);
    try {
      const meta = await createMetricTemplate({
        sourceTemplateId: selectedId ?? undefined,
      });
      await refreshAfterMutation(meta.id);
      setNotice(`已新建模板「${meta.name}」（复制自当前模板），可直接编辑。`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "新建模板失败");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (busy) return;
    setDeleteError(null);
    setBusy(true);
    setError(null);
    try {
      await deleteMetricTemplate(id);
      if (selectedId === id) setSelectedId(null);
      await refreshAfterMutation();
      setNotice("模板已删除。");
      setPendingDeleteId(null);
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : "删除失败，请重试。");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (selectedId == null || busy || treeError) return false;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await saveMetricTemplateTree(selectedId, dims);
      setSnapshot(JSON.stringify(dims));
      const localTemplate: MetricTemplate = {
        ...r.template,
        in_use: r.is_new ? 0 : Number(inUse),
        dim_count: dims.length,
        sub_count: dims.reduce((sum, dim) => sum + dim.subs.length, 0),
        metric_count: dims.reduce(
          (sum, dim) =>
            sum +
            dim.subs.reduce((count, sub) => count + sub.metrics.length, 0),
          0,
        ),
      };
      setTemplates((items) =>
        items.some((item) => item.id === localTemplate.id)
          ? items.map((item) =>
            item.id === localTemplate.id ? localTemplate : item,
          )
          : [...items, localTemplate],
      );
      try {
        await reloadList(r.template.id);
      } catch {
        setError(
          "内容已保存，但模板列表刷新失败。请重新加载后核对，避免重复保存。",
        );
      }
      setSelectedId(r.template.id);
      setNotice(
        r.is_new
          ? `原模板已被历史评价引用，改动已另存为新模板「${r.template.name}」。`
          : "已保存到当前模板。",
      );
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败，请重试。");
      return false;
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
          ? {
            ...d,
            subs: d.subs.map((s, j) => (j === si ? { ...s, ...patch } : s)),
          }
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
    <ResourceShell
      title="维度指标管理"
      actions={
        <button
          type="button"
          onClick={() => confirmDiscard(() => void handleClone())}
          disabled={
            busy || loadingList || loadingTree || !!listError || !!treeError
          }
          className="resource-button resource-button--primary"
        >
          <span
            aria-hidden="true"
            className="material-symbols-outlined resource-icon"
          >
            add
          </span>
          新建模板
        </button>
      }
    >

      <section className="resource-content">
        {/* 说明条 */}
        <div className="resource-note">
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-primary"
          >
            info
          </span>
          <p className="resource-caption leading-relaxed text-on-surface-variant">
            选择模板，管理启用状态与各级指标权重。启用的模板将影响后续
            <Link
              href="/analytics"
              className="text-primary font-semibold mx-1 hover:underline"
            >
              分析中心
            </Link>
            的 AI
            点评与新评价的维度展示；被历史评价引用的模板保存时会自动另存为新模板。
          </p>
        </div>

        <ResourceFeedback
          error={!selected || treeError ? error : null}
          message={!error ? notice : null}
        />
        {listError && (
          <ResourceFeedback
            error={listError}
            onRetry={() => void retryList()}
          />
        )}

        <div className="resource-workbench">
          <TemplateList
            templates={templates}
            loading={loadingList}
            selectedId={selectedId}
            busy={busy}
            onSelect={selectTemplate}
            onActivate={(id) => confirmDiscard(() => void handleActivate(id))}
            onDelete={(id) => {
              const open = () => {
                setDeleteError(null);
                setPendingDeleteId(id);
              };
              if (id === selectedId) confirmDiscard(open);
              else open();
            }}
          />
          <ResourceContentCard label="指标权重配置内容" variant="stack">
            {treeError ? (
              <ResourceFeedback
                error={treeError}
                onRetry={() => setTreeRevision((revision) => revision + 1)}
              />
            ) : (
              <TreeEditor
                key={selectedId}
                selected={selected}
                dims={dims}
                inUse={inUse}
                loading={loadingTree}
                saveError={error}
                busy={busy}
                onEditDim={editDim}
                onEditSub={editSub}
                onEditMetric={editMetric}
                onSave={handleSave}
              />
            )}
          </ResourceContentCard>
        </div>
      </section>


      {/* 删除确认 Modal */}
      {pendingDeleteId != null && (
        <ResourceDialog
          title="确认删除模板？"
          busy={busy}
          onClose={() => setPendingDeleteId(null)}
        >
          <p className="resource-body text-on-surface-variant mb-6">
            删除后该模板将无法恢复。历史评价已生成的维度结果不受影响。
          </p>
          <ResourceFeedback error={deleteError} />
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setPendingDeleteId(null)}
              disabled={busy}
              className="resource-button resource-button--quiet"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => handleDelete(pendingDeleteId)}
              disabled={busy}
              className="resource-button resource-button--destructive"
            >
              {busy && (
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined animate-spin resource-icon"
                >
                  progress_activity
                </span>
              )}
              确认删除
            </button>
          </div>
        </ResourceDialog>
      )}

      {draftDialog}
    </ResourceShell>
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
      <div className="resource-master-list resource-selector-loading">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="resource-panel resource-panel--padded animate-pulse"
          >
            <div className="space-y-2">
              <div className="h-3 bg-surface-container-high rounded w-1/2" />
              <div className="h-2 bg-surface-container-high rounded w-3/4" />
              <div className="h-8 bg-surface-container-high rounded-lg mt-3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <ResourceMasterList
      label="指标模板"
      value={
        templates.find((item) => item.id === selectedId)?.name ?? "未选择模板"
      }
    >
      {templates.length === 0 && (
        <p className="p-4 text-sm text-on-surface-variant">暂无指标模板。</p>
      )}
      {templates.map((t) => {
        const active = t.is_active === 1;
        const isSel = t.id === selectedId;
        return (
          <div
            key={t.id}
            className={`resource-list-item resource-template-card ${isSel
                ? "resource-list-item--selected"
                : ""
              }`}
          >
            <button
              type="button"
              disabled={busy}
              aria-label={`选择模板：${t.name}`}
              aria-describedby={`metric-template-summary-${t.id}`}
              aria-pressed={isSel}
              onClick={() => onSelect(t.id)}
              className="resource-template-select"
            />
            <div className="resource-template-summary">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 resource-body font-bold text-on-surface [overflow-wrap:anywhere]">
                  {t.name}
                </span>
                {active && (
                  <span className={`
                    shrink-0 resource-caption font-bold px-2 py-0.5 rounded-full
                    bg-primary/10 text-primary
                  `}>
                    启用中
                  </span>
                )}
              </div>
              <p
                id={`metric-template-summary-${t.id}`}
                className="resource-caption text-on-surface-variant mt-1"
              >
                {t.dim_count} 一级 · {t.sub_count} 二级 · {t.metric_count} 三级
              </p>
            </div>
            <div className="resource-template-actions">
              {!active && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    onActivate(t.id);
                  }}
                  className="resource-button resource-button--tinted flex-1"
                >
                  一键切换
                </button>
              )}
              <button
                type="button"
                disabled={busy || active || t.in_use === 1}
                aria-label={`删除模板：${t.name}`}
                title={
                  active
                    ? "启用中的模板不可删除"
                    : t.in_use === 1
                      ? "已被历史评价引用的模板不可删除"
                      : "删除模板"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(t.id);
                }}
                className="resource-button resource-button--danger resource-button--icon"
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined resource-icon"
                >
                  delete
                </span>
              </button>
            </div>
          </div>
        );
      })}
    </ResourceMasterList>
  );
}

/* ──────────────── 右侧：维度树编辑器 ──────────────── */

// 编辑态文本输入统一样式：明显的边框 + 浅背景，聚焦时主色高亮，一眼可辨可编辑
const editInputClass = "resource-field flex-1 min-w-0";

// 一级维度图标：按名称关键词匹配，回退到顺序色板
const DIM_ICON_BY_KEYWORD: Array<[RegExp, string]> = [
  [/空间|美学|建筑|风貌|景观/, "architecture"],
  [/商业|业态|零售|店|消费/, "storefront"],
  [/文化|体验|艺术|历史|活动/, "theater_comedy"],
  [/活力|人气|客流|热度|氛围/, "bolt"],
  [/传播|影响|社交|媒体|品牌/, "hub"],
  [/环境|品质|卫生|绿化|设施/, "eco"],
];
const DIM_ICON_FALLBACK = [
  "architecture",
  "storefront",
  "theater_comedy",
  "bolt",
  "hub",
  "category",
];

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
  saveError,
}: {
  saveError: string | null;
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
  onSave: () => Promise<boolean>;
}) {
  // 一级维度折叠态：默认全部收起，dim_id -> 是否展开
  const [openDims, setOpenDims] = useState<Record<number, boolean>>({});
  const toggleDim = (dimId: number) =>
    setOpenDims((m) => ({ ...m, [dimId]: !m[dimId] }));

  // 权重校验（与后端 validate_tree_weights 同口径）：每组同级兄弟之和须为 100%
  const weightCheck = useMemo(() => {
    const dimSum = sumWeights(dims.map((d) => d.dim_weight));
    const subSums = new Map<number, number>();
    const metricSums = new Map<number, number>();
    for (const d of dims) {
      subSums.set(d.dim_id, sumWeights(d.subs.map((s) => s.sub_weight)));
      for (const s of d.subs) {
        metricSums.set(
          s.sub_id,
          sumWeights(s.metrics.map((m) => m.metric_weight)),
        );
      }
    }
    // 「组内无条目」才跳过（与后端 _check_weight_group 同口径）；
    // 有条目但全填 0 要报，否则保存后会被静默等权化
    const problems: string[] = metricFieldProblems(dims);
    if (dims.length > 0 && !isOneHundred(dimSum)) {
      problems.push(`一级维度合计 ${pct(dimSum)}%`);
    }
    for (const d of dims) {
      const ss = subSums.get(d.dim_id);
      if (d.subs.length > 0 && ss != null && !isOneHundred(ss)) {
        problems.push(`「${d.dim_name}」的二级维度合计 ${pct(ss)}%`);
      }
      for (const s of d.subs) {
        const ms = metricSums.get(s.sub_id);
        if (s.metrics.length > 0 && ms != null && !isOneHundred(ms)) {
          problems.push(
            `「${d.dim_name}」→「${s.sub_name}」的三级指标合计 ${pct(ms)}%`,
          );
        }
      }
    }
    return { dimSum, subSums, metricSums, problems };
  }, [dims]);

  const hasWeightProblem = weightCheck.problems.length > 0;

  // 阅读 / 编辑模式：默认阅读，点击「修改」才进入编辑
  const [editMode, setEditMode] = useState(false);
  // 切换模板时回到阅读模式（渲染期派生，避免 effect 内 setState）
  const prevIdRef = useRef<number | null>(selected?.id ?? null);
  if (prevIdRef.current !== (selected?.id ?? null)) {
    prevIdRef.current = selected?.id ?? null;
    if (editMode) setEditMode(false);
  }

  const handleSaveClick = async () => {
    // 权重不合规时不提交：后端同样会拒（422），这里提前拦住以免白跑一趟请求
    if (hasWeightProblem) return;
    if (await onSave()) setEditMode(false);
  };

  if (!selected) {
    return (
      <div className={`
        resource-panel resource-panel--padded min-h-60 grid place-items-center text-center
        text-on-surface-variant
      `}>
        <p className="resource-body">
          选择指标模板，或使用「新建模板」创建一个模板。
        </p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="resource-panel animate-pulse min-h-100" />
    );
  }

  const allOpen = dims.length > 0 && dims.every((d) => openDims[d.dim_id]);

  return (
    <fieldset
      disabled={busy}
      className="resource-editor resource-editor--sections @container/editor"
    >
      <legend className="sr-only">指标权重配置</legend>
      {/* 头部信息条：面包屑 + 标题 + 操作 */}
      <div className="resource-detail-header">
        <div className="min-w-0">
          {inUse && (
            <span className={`
              inline-block mb-2 resource-caption font-bold px-2 py-0.5 rounded-full
              bg-surface-container text-on-surface-variant
            `}>
              已被引用
            </span>
          )}
          <h2 className="resource-detail-title">
            当前权重配置
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setOpenDims(
                allOpen
                  ? {}
                  : Object.fromEntries(dims.map((d) => [d.dim_id, true])),
              )
            }
            className="resource-button resource-button--secondary"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined resource-icon"
            >
              {allOpen ? "unfold_less" : "unfold_more"}
            </span>
            {allOpen ? "全部收起" : "全部展开"}
          </button>
          {editMode ? (
            <button
              type="button"
              onClick={() => void handleSaveClick()}
              disabled={busy || hasWeightProblem}
              title={
                hasWeightProblem
                  ? "权重合计不为 100%，请先修正后再保存"
                  : undefined
              }
              className="resource-button resource-button--primary"
            >
              <span
                aria-hidden="true"
                className="material-symbols-outlined resource-icon"
              >
                save
              </span>
              {inUse ? "另存为新模板" : "保存更改"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="resource-button resource-button--secondary"
            >
              <span
                aria-hidden="true"
                className="material-symbols-outlined resource-icon"
              >
                edit
              </span>
              点击修改
            </button>
          )}
        </div>
      </div>

      <ResourceFeedback error={saveError} />
      {/* 权重合计提示：仅编辑态显示。合计失真不会报错（后端按实际和归一化），
          所以必须在界面上说清楚，否则填错了页面显示的百分比与真实生效的权重不一致。 */}
      {editMode && (
        <div
          className={`rounded-2xl border px-5 py-4 ${hasWeightProblem
              ? "border-warning-border/40 bg-warning-container"
              : "border-success/20 bg-success-container"
            }`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`material-symbols-outlined resource-icon shrink-0 ${hasWeightProblem ? "text-warning" : "text-success"
                }`}
            >
              {hasWeightProblem ? "warning" : "check_circle"}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`resource-detail font-bold ${hasWeightProblem ? "text-warning" : "text-success"
                  }`}
              >
                {hasWeightProblem
                  ? `有 ${weightCheck.problems.length} 项名称或权重需要修正，无法保存`
                  : "各级权重合计均为 100%"}
              </p>
              {hasWeightProblem && (
                <ul className="mt-2 space-y-1">
                  {weightCheck.problems.slice(0, 8).map((p) => (
                    <li key={p} className="resource-caption text-warning">
                      · {p}
                    </li>
                  ))}
                  {weightCheck.problems.length > 8 && (
                    <li className="resource-caption text-warning">
                      · 另有 {weightCheck.problems.length - 8}{" "}
                      组，展开对应维度查看
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {dims.length === 0 && (
        <p className="py-10 text-center text-on-surface-variant">
          此模板暂无维度配置。
        </p>
      )}
      {/* 维度手风琴（发丝线分隔） */}
      <div className="resource-dimension-list">
        {dims.map((d, di) => {
          const open = !!openDims[d.dim_id];
          const dimPct = Math.round(d.dim_weight * 1000) / 10;
          return (
            <div key={d.dim_id} className="resource-section">
              {/* 一级维度（手风琴头部） */}
              <div className={`
                w-full flex flex-wrap items-center justify-between gap-3
              `}>
                <div className="flex items-center gap-3 min-w-0 flex-1 basis-32">
                  <span className="resource-section-icon">
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined"
                    >
                      {dimIcon(d.dim_name, di)}
                    </span>
                  </span>
                  {editMode ? (
                    <input
                      aria-label={`第 ${di + 1} 个一级维度名称`}
                      maxLength={100}
                      value={d.dim_name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        onEditDim(di, { dim_name: e.target.value })
                      }
                      className={`${editInputClass} resource-item-title font-bold max-w-md`}
                      placeholder="一级维度名称"
                    />
                  ) : (
                    <h3 className="text-on-surface [overflow-wrap:anywhere] resource-item-title">
                      {d.dim_name}
                    </h3>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-3 sm:gap-6 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={`
                      resource-caption font-bold text-on-surface-variant uppercase hidden
                      sm:inline
                    `}>
                      权重占比
                    </span>
                    {editMode ? (
                      <PercentInput
                        label={`${d.dim_name} · 一级维度权重百分比`}
                        value={d.dim_weight}
                        onChange={(v) => onEditDim(di, { dim_weight: v })}
                        invalid={!isOneHundred(weightCheck.dimSum)}
                      />
                    ) : (
                      <span className="resource-item-title font-black text-primary tabular-nums">
                        {dimPct}%
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`${open ? "收起" : "展开"}${d.dim_name}`}
                    aria-expanded={open}
                    aria-controls={`dimension-${d.dim_id}`}
                    onClick={() => toggleDim(d.dim_id)}
                    className="resource-button resource-button--quiet resource-button--icon"
                  >
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined resource-chevron"
                      data-collapsed={!open}
                    >
                      expand_more
                    </span>
                  </button>
                </div>
              </div>

              {/* 展开内容 */}
              <div
                id={`dimension-${d.dim_id}`}
                hidden={!open}
                className="resource-dimension-content"
              >
                {/* 该维度下二级权重合计，便于就地定位是哪一组填错 */}
                {editMode && (
                  <SumBadge
                    label="二级维度合计"
                    total={weightCheck.subSums.get(d.dim_id) ?? 0}
                  />
                )}
                {d.subs.map((s, si) => (
                  <div
                    key={s.sub_id}
                    className="resource-section"
                  >
                    {/* 二级维度头部 */}
                    <div className={`
                      flex flex-wrap items-center gap-3
                    `}>
                      {editMode ? (
                        <input
                          aria-label={`${d.dim_name} · 第 ${si + 1} 个二级维度名称`}
                          maxLength={100}
                          value={s.sub_name}
                          onChange={(e) =>
                            onEditSub(di, si, { sub_name: e.target.value })
                          }
                          className={`${editInputClass} resource-detail font-bold`}
                          placeholder="二级维度名称"
                        />
                      ) : (
                        <span className="flex-1 min-w-0 resource-detail font-bold text-on-surface truncate">
                          {s.sub_name}
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-2 shrink-0">
                        <span className="resource-caption font-bold text-on-surface-variant uppercase">
                          权重占比
                        </span>
                        {editMode ? (
                          <PercentInput
                            label={`${s.sub_name} · 二级维度权重百分比`}
                            value={s.sub_weight}
                            onChange={(v) =>
                              onEditSub(di, si, { sub_weight: v })
                            }
                          />
                        ) : (
                          <span className="resource-body font-black text-primary tabular-nums">
                            {Math.round(s.sub_weight * 1000) / 10}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 三级指标表格 */}
                    <div
                      tabIndex={0}
                      role="region"
                      aria-label={`${s.sub_name} · 指标表，可横向滚动`}
                      className="resource-panel resource-scroll-card"
                    >
                      <div className="overflow-x-auto resource-table-viewport">
                        <table className="w-full min-w-80 text-left">
                          <thead className={`
                            bg-surface-container-low resource-caption font-bold
                            text-on-surface-variant uppercase tracking-wider
                          `}>
                            <tr>
                              <th scope="col" className="px-4 py-2 font-bold">
                                三级指标
                              </th>
                              <th
                                scope="col"
                                className="px-4 py-2 font-bold text-right w-28"
                              >
                                权重 (%)
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-divider">
                            {s.metrics.map((m, mi) => (
                              <tr key={m.metric_id} className="align-top">
                                <td className="px-4 py-3">
                                  {editMode ? (
                                    <>
                                      <input
                                        aria-label={`${s.sub_name} · 第 ${mi + 1} 个指标名称`}
                                        maxLength={200}
                                        value={m.metric_name}
                                        onChange={(e) =>
                                          onEditMetric(di, si, mi, {
                                            metric_name: e.target.value,
                                          })
                                        }
                                        className={`${editInputClass} w-full resource-caption font-medium`}
                                        placeholder="指标名称"
                                      />
                                      <textarea
                                        aria-label={`${m.metric_name} · 指标说明`}
                                        value={m.metric_desc ?? ""}
                                        onChange={(e) =>
                                          onEditMetric(di, si, mi, {
                                            metric_desc: e.target.value,
                                          })
                                        }
                                        placeholder="指标说明（用于 AI 点评参考）"
                                        rows={2}
                                        className="resource-field mt-2 w-full resize-y"
                                      />
                                    </>
                                  ) : (
                                    <>
                                      <p className="resource-caption font-medium text-on-surface">
                                        {m.metric_name}
                                      </p>
                                      {m.metric_desc && (
                                        <p className={`
                                          mt-1 resource-caption text-on-surface-variant
                                          leading-relaxed
                                        `}>
                                          {m.metric_desc}
                                        </p>
                                      )}
                                    </>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {editMode ? (
                                    <input
                                      aria-label={`${m.metric_name} · 权重百分比`}
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      max="100"
                                      value={
                                        Math.round(m.metric_weight * 1000) / 10
                                      }
                                      onChange={(e) =>
                                        onEditMetric(di, si, mi, {
                                          metric_weight:
                                            Number(e.target.value) / 100,
                                        })
                                      }
                                      className="resource-field w-20 text-right"
                                    />
                                  ) : (
                                    <span className="resource-caption font-bold text-on-surface tabular-nums">
                                      {Math.round(m.metric_weight * 1000) / 10}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                            {/* 三级权重合计行：紧跟在输入框下方，改一格立刻看到合计变化 */}
                            {editMode && (
                              <tr className="bg-surface-container-low/60">
                                <td className="px-4 py-2 resource-caption font-bold text-on-surface-variant">
                                  合计
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <SumText
                                    total={
                                      weightCheck.metricSums.get(s.sub_id) ?? 0
                                    }
                                  />
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ──────────────── 权重合计校验 ──────────────── */

/**
 * 同级权重和的容差，与后端 metric_template_service.WEIGHT_SUM_TOLERANCE 一致。
 *
 * 通例是和恰为 1（如三级 0.5/0.3/0.2）；但等分时除不尽 —— 3 个 0.3333 和为
 * 0.9999（DECIMAL(6,4) 存不下 1/3）。容差只为放过这类等分舍入，对不等权的情形
 * 没有放松：0.9 / 1.1 这类真错填差值是容差的 100 倍，照样判为不合规。
 */
const WEIGHT_SUM_TOLERANCE = 0.001;

/** 权重求和；空数组返回 0。 */
function sumWeights(weights: number[]): number {
  return weights.reduce((acc, w) => acc + (Number.isFinite(w) ? w : 0), 0);
}

/**
 * 和是否约等于 1。
 *
 * 不对 0 放行：有条目却全填 0 必须判为不合规 —— 保存后 scoring_service 会退化成
 * 等权，界面却显示 0%，正是要防的静默失真。「组内无条目」由调用方按长度跳过，
 * 与后端 _check_weight_group 的 `if not weights: return` 同口径。
 */
function isOneHundred(total: number): boolean {
  return Math.abs(total - 1) <= WEIGHT_SUM_TOLERANCE;
}

/** 0-1 权重和转百分比显示，最多一位小数（99.99% 这类舍入噪声收敛为 100）。 */
function pct(total: number): number {
  return Math.round(total * 1000) / 10;
}

/* ──────────────── 权重输入（百分比，存回 0-1） ──────────────── */

function PercentInput({
  label,
  value,
  onChange,
  invalid = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  /** 所在分组合计不为 100% 时描边标红，提示问题出在这一组 */
  invalid?: boolean;
}) {
  return (
    <label className="shrink-0 flex items-center gap-1 resource-caption font-bold text-on-surface-variant">
      <input
        aria-label={label}
        aria-invalid={
          invalid || !Number.isFinite(value) || value < 0 || value > 1
        }
        type="number"
        step="0.1"
        min="0"
        max="100"
        value={Math.round(value * 1000) / 10}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="resource-field resource-percentage-input"
      />
      %
    </label>
  );
}

/** 分组权重合计徽标（二级维度组用）。 */
function SumBadge({ label, total }: { label: string; total: number }) {
  const ok = isOneHundred(total);
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 py-2 resource-caption font-bold ${ok
          ? "bg-success-container text-success"
          : "bg-warning-container text-warning"
        }`}
    >
      <span
        aria-hidden="true"
        className="material-symbols-outlined resource-icon"
      >
        {ok ? "check_circle" : "warning"}
      </span>
      {label} {pct(total)}%{!ok && "（应为 100%）"}
    </div>
  );
}

/** 分组权重合计文字（三级指标表格的合计行用）。 */
function SumText({ total }: { total: number }) {
  const ok = isOneHundred(total);
  return (
    <span
      className={`resource-caption font-black tabular-nums ${ok ? "text-success" : "text-warning"
        }`}
      title={ok ? undefined : "该组三级指标权重合计应为 100%"}
    >
      {pct(total)}
      {!ok && " ⚠"}
    </span>
  );
}
