"use client";

import { useEffect, useMemo, useState } from "react";
import ResourceDialog from "../../components/ResourceDialog";
import ResourceFeedback from "../../components/ResourceFeedback";
import ResourceEditActions from "../../components/ResourceEditActions";
import useResourceDraft from "../../components/useResourceDraft";
import ResourceShell from "../../components/ResourceShell";
import ResourceContentCard from "../../components/ResourceContentCard";
import ResourceMasterList from "../../components/ResourceMasterList";
import {
  listPrompts,
  updatePrompt,
  listPromptHistory,
  rollbackPrompt,
  type PromptTemplate,
  type PromptTemplateHistory,
  type PromptTemplateUpdate,
} from "../../../lib/api";

/* ──────────────────────────────────────────────
 * Prompt 管理页 /resources/prompts
 * 左：按阶段（recognize / score / report）分组的模板列表。
 * 右：所选模板的编辑器（名称/模型/温度/System/User）+ 独立的版本历史面板（回滚）。
 * 布局对齐「维度指标管理」页；数据全部接真实 /prompts API。
 * ────────────────────────────────────────────── */

const STAGE_LABEL: Record<string, string> = {
  recognize: "街巷识别",
  classify: "类型匹配",
  score: "维度评分",
  report: "报告生成",
};
const STAGE_ORDER = ["recognize", "classify", "score", "report"];

