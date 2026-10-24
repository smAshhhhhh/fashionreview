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
  updateMetricTemplateMeta,
  listStreetTypes,
  updateStreetType,
  type MetricTemplate,
  type DimensionNode,
  type StreetType,
} from "../../../lib/api";

/* ──────────────────────────────────────────────
 * 指标体系模板管理 /resources/metrics
 * 顶部：模板分组（通用 + 7 种街区类型），各组模板相互独立、各有一个启用模板；
 *       选中类型分组时可编辑类型名称与定义（AI 匹配依据）。
 * 模板列表：启用态 + 一键切换 / 重命名 / 删除，卡片显示创建时间。
 *       「新建模板」在当前分组生成标准体系、各级权重平均分配的模板。
 * 下方：所选模板的一/二/三级维度可编辑树（名称、权重、指标说明）。
 * 保存：若模板已被历史评价引用（in_use），强制另存为新模板（留在原分组）；否则原地保存。
 * ────────────────────────────────────────────── */

/** 某分组（null=通用）的模板。 */
function inGroup(list: MetricTemplate[], group: number | null) {
  return list.filter((t) => t.street_type_id === group);
}

/** 分组内默认选中：启用模板优先，其次第一个。 */
function defaultPick(list: MetricTemplate[]): number | null {
  return (list.find((t) => t.is_active === 1) ?? list[0])?.id ?? null;
}

/** 本地时间 ISO 字符串 → 「2026.10.1 00:49」（月、日不补零）。 */
function formatCreateTime(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value);
  if (!m) return value;
  const [, y, mo, d, h, mi] = m;
  return `${y}.${Number(mo)}.${Number(d)} ${h}:${mi}`;
}

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
  const [types, setTypes] = useState<StreetType[]>([]);
  // 当前模板分组：null=通用，否则为街区类型 id
  const [groupId, setGroupId] = useState<number | null>(null);
  const [typeDirty, setTypeDirty] = useState(false);
  const [renaming, setRenaming] = useState<MetricTemplate | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const dirty = !loadingTree && !treeError && JSON.stringify(dims) !== snapshot;
  const { confirmDiscard, dialog: draftDialog } = useResourceDraft(
    dirty || typeDirty,
  );
  const groupTemplates = inGroup(templates, groupId);
  const groupType = types.find((t) => t.id === groupId) ?? null;
  const groupName = groupType?.name ?? "通用";
  const selectTemplate = (id: number) => {
    if (id === selectedId || busy) return;
    confirmDiscard(() => {
      setNotice(null);
      setError(null);
      setSelectedId(id);
    });
  };
  const selectGroup = (group: number | null) => {
    if (group === groupId || busy) return;
    confirmDiscard(() => {
      setNotice(null);
      setError(null);
      setTypeDirty(false);
      setGroupId(group);
      const pick = defaultPick(inGroup(templates, group));
      setSelectedId(pick);
      if (pick == null) {
        setDims([]);
        setSnapshot("[]");
      }
    });
  };
  const retryList = async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const [, typeList] = await Promise.all([reloadList(), listStreetTypes()]);
      setTypes(typeList);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "加载模板失败，请重试。");
    } finally {
      setLoadingList(false);
    }
  };

  const reloadList = async (keepId?: number) => {
    const data = await listMetricTemplates();
    setTemplates(data);
    const scoped = inGroup(data, groupId);
    if (scoped.length === 0) {
      setSelectedId(null);
      setDims([]);
      setSnapshot("[]");
      return;
    }
    const pick =
      keepId != null && scoped.some((t) => t.id === keepId)
        ? keepId
        : selectedId != null && scoped.some((t) => t.id === selectedId)
          ? selectedId
          : defaultPick(scoped);
    setSelectedId(pick);
  };

  // 初次加载模板列表
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, typeList] = await Promise.all([
          listMetricTemplates(),
          listStreetTypes(),
        ]);
        if (cancelled) return;
        setTemplates(data);
        setTypes(typeList);
        setSelectedId(defaultPick(inGroup(data, null)));
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
      setNotice(
        `已切换「${groupName}」分组的启用模板，该分组后续点评将使用该模板。`,
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "启用失败");
    } finally {
      setBusy(false);
    }
  };

  // 新建：在当前分组生成标准体系、各级权重平均分配的模板，不复制任何现有模板
  const handleCreate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const meta = await createMetricTemplate({ streetTypeId: groupId });
      await refreshAfterMutation(meta.id);
      setNotice(
        `已在「${groupName}」新建模板「${meta.name}」：标准指标体系，各级权重平均分配，可直接编辑。`,
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "新建模板失败");
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (name: string) => {
    if (!renaming || busy) return;
    setBusy(true);
    setRenameError(null);
    try {
      const meta = await updateMetricTemplateMeta(
        renaming.id,
        name,
        renaming.description,
      );
      setTemplates((items) =>
        items.map((item) =>
          item.id === meta.id ? { ...item, name: meta.name } : item,
        ),
      );
      setRenaming(null);
      setNotice(`已将模板重命名为「${meta.name}」。`);
    } catch (e: unknown) {
      setRenameError(e instanceof Error ? e.message : "重命名失败，请重试。");
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
    <ResourceShell title="维度指标管理">

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
            模板按街区类型分组，各组相互独立。点评时选定类型后用该类型下启用的模板评分，未选类型时用「通用」分组的启用模板。启用的模板将影响后续
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

        <div
          role="group"
          aria-label="模板分组"
          className="resource-segmented max-w-full overflow-x-auto"
        >
          {[{ id: null, name: "通用" }, ...types].map((g) => (
            <button
              key={g.id ?? "general"}
              type="button"
              aria-pressed={g.id === groupId}
              disabled={busy || loadingList}
              onClick={() => selectGroup(g.id)}
            >
              {g.name}
            </button>
          ))}
        </div>

        {groupType && (
          <TypeDefinitionPanel
            key={groupType.id}
            type={groupType}
            onDirtyChange={setTypeDirty}
            onSaved={(updated) =>
              setTypes((items) =>
                items.map((item) => (item.id === updated.id ? updated : item)),
              )
            }
          />
        )}

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
            templates={groupTemplates}
            groupName={groupName}
            loading={loadingList}
            selectedId={selectedId}
            busy={busy}
            createDisabled={busy || loadingList || !!listError}
            onCreate={() => confirmDiscard(() => void handleCreate())}
            onSelect={selectTemplate}
            onRename={(t) => {
              setRenameError(null);
              setRenaming(t);
            }}
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
            删除后该模板不再出现在列表中，也不能再启用。已用它生成的历史评价照常显示原来的维度和权重。
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

      {renaming && (
        <RenameTemplateDialog
          key={renaming.id}
          template={renaming}
          busy={busy}
          error={renameError}
          onClose={() => setRenaming(null)}
          onSubmit={(name) => void handleRename(name)}
        />
      )}

      {draftDialog}
    </ResourceShell>
  );
}

