"use client";

import { useEffect, useMemo, useState } from "react";
import ResourceDialog from "../../components/ResourceDialog";
import ResourceFeedback from "../../components/ResourceFeedback";
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
  score: "维度评分",
  report: "报告生成",
};
const STAGE_ORDER = ["recognize", "score", "report"];

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
              value={selected?.name ?? "未选择模板"}
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
                          <div className={`
                            mt-1 flex items-center gap-1.5 resource-caption
                            text-on-surface-variant
                          `}>
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${t.enabled === 1
                                  ? "bg-primary"
                                  : "bg-surface-container-highest"
                                }`}
                            />
                            {t.enabled === 1 ? "已启用" : "已停用"}
                            {t.dim_code && (
                              <span className="ml-1 font-mono">
                                · {t.dim_code}
                              </span>
                            )}
                          </div>
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
                    setNotice("已保存新版本。");
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
                  onToggled={async (updated) => {
                    setTemplates((items) =>
                      items.map((item) =>
                        item.id === updated.id ? updated : item,
                      ),
                    );
                    try {
                      await reload(selected.id);
                    } catch {
                      setError(
                        "启用状态已更新，但列表刷新失败。请重新加载后核对。",
                      );
                    }
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
  onToggled,
  onError,
  onClearNotice,
  onDirtyChange,
}: {
  template: PromptTemplate;
  onSaved: (updated: PromptTemplate) => Promise<void>;
  onRolledBack: (updated: PromptTemplate) => Promise<void>;
  onToggled: (updated: PromptTemplate) => Promise<void>;
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
  const [saving, setSaving] = useState(false);
  const [enabledBusy, setEnabledBusy] = useState(false);
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

  const toggleEnabled = async () => {
    if (enabledBusy || saving || historyBusy) return;
    setEnabledBusy(true);
    onError(null);
    try {
      const updated = await updatePrompt(template.id, {
        enabled: template.enabled === 1 ? 0 : 1,
      });
      await onToggled(updated);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "切换启用状态失败");
    } finally {
      setEnabledBusy(false);
    }
  };

  const handleSave = async () => {
    if (saving || enabledBusy || historyBusy) return;
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
      await onSaved(updated);
    } catch (e: unknown) {
      setFieldError(e instanceof Error ? e.message : "保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="resource-editor resource-editor--sections @container/editor">
      {/* 头部：名称 + 阶段/版本 + 启用开关 */}
      <div className="resource-detail-header">
        <div className="min-w-0">
          <p className="resource-caption text-on-surface-variant mb-1">
            {STAGE_LABEL[template.stage] ?? template.stage} · 当前 v
            {template.version}
          </p>
          <h2 className="resource-detail-title">
            {template.name}
          </h2>
        </div>
        <label className="flex min-h-11 items-center gap-2 cursor-pointer shrink-0 self-start select-none">
          <span className="resource-caption font-semibold text-on-surface-variant">
            {template.enabled === 1 ? "已启用" : "已停用"}
          </span>
          <span className="relative inline-flex items-center">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={template.enabled === 1}
              aria-label={`启用模板：${template.name}`}
              disabled={enabledBusy || saving || historyBusy}
              onChange={toggleEnabled}
            />
            <div className="resource-switch" />
          </span>
        </label>
      </div>

      {/* 可用占位符 */}
      {placeholders.length > 0 && (
        <div>
          <p className="resource-caption font-semibold text-on-surface-variant mb-2">
            可用占位符
          </p>
          <div className="flex flex-wrap gap-2">
            {placeholders.map((p) => (
              <code
                key={p}
                className={`
                  max-w-full break-all resource-caption bg-surface-container-low
                  text-on-surface px-2 py-1 rounded-full border border-divider
                `}
              >
                {p}
              </code>
            ))}
          </div>
        </div>
      )}

      <fieldset
        disabled={saving || enabledBusy || historyBusy}
        className="resource-panel resource-scroll-card resource-scroll-card--padded min-w-0"
      >
        <legend className="sr-only">Prompt 模板内容</legend>
        {/* 名称 / 模型 / 温度 */}
        <div className="resource-editor-fields">
          <div className="space-y-1.5">
            <label
              htmlFor="prompt-name"
              className="block resource-caption font-semibold text-on-surface-variant px-1"
            >
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
            <label
              htmlFor="prompt-model"
              className="block resource-caption font-semibold text-on-surface-variant px-1"
            >
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
            <label
              htmlFor="prompt-temperature"
              className="block resource-caption font-semibold text-on-surface-variant px-1"
            >
              采样温度 0~2（留空用默认）
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
              aria-describedby="prompt-temperature-hint"
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder="如 0.7"
              className={inputClass}
            />
            <p
              id="prompt-temperature-hint"
              className="text-sm text-on-surface-variant"
            >
              范围为 0 到 2，留空使用默认设置。
            </p>
          </div>
        </div>

        {/* System / User / 更新日志 */}
        <div className="resource-prompt-fields">
          <div>
            <label
              htmlFor="prompt-systemPrompt"
              className="block resource-caption font-semibold text-on-surface-variant mb-2 px-1"
            >
              System Prompt（系统提示词）
            </label>
            <textarea
              id="prompt-systemPrompt"
              rows={4}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className={`${inputClass} font-mono leading-relaxed resize-y`}
            />
          </div>
          <div>
            <label
              htmlFor="prompt-userTemplate"
              className="block resource-caption font-semibold text-on-surface-variant mb-2 px-1"
            >
              User Template（用户模版）
            </label>
            <textarea
              id="prompt-userTemplate"
              aria-invalid={submitted && !userTemplate.trim()}
              aria-describedby={
                submitted && !userTemplate.trim()
                  ? "prompt-user-error"
                  : undefined
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
          </div>
          <div>
            <label
              htmlFor="prompt-changeNote"
              className="block resource-caption font-semibold text-on-surface-variant mb-2 px-1"
            >
              更新日志（选填，记入版本历史）
            </label>
            <textarea
              id="prompt-changeNote"
              maxLength={500}
              rows={2}
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="简要说明此次更新的内容…"
              className={`${inputClass} resize-y`}
            />
          </div>
        </div>

        <div className="mb-4">
          <ResourceFeedback error={fieldError} />
        </div>
        <div className="resource-editor-footer">
          {dirty && (
            <p role="status" className="text-sm text-on-surface-variant">
              有未保存的修改
            </p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || enabledBusy || historyBusy}
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
            保存新版本
          </button>
        </div>
      </fieldset>
      {/* 版本历史（独立面板） */}
      <HistoryPanel
        disabled={saving || enabledBusy}
        onBusyChange={setHistoryBusy}
        templateId={template.id}
        onRolledBack={onRolledBack}
      />
    </div>
  );
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