export default function PromptsPage() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const { confirmDiscard, dialog: draftDialog } = useResourceDraft(dirty);

  const reload = async (keepId?: number) => {
    const data = await listPrompts();
    setTemplates(data);
    if (data.length === 0) {
      setSelectedId(null);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listPrompts();
        if (cancelled) return;
        setTemplates(data);
        if (data.length > 0) setSelectedId(data[0].id);
      } catch (e: unknown) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "加载模板失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const retryList = async () => {
    setLoading(true);
    setError(null);
    try {
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载模板失败，请重试。");
    } finally {
      setLoading(false);
    }
  };
  const selectTemplate = (id: number) => {
    if (id === selectedId) return;
    confirmDiscard(() => {
      setDirty(false);
      setError(null);
      setNotice(null);
      setSelectedId(id);
    });
  };

  const grouped = useMemo(() => {
    const map = new Map<string, PromptTemplate[]>();
    for (const t of templates) {
      const arr = map.get(t.stage) ?? [];
      arr.push(t);
      map.set(t.stage, arr);
    }
    return map;
  }, [templates]);

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  return (
    <ResourceShell title="Prompt 管理">
      <section className="resource-content">
        <ResourceFeedback
          error={error}
          message={notice}
          onRetry={
            templates.length === 0 ? () => void retryList() : undefined
          }
        />

        {loading ? (
          <LoadingSkeleton />
        ) : (
          <div className="resource-workbench">
            {/* 顶部模板列表 */}
            <ResourceMasterList
              label="Prompt 模板"
              description={[
                ...STAGE_ORDER,
                ...Array.from(grouped.keys()).filter(
                  (stage) => !STAGE_ORDER.includes(stage),
                ),
              ]
                .filter((stage) => (grouped.get(stage)?.length ?? 0) > 0)
                .map((stage) => STAGE_LABEL[stage] ?? stage)
                .join(" · ")}
            >
              {[
                ...STAGE_ORDER,
                ...Array.from(grouped.keys()).filter(
                  (stage) => !STAGE_ORDER.includes(stage),
                ),
              ].map((stage) => {
                const items = grouped.get(stage) ?? [];
                if (items.length === 0) return null;
                return (
                  <div
                    key={stage}
                    role="group"
                    aria-label={STAGE_LABEL[stage] ?? stage}
                    className="resource-prompt-group"
                  >
                    {items.map((t) => {
                      const isSel = t.id === selectedId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          aria-pressed={isSel}
                          title={t.name}
                          onClick={() => selectTemplate(t.id)}
                          className={`resource-list-item w-full disabled:opacity-60 ${isSel
                              ? "resource-list-item--selected"
                              : ""
                            }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="resource-detail font-bold text-on-surface [overflow-wrap:anywhere]">
                              {t.name}
                            </span>
                            <span className={`
                              shrink-0 resource-caption font-semibold
                              text-on-surface-variant tabular-nums
                            `}>
                              v{t.version}
                            </span>
                          </div>
                          {/* 每张卡片统一一行英文编码：评分阶段用维度编码，其余用阶段编码 */}
                          <p className="mt-1 resource-caption font-mono text-on-surface-variant">
                            {t.dim_code ?? t.stage.toUpperCase()}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </ResourceMasterList>

            <ResourceContentCard label="Prompt 编辑与版本历史" variant="stack">
              {selected ? (
                <PromptEditor
                  key={`${selected.id}-${editorRevision}`}
                  onDirtyChange={setDirty}
                  template={selected}
                  onSaved={async (updated) => {
                    setTemplates((items) =>
                      items.map((item) =>
                        item.id === updated.id ? updated : item,
                      ),
                    );
                    try {
                      await reload(selected.id);
                    } catch {
                      setError(
                        "新版本已保存，但列表刷新失败。请重新加载后核对，避免重复保存。",
                      );
                    }
                  }}
                  onRolledBack={async (updated) => {
                    setTemplates((items) =>
                      items.map((item) =>
                        item.id === updated.id ? updated : item,
                      ),
                    );
                    try {
                      await reload(selected.id);
                    } catch {
                      setError(
                        "回滚已完成，但列表刷新失败。请重新加载后核对。",
                      );
                    }
                    setNotice("已回滚到所选版本。");
                    setDirty(false);
                    setEditorRevision((value) => value + 1);
                  }}
                  onError={setError}
                  onClearNotice={() => setNotice(null)}
                />
              ) : (
                <div className={`
                  resource-panel resource-panel--padded min-h-60 grid place-items-center
                  text-center text-on-surface-variant
                `}>
                  <p className="resource-body">
                    暂无可编辑模板，请重新加载列表或联系管理员。
                  </p>
                </div>
              )}
            </ResourceContentCard>
          </div>
        )}
      </section>


      {draftDialog}
    </ResourceShell>
  );
}

/* ──────────────── 右侧：编辑器 ──────────────── */

const inputClass = "resource-field w-full";

function PromptEditor({
  template,
  onSaved,
  onRolledBack,
  onError,
  onClearNotice,
  onDirtyChange,
}: {
  template: PromptTemplate;
  onSaved: (updated: PromptTemplate) => Promise<void>;
  onRolledBack: (updated: PromptTemplate) => Promise<void>;
  onError: (msg: string | null) => void;
  onClearNotice: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [name, setName] = useState(template.name);
  const [systemPrompt, setSystemPrompt] = useState(
    template.system_prompt ?? "",
  );
  const [userTemplate, setUserTemplate] = useState(template.user_template);
  const [model, setModel] = useState(template.model ?? "");
  const [temperature, setTemperature] = useState(
    template.temperature != null ? String(template.temperature) : "",
  );
  const [changeNote, setChangeNote] = useState("");
  // 阅读 / 编辑模式：默认只读，点「修改」才能编辑
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const dirty =
    name !== template.name ||
    systemPrompt !== (template.system_prompt ?? "") ||
    userTemplate !== template.user_template ||
    model !== (template.model ?? "") ||
    temperature !==
    (template.temperature == null ? "" : String(template.temperature)) ||
    changeNote !== "";
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const placeholders = useMemo(
    () =>
      (template.placeholders ?? "")
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [template.placeholders],
  );

  /** 取消编辑：还原为当前版本内容，回到只读。 */
  const cancelEdit = () => {
    setName(template.name);
    setSystemPrompt(template.system_prompt ?? "");
    setUserTemplate(template.user_template);
    setModel(template.model ?? "");
    setTemperature(
      template.temperature == null ? "" : String(template.temperature),
    );
    setChangeNote("");
    setFieldError(null);
    setSubmitted(false);
    setEditing(false);
  };

  const handleSave = async () => {
    if (saving || historyBusy) return;
    setFieldError(null);
    setSubmitted(true);
    onError(null);
    onClearNotice();
    if (!name.trim() || !userTemplate.trim()) {
      setFieldError(
        !name.trim() ? "请填写模板名称。" : "请填写 User Template 后再保存。",
      );
      document
        .getElementById(!name.trim() ? "prompt-name" : "prompt-userTemplate")
        ?.focus();
      return;
    }
    const tempNum = temperature.trim() === "" ? null : Number(temperature);
    if (
      tempNum != null &&
      (!Number.isFinite(tempNum) || tempNum < 0 || tempNum > 2)
    ) {
      setFieldError("采样温度需为 0~2 之间的数字。");
      document.getElementById("prompt-temperature")?.focus();
      return;
    }
    const body: PromptTemplateUpdate = {
      name: name.trim(),
      system_prompt: systemPrompt.trim() === "" ? null : systemPrompt,
      user_template: userTemplate,
      model: model.trim() === "" ? null : model.trim(),
      temperature: tempNum,
      change_note: changeNote.trim() === "" ? null : changeNote.trim(),
    };
    setSaving(true);
    try {
      const updated = await updatePrompt(template.id, body);
      setName(updated.name);
      setSystemPrompt(updated.system_prompt ?? "");
      setUserTemplate(updated.user_template);
      setModel(updated.model ?? "");
      setTemperature(
        updated.temperature == null ? "" : String(updated.temperature),
      );
      setChangeNote("");
      setSubmitted(false);
      setEditing(false);
      await onSaved(updated);
    } catch (e: unknown) {
      setFieldError(e instanceof Error ? e.message : "保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="resource-editor resource-editor--sections @container/editor">
      {/* 头部：标题 + 修改 / 取消 / 保存 */}
      <div className="resource-detail-header">
        <div className="min-w-0">
          <h2 className="resource-detail-title">
            当前Prompt配置
          </h2>
          {/* 唯一提示位：校验失败或保存失败。固定占一行高度，出现 / 消失时不跳动 */}
          <p
            className="mt-1 min-h-5 break-words text-sm leading-5 text-error"
            role="alert"
          >
            {fieldError ?? ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ResourceEditActions
            editing={editing}
            saving={saving}
            canSave={dirty && !historyBusy}
            saveLabel="保存新版本"
            saveTitle="内容未修改"
            onEdit={() => {
              setFieldError(null);
              setEditing(true);
            }}
            onCancel={cancelEdit}
            onSave={() => void handleSave()}
          />
        </div>
      </div>

      {/* 配置分块：每块一张卡片，块头标明内容，便于区分不同配置项 */}
      <fieldset
        disabled={saving || historyBusy}
        className="resource-config-list min-w-0"
      >
        <legend className="sr-only">Prompt 模板内容</legend>

        <section className="resource-config-section resource-scroll-card" aria-labelledby="prompt-basic-title">
          <div className="resource-config-section-head">
            <h3 id="prompt-basic-title">基础设置</h3>
          </div>
          <div className="resource-config-section-body resource-config-grid">
            {editing ? (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="prompt-name" className="resource-config-term">
                    模版名称
                  </label>
                  <input
                    id="prompt-name"
                    maxLength={100}
                    aria-invalid={submitted && !name.trim()}
                    aria-describedby={
                      submitted && !name.trim() ? "prompt-name-error" : undefined
                    }
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                  />
                  {submitted && !name.trim() && (
                    <p id="prompt-name-error" className="text-sm text-error">
                      请填写模板名称。
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="prompt-model" className="resource-config-term">
                    模型（留空用默认）
                  </label>
                  <input
                    id="prompt-model"
                    maxLength={100}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="如 gpt-4o"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="prompt-temperature" className="resource-config-term">
                    采样温度（0~2，留空用默认）
                  </label>
                  <input
                    id="prompt-temperature"
                    aria-invalid={
                      submitted &&
                      temperature.trim() !== "" &&
                      (!Number.isFinite(Number(temperature)) ||
                        Number(temperature) < 0 ||
                        Number(temperature) > 2)
                    }
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    placeholder="如 0.7"
                    className={inputClass}
                  />
                </div>
              </>
            ) : (
              <>
                <ReadItem label="模版名称" value={template.name} />
                <ReadItem label="模型" value={template.model} empty="默认" />
                <ReadItem
                  label="采样温度"
                  value={
                    template.temperature == null ? null : String(template.temperature)
                  }
                  empty="默认"
                />
              </>
            )}
          </div>
        </section>

        <section className="resource-config-section resource-scroll-card" aria-labelledby="prompt-system-title">
          <div className="resource-config-section-head">
            <h3 id="prompt-system-title">
              System Prompt
              <span className="resource-config-section-sub">系统提示词</span>
            </h3>
          </div>
          <div className="resource-config-section-body">
            {editing ? (
              <textarea
                id="prompt-systemPrompt"
                aria-labelledby="prompt-system-title"
                rows={4}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className={`${inputClass} font-mono leading-relaxed resize-y`}
              />
            ) : (
              <ReadBlock value={template.system_prompt} />
            )}
          </div>
        </section>

        <section className="resource-config-section resource-scroll-card" aria-labelledby="prompt-user-title">
          <div className="resource-config-section-head">
            <h3 id="prompt-user-title">
              User Template
              <span className="resource-config-section-sub">用户模版</span>
            </h3>
          </div>
          <div className="resource-config-section-body space-y-3">
            {/* 占位符只用于 User Template，就近放在这一块 */}
            {placeholders.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="resource-config-term">可用占位符</span>
                {placeholders.map((p) => (
                  <code
                    key={p}
                    className="max-w-full break-all resource-caption bg-surface-container-low text-on-surface px-2 py-0.5 rounded-full border border-divider"
                  >
                    {p}
                  </code>
                ))}
              </div>
            )}
            {editing ? (
              <>
                <textarea
                  id="prompt-userTemplate"
                  aria-labelledby="prompt-user-title"
                  aria-invalid={submitted && !userTemplate.trim()}
                  aria-describedby={
                    submitted && !userTemplate.trim() ? "prompt-user-error" : undefined
                  }
                  rows={6}
                  value={userTemplate}
                  onChange={(e) => setUserTemplate(e.target.value)}
                  className={`${inputClass} font-mono leading-relaxed resize-y`}
                />
                {submitted && !userTemplate.trim() && (
                  <p id="prompt-user-error" className="text-sm text-error">
                    请填写 User Template。
                  </p>
                )}
              </>
            ) : (
              <ReadBlock value={template.user_template} />
            )}
          </div>
        </section>

        {editing && (
          <section className="resource-config-section resource-scroll-card" aria-labelledby="prompt-note-title">
            <div className="resource-config-section-head">
              <h3 id="prompt-note-title">
                更新日志
                <span className="resource-config-section-sub">选填，记入版本历史</span>
              </h3>
            </div>
            <div className="resource-config-section-body">
              <textarea
                id="prompt-changeNote"
                aria-labelledby="prompt-note-title"
                maxLength={500}
                rows={2}
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                placeholder="简要说明此次更新的内容…"
                className={`${inputClass} resize-y`}
              />
            </div>
          </section>
        )}
      </fieldset>
      {/* 版本历史（独立面板）。编辑中禁用回滚：回滚会覆盖正在编辑的内容 */}
      <HistoryPanel
        disabled={saving || editing}
        onBusyChange={setHistoryBusy}
        templateId={template.id}
        onRolledBack={onRolledBack}
      />
    </div>
  );
}

/* ──────────────── 只读展示 ──────────────── */

/** 基础设置里的一项：小标签在上、值在下。 */
function ReadItem({
  label,
  value,
  empty = "未填写",
}: {
  label: string;
  value: string | null | undefined;
  /** 值为空时的占位文案 */
  empty?: string;
}) {
  const hasValue = value != null && value.trim() !== "";
  return (
    <div className="min-w-0 space-y-1">
      <p className="resource-config-term">{label}</p>
      <p
        className={`resource-detail wrap-anywhere ${
          hasValue ? "font-semibold text-on-surface" : "text-on-surface-variant"
        }`}
      >
        {hasValue ? value : empty}
      </p>
    </div>
  );
}

/** 提示词正文：等宽字体、保留换行。 */
function ReadBlock({ value }: { value: string | null | undefined }) {
  if (value == null || value.trim() === "") {
    return <p className="resource-detail text-on-surface-variant">未填写</p>;
  }
  return <pre className="resource-config-code">{value}</pre>;
}

/* ──────────────── 版本历史 / 回滚 ──────────────── */

function HistoryPanel({
  templateId,
  onRolledBack,
  disabled,
  onBusyChange,
}: {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  templateId: number;
  onRolledBack: (updated: PromptTemplate) => Promise<void>;
}) {
  const [history, setHistory] = useState<PromptTemplateHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingVersion, setPendingVersion] = useState<number | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [rollbackError, setRollbackError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setHistoryError(null);
    try {
      setHistory(await listPromptHistory(templateId));
    } catch (e: unknown) {
      setHistoryError(
        e instanceof Error ? e.message : "加载历史失败，请重试。",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listPromptHistory(templateId);
        if (!cancelled) setHistory(data);
      } catch (e: unknown) {
        if (!cancelled)
          setHistoryError(
            e instanceof Error ? e.message : "加载历史失败，请重试。",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const executeRollback = async () => {
    if (pendingVersion == null || rollingBack || disabled) return;
    setRollbackError(null);
    onBusyChange(true);
    setRollingBack(true);
    try {
      const updated = await rollbackPrompt(templateId, pendingVersion);
      setPendingVersion(null);
      await onRolledBack(updated);
    } catch (e: unknown) {
      setRollbackError(e instanceof Error ? e.message : "回滚失败，请重试。");
    } finally {
      setRollingBack(false);
      onBusyChange(false);
    }
  };

  return (
    <section className="resource-section">
      <h3 className="text-on-surface resource-item-title">版本历史</h3>
      <div className="resource-panel resource-scroll-card">

        {historyError && (
          <div className="p-4">
            <ResourceFeedback error={historyError} onRetry={() => void load()} />
          </div>
        )}
        {loading ? (
          <p
            role="status"
            className="px-5 py-6 resource-caption text-on-surface-variant"
          >
            正在加载历史版本…
          </p>
        ) : !historyError && history.length === 0 ? (
          <p className="px-5 py-6 resource-caption text-on-surface-variant">
            暂无历史版本
          </p>
        ) : (
          <div className="divide-y divide-divider">
            {history.map((h) => (
              <div
                key={h.id}
                className={`
                  flex items-center justify-between gap-4 px-5 py-3
                  hover:bg-surface-container-low transition-colors
                `}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="font-bold text-on-surface-variant tabular-nums shrink-0">
                    v{h.version}
                  </span>
                  <span className="resource-detail text-on-surface [overflow-wrap:anywhere]">
                    {h.change_note || "（无变更说明）"}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={disabled || rollingBack}
                  aria-label={`回滚到版本 v${h.version}`}
                  onClick={() => {
                    setRollbackError(null);
                    setPendingVersion(h.version);
                  }}
                  className="resource-button resource-button--secondary"
                >
                  回滚
                </button>
              </div>
            ))}
          </div>
        )}

      </div>
      {/* 回滚确认 Modal */}
      {pendingVersion != null && (
        <ResourceDialog
          title="确认回滚版本？"
          busy={rollingBack}
          onClose={() => setPendingVersion(null)}
        >
          <p className="resource-body text-on-surface-variant mb-6">
            回滚到版本{" "}
            <span className="font-bold text-primary">v{pendingVersion}</span>{" "}
            后，该版本内容会作为新版本写回，当前未保存的编辑将被丢弃。
          </p>
          <ResourceFeedback error={rollbackError} />
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setPendingVersion(null)}
              disabled={rollingBack}
              className="resource-button resource-button--quiet"
            >
              取消
            </button>
            <button
              type="button"
              onClick={executeRollback}
              disabled={rollingBack}
              className="resource-button resource-button--primary"
            >
              {rollingBack && (
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined animate-spin resource-icon"
                >
                  progress_activity
                </span>
              )}
              确认回滚
            </button>
          </div>
        </ResourceDialog>
      )}
    </section>
  );
}

/* ──────────────── 加载骨架 ──────────────── */

function LoadingSkeleton() {
  return (
    <div className="resource-workbench">
      <div className="resource-master-list resource-selector-loading">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="resource-panel resource-panel--padded animate-pulse"
          >
            <div className="h-3 bg-surface-container-high rounded w-2/3 mb-2" />
            <div className="h-2 bg-surface-container-high rounded w-1/3" />
          </div>
        ))}
      </div>
      <ResourceContentCard label="正在加载 Prompt 内容">
        <div className="resource-panel animate-pulse min-h-100" />
      </ResourceContentCard>
    </div>
  );
}