/* ──────────────── 左侧：模板列表 ──────────────── */

function TemplateList({
  templates,
  groupName,
  loading,
  selectedId,
  busy,
  createDisabled,
  onCreate,
  onSelect,
  onRename,
  onActivate,
  onDelete,
}: {
  templates: MetricTemplate[];
  groupName: string;
  loading: boolean;
  selectedId: number | null;
  busy: boolean;
  createDisabled: boolean;
  onCreate: () => void;
  onSelect: (id: number) => void;
  onRename: (template: MetricTemplate) => void;
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
      description={`${groupName} · 共 ${templates.length} 个`}
      action={
        <button
          type="button"
          onClick={onCreate}
          disabled={createDisabled}
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
              aria-label={`选择模板：${t.name}${active ? "（启用中）" : ""}`}
              title={t.name}
              aria-pressed={isSel}
              onClick={() => onSelect(t.id)}
              className="resource-template-select"
            />
            <div className="resource-template-summary">
              <div className="resource-template-name">
                {/* 单行省略；完整名称由覆盖整卡的选择按钮 title 悬浮展示 */}
                <span className="min-w-0 truncate resource-body font-bold text-on-surface">
                  {t.name}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`重命名模板：${t.name}`}
                  title="重命名"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRename(t);
                  }}
                  className="resource-template-icon"
                >
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined resource-icon"
                  >
                    edit
                  </span>
                </button>
              </div>
            </div>
            {/* 底部一行：左侧创建时间，右侧启用圆圈 + 删除 */}
            <div className="resource-template-footer">
              <p className="resource-template-date">
                {t.create_time ? formatCreateTime(t.create_time) : ""}
              </p>
              <div className="resource-template-icons">
                {/* 启用状态：实心圆圈勾 = 启用中；空心圆 = 未启用，点击启用 */}
                <button
                  type="button"
                  disabled={busy || active}
                  aria-pressed={active}
                  aria-label={
                    active ? `「${t.name}」启用中` : `启用模板：${t.name}`
                  }
                  title={active ? "启用中" : "启用该模板"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onActivate(t.id);
                  }}
                  className="resource-template-icon"
                >
                  <span
                    aria-hidden="true"
                    className={`material-symbols-outlined resource-icon ${
                      active ? "resource-icon--filled" : ""
                    }`}
                  >
                    {active ? "check_circle" : "radio_button_unchecked"}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={busy || active}
                  aria-label={`删除模板：${t.name}`}
                  title={active ? "启用中的模板不可删除" : "删除模板"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(t.id);
                  }}
                  className="resource-template-icon resource-template-icon--danger"
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
          </div>
        );
      })}
    </ResourceMasterList>
  );
}

/* ──────────────── 模板重命名 ──────────────── */

function RenameTemplateDialog({
  template,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  template: MetricTemplate;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(template.name);
  const trimmed = name.trim();
  const unchanged = trimmed === template.name;
  return (
    <ResourceDialog title="重命名模板" busy={busy} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed && !unchanged) onSubmit(trimmed);
        }}
      >
        <label
          htmlFor="rename-template-name"
          className="block resource-caption font-semibold text-on-surface-variant px-1 mb-1.5"
        >
          模板名称
        </label>
        <input
          id="rename-template-name"
          data-dialog-initial-focus
          maxLength={100}
          value={name}
          aria-invalid={!trimmed}
          aria-describedby={!trimmed ? "rename-template-error" : undefined}
          onChange={(e) => setName(e.target.value)}
          className="resource-field w-full"
        />
        {!trimmed && (
          <p id="rename-template-error" className="mt-1.5 text-sm text-error">
            请填写模板名称。
          </p>
        )}
        <div className="mt-4">
          <ResourceFeedback error={error} />
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="resource-button resource-button--quiet"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={busy || !trimmed || unchanged}
            className="resource-button resource-button--primary"
          >
            {busy && (
              <span
                aria-hidden="true"
                className="material-symbols-outlined animate-spin resource-icon"
              >
                progress_activity
              </span>
            )}
            保存
          </button>
        </div>
      </form>
    </ResourceDialog>
  );
}

/* ──────────────── 街区类型定义（类型分组时显示） ──────────────── */

function TypeDefinitionPanel({
  type,
  onSaved,
  onDirtyChange,
}: {
  type: StreetType;
  onSaved: (updated: StreetType) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [name, setName] = useState(type.name);
  const [description, setDescription] = useState(type.description ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty =
    name !== type.name || description !== (type.description ?? "");
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const nameOk = name.trim() !== "";

  const handleSave = async () => {
    if (!dirty || !nameOk || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await updateStreetType(type.id, {
        name: name.trim(),
        description: description.trim() === "" ? null : description.trim(),
      });
      setName(updated.name);
      setDescription(updated.description ?? "");
      onSaved(updated);
      setSaved(true);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby={`street-type-definition-${type.id}`}
      className="resource-panel resource-panel--padded"
    >
      <fieldset disabled={saving} className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id={`street-type-definition-${type.id}`}
            className="resource-item-title font-bold text-on-surface"
          >
            类型定义
          </h2>
          <p className="resource-caption text-on-surface-variant">
            AI 依据这段定义判断街区与该类型的匹配度
          </p>
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor={`street-type-name-${type.id}`}
            className="block resource-caption font-semibold text-on-surface-variant px-1"
          >
            类型名称
          </label>
          <input
            id={`street-type-name-${type.id}`}
            maxLength={100}
            value={name}
            aria-invalid={!nameOk}
            onChange={(e) => {
              setSaved(false);
              setName(e.target.value);
            }}
            className="resource-field w-full"
          />
          {!nameOk && (
            <p className="text-sm text-error">请填写类型名称。</p>
          )}
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor={`street-type-description-${type.id}`}
            className="block resource-caption font-semibold text-on-surface-variant px-1"
          >
            类型定义
          </label>
          <textarea
            id={`street-type-description-${type.id}`}
            rows={3}
            maxLength={2000}
            value={description}
            onChange={(e) => {
              setSaved(false);
              setDescription(e.target.value);
            }}
            className="resource-field w-full leading-relaxed resize-y"
          />
        </div>
        <ResourceFeedback
          error={saveError}
          message={saved && !dirty ? "类型定义已保存。" : null}
        />
        <div className="resource-editor-footer">
          {dirty && (
            <p role="status" className="text-sm text-on-surface-variant">
              有未保存的修改
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!dirty || !nameOk || saving}
            className="resource-button resource-button--primary"
          >
            {saving && (
              <span
                aria-hidden="true"
                className="material-symbols-outlined animate-spin resource-icon"
              >
                progress_activity
              </span>
            )}
            保存类型定义
          </button>
        </div>
      </fieldset>
    </section>
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

  // 编辑区唯一提示文案：不合规优先，其次保存失败原因
  const editHint =
    editMode && hasWeightProblem
      ? `有 ${weightCheck.problems.length} 项名称或权重需要修正，无法保存`
      : (saveError ?? "");

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
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="resource-detail-title">
              当前权重配置
            </h2>
            {inUse && (
              <span className="shrink-0 resource-caption font-bold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
                已被引用
              </span>
            )}
          </div>
          {/* 编辑区唯一的提示位，样式同首页输入框提醒：权重 / 名称不合规，或保存失败。
              常驻 role="alert" 区域只换文案，读屏才能稳定播报；
              具体哪组有问题，看该组输入框的红色描边 */}
          {/* 固定占一行高度：提示出现 / 消失时下方内容不跳动 */}
          <p
            className="mt-1 min-h-5 break-words text-sm leading-5 text-error"
            role="alert"
          >
            {editHint}
          </p>
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

      {dims.length === 0 && (
        <p className="py-10 text-center text-on-surface-variant">
          此模板暂无维度配置。
        </p>
      )}
      {/* 维度手风琴：每个一级维度一张卡片，展开后的二、三级也包在卡片内 */}
      <div className="resource-dimension-list">
        {dims.map((d, di) => {
          const open = !!openDims[d.dim_id];
          const dimPct = Math.round(d.dim_weight * 1000) / 10;
          return (
            <div key={d.dim_id} className="resource-dimension-card">
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
                {d.subs.map((s, si) => (
                  /* 二级维度：表头即二级名称与权重占比，表体为其下三级指标 */
                  <div
                    key={s.sub_id}
                    className="resource-panel resource-scroll-card"
                  >
                    <div
                      tabIndex={0}
                      role="region"
                      aria-label={`${s.sub_name} · 指标表，可横向滚动`}
                      className="overflow-x-auto resource-table-viewport"
                    >
                      <table className="w-full min-w-80 text-left">
                        <thead className="bg-surface-container-low">
                          <tr>
                            <th scope="col" className="px-4 py-2">
                              {editMode ? (
                                <input
                                  aria-label={`${d.dim_name} · 第 ${si + 1} 个二级维度名称`}
                                  maxLength={100}
                                  value={s.sub_name}
                                  onChange={(e) =>
                                    onEditSub(di, si, { sub_name: e.target.value })
                                  }
                                  className={`${editInputClass} w-full resource-detail font-bold`}
                                  placeholder="二级维度名称"
                                />
                              ) : (
                                <span className="resource-detail font-bold text-on-surface wrap-anywhere">
                                  {s.sub_name}
                                </span>
                              )}
                            </th>
                            <th
                              scope="col"
                              className="px-4 py-2 text-right w-28"
                            >
                              {editMode ? (
                                <PercentInput
                                  label={`${s.sub_name} · 二级维度权重百分比`}
                                  value={s.sub_weight}
                                  onChange={(v) =>
                                    onEditSub(di, si, { sub_weight: v })
                                  }
                                  invalid={
                                    !isOneHundred(weightCheck.subSums.get(d.dim_id) ?? 0)
                                  }
                                />
                              ) : (
                                <span className="resource-detail font-black text-primary tabular-nums">
                                  {Math.round(s.sub_weight * 1000) / 10}%
                                </span>
                              )}
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
                                      aria-invalid={
                                        !isOneHundred(
                                          weightCheck.metricSums.get(s.sub_id) ?? 0,
                                        )
                                      }
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
                          </tbody>
                        </table>
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
 * 0.9999（DECIMAL(6,4) 存不下 1/3），差 0.0001。输入按 0.1% 步进，手填错误
 * 至少差 0.001（如 20.2 + 19.9 + 20×3 = 100.1%）。取两者之间的 0.0005，
 * 放过等分舍入，拦住 0.1% 的错填。
 */
const WEIGHT_SUM_TOLERANCE = 0.0005;

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

