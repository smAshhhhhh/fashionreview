"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Sidebar from "../../components/Sidebar";
import MobileBottomNav from "../../components/MobileBottomNav";
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

  const reload = async (keepId?: number) => {
    const data = await listPrompts();
    setTemplates(data);
    if (data.length === 0) return;
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
        if (!cancelled) setError(e instanceof Error ? e.message : "加载模板失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    <div className="flex min-h-screen bg-white text-[#0f1419]">
      <Sidebar activeHref="/resources" />

      <main className="flex-1 min-w-0 min-h-screen md:ml-64 flex flex-col">
        {/* 顶部栏 */}
        <header className="sticky top-0 z-40 flex items-center gap-4 px-6 h-14 bg-white/80 backdrop-blur-md border-b border-[#eff3f4]">
          <Link href="/resources" className="flex items-center text-primary-container">
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <h2 className="text-xl font-bold text-[#0f1419]">Prompt 管理</h2>
        </header>

        <section className="p-4 lg:p-6 max-w-7xl mx-auto w-full flex-1 pb-28 lg:pb-12 space-y-6">
          {(error || notice) && (
            <div
              className={`flex items-start gap-3 rounded-2xl border p-4 ${
                error
                  ? "border-error/30 bg-error/5 text-error"
                  : "border-primary-container/30 bg-primary-container/5 text-[#536471]"
              }`}
            >
              <span className="material-symbols-outlined">
                {error ? "error" : "check_circle"}
              </span>
              <p className="text-[13px] leading-relaxed">{error ?? notice}</p>
            </div>
          )}

          {loading ? (
            <LoadingSkeleton />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
              {/* 左：模板列表 */}
              <div className="space-y-6 lg:sticky lg:top-20 self-start">
                {STAGE_ORDER.map((stage) => {
                  const items = grouped.get(stage) ?? [];
                  if (items.length === 0) return null;
                  return (
                    <div key={stage} className="space-y-2">
                      <h3 className="text-[13px] font-bold text-[#536471] uppercase px-1">
                        {STAGE_LABEL[stage] ?? stage}
                      </h3>
                      {items.map((t) => {
                        const isSel = t.id === selectedId;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setSelectedId(t.id)}
                            className={`w-full text-left rounded-2xl border p-3 transition-colors ${
                              isSel
                                ? "border-primary-container bg-surface-container-low"
                                : "border-[#eff3f4] hover:bg-[#f7f9f9]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[14px] font-bold text-[#0f1419] truncate">
                                {t.name}
                              </span>
                              <span className="shrink-0 text-[11px] font-semibold text-[#536471] tabular-nums">
                                v{t.version}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#536471]">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  t.enabled === 1 ? "bg-primary-container" : "bg-surface-container-highest"
                                }`}
                              />
                              {t.enabled === 1 ? "已启用" : "已停用"}
                              {t.dim_code && <span className="ml-1 font-mono">· {t.dim_code}</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* 右：编辑器 + 版本历史 */}
              {selected ? (
                <PromptEditor
                  key={selected.id}
                  template={selected}
                  onSaved={async () => {
                    await reload(selected.id);
                    setNotice("已保存新版本。");
                  }}
                  onRolledBack={async () => {
                    await reload(selected.id);
                    setNotice("已回滚到所选版本。");
                  }}
                  onToggled={() => reload(selected.id)}
                  onError={setError}
                  onClearNotice={() => setNotice(null)}
                />
              ) : (
                <div className="grid place-items-center rounded-2xl border border-[#eff3f4] min-h-100 text-[#536471]">
                  <p className="text-[15px]">请选择左侧模板进行编辑。</p>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <MobileBottomNav activeHref="/resources" />
    </div>
  );
}

/* ──────────────── 右侧：编辑器 ──────────────── */

const inputClass =
  "w-full bg-white border border-[#eff3f4] rounded-xl px-3 py-2 text-[15px] focus:border-primary-container focus:outline-none transition-colors";

function PromptEditor({
  template,
  onSaved,
  onRolledBack,
  onToggled,
  onError,
  onClearNotice,
}: {
  template: PromptTemplate;
  onSaved: () => Promise<void>;
  onRolledBack: () => Promise<void>;
  onToggled: () => Promise<void>;
  onError: (msg: string | null) => void;
  onClearNotice: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [systemPrompt, setSystemPrompt] = useState(template.system_prompt ?? "");
  const [userTemplate, setUserTemplate] = useState(template.user_template);
  const [model, setModel] = useState(template.model ?? "");
  const [temperature, setTemperature] = useState(
    template.temperature != null ? String(template.temperature) : "",
  );
  const [changeNote, setChangeNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [enabledBusy, setEnabledBusy] = useState(false);

  const placeholders = useMemo(
    () =>
      (template.placeholders ?? "")
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [template.placeholders],
  );

  const toggleEnabled = async () => {
    setEnabledBusy(true);
    onError(null);
    try {
      await updatePrompt(template.id, { enabled: template.enabled === 1 ? 0 : 1 });
      await onToggled();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "切换启用状态失败");
    } finally {
      setEnabledBusy(false);
    }
  };

  const handleSave = async () => {
    onError(null);
    onClearNotice();
    const tempNum = temperature.trim() === "" ? null : Number(temperature);
    if (tempNum != null && (Number.isNaN(tempNum) || tempNum < 0 || tempNum > 2)) {
      onError("采样温度需为 0~2 之间的数字");
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
      await updatePrompt(template.id, body);
      await onSaved();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-w-0">
      {/* 头部：名称 + 阶段/版本 + 启用开关 */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4 mb-8 border-b border-[#eff3f4] pb-6">
        <div className="min-w-0">
          <p className="text-[13px] text-[#536471] mb-1">
            {STAGE_LABEL[template.stage] ?? template.stage} · 当前 v{template.version}
          </p>
          <h3 className="text-[28px] leading-8 font-black tracking-tight text-[#0f1419] truncate">
            {template.name}
          </h3>
        </div>
        <label className="flex items-center gap-2 cursor-pointer shrink-0 select-none">
          <span className="text-[13px] font-semibold text-[#536471]">
            {template.enabled === 1 ? "已启用" : "已停用"}
          </span>
          <span className="relative inline-flex items-center">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={template.enabled === 1}
              disabled={enabledBusy}
              onChange={toggleEnabled}
            />
            <div className="w-9 h-5 bg-surface-container-highest rounded-full peer peer-checked:bg-primary-container after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border after:border-gray-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white" />
          </span>
        </label>
      </div>

      {/* 可用占位符 */}
      {placeholders.length > 0 && (
        <div className="mb-6">
          <p className="text-[13px] font-semibold text-[#536471] mb-2">可用占位符</p>
          <div className="flex flex-wrap gap-2">
            {placeholders.map((p) => (
              <code
                key={p}
                className="text-[12px] bg-surface-container-low text-[#0f1419] px-2 py-1 rounded-full border border-[#eff3f4]"
              >
                {p}
              </code>
            ))}
          </div>
        </div>
      )}

      {/* 名称 / 模型 / 温度 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="space-y-1.5">
          <label className="block text-[13px] font-semibold text-[#536471] px-1">模版名称</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label className="block text-[13px] font-semibold text-[#536471] px-1">
            模型（留空用默认）
          </label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="如 gpt-4o"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-[13px] font-semibold text-[#536471] px-1">
            采样温度 0~2（留空用默认）
          </label>
          <input
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
      </div>

      {/* System / User / 更新日志 */}
      <div className="space-y-5 mb-6">
        <div>
          <label className="block text-[13px] font-semibold text-[#536471] mb-2 px-1">
            System Prompt（系统提示词）
          </label>
          <textarea
            rows={4}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className={`${inputClass} font-mono leading-relaxed resize-y`}
          />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-[#536471] mb-2 px-1">
            User Template（用户模版）
          </label>
          <textarea
            rows={6}
            value={userTemplate}
            onChange={(e) => setUserTemplate(e.target.value)}
            className={`${inputClass} font-mono leading-relaxed resize-y`}
          />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-[#536471] mb-2 px-1">
            更新日志（选填，记入版本历史）
          </label>
          <textarea
            rows={2}
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            placeholder="简要说明此次更新的内容…"
            className={`${inputClass} resize-y`}
          />
        </div>
      </div>

      <div className="flex justify-end mb-8">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-full bg-primary-container px-6 py-2 text-[15px] font-bold text-on-primary-fixed shadow-sm hover:opacity-90 disabled:opacity-50 transition-all active:scale-95"
        >
          {saving && (
            <span className="material-symbols-outlined animate-spin text-[18px]">
              progress_activity
            </span>
          )}
          保存新版本
        </button>
      </div>

      {/* 版本历史（独立面板） */}
      <HistoryPanel templateId={template.id} onRolledBack={onRolledBack} onError={onError} />
    </div>
  );
}

/* ──────────────── 版本历史 / 回滚 ──────────────── */

function HistoryPanel({
  templateId,
  onRolledBack,
  onError,
}: {
  templateId: number;
  onRolledBack: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [history, setHistory] = useState<PromptTemplateHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingVersion, setPendingVersion] = useState<number | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setHistory(await listPromptHistory(templateId));
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "加载历史失败");
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
        if (!cancelled) onError(e instanceof Error ? e.message : "加载历史失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const executeRollback = async () => {
    if (pendingVersion == null) return;
    setRollingBack(true);
    try {
      await rollbackPrompt(templateId, pendingVersion);
      setPendingVersion(null);
      await onRolledBack();
      await load();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : "回滚失败");
    } finally {
      setRollingBack(false);
    }
  };

  return (
    <div className="border border-[#eff3f4] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#eff3f4]">
        <h5 className="text-[15px] font-bold text-[#0f1419]">版本历史</h5>
      </div>

      {loading ? (
        <p className="px-5 py-6 text-[13px] text-[#536471]">正在加载历史版本…</p>
      ) : history.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-[#536471]">暂无历史版本</p>
      ) : (
        <div className="divide-y divide-[#eff3f4]">
          {history.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-[#f7f9f9] transition-colors"
            >
              <div className="flex items-center gap-4 min-w-0">
                <span className="font-bold text-[#536471] tabular-nums shrink-0">
                  v{h.version}
                </span>
                <span className="text-[14px] text-[#0f1419] truncate">
                  {h.change_note || "（无变更说明）"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPendingVersion(h.version)}
                className="shrink-0 text-primary-container text-[14px] font-semibold px-4 py-1 rounded-full border border-primary-container/30 hover:bg-primary-container/5 transition-colors"
              >
                回滚
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 回滚确认 Modal */}
      {pendingVersion != null && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-100 flex items-center justify-center p-3"
          onClick={() => !rollingBack && setPendingVersion(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-[#eff3f4]"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-xl font-bold mb-3">确认回滚版本？</h4>
            <p className="text-[15px] text-[#536471] mb-6">
              回滚到版本{" "}
              <span className="font-bold text-primary-container">v{pendingVersion}</span>{" "}
              后，该版本内容会作为新版本写回，当前未保存的编辑将被丢弃。
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingVersion(null)}
                disabled={rollingBack}
                className="px-4 py-3 rounded-full text-[15px] font-bold text-[#536471] hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={executeRollback}
                disabled={rollingBack}
                className="px-6 py-3 rounded-full text-[15px] font-bold bg-primary-container text-on-primary-fixed shadow-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {rollingBack && (
                  <span className="material-symbols-outlined animate-spin text-[18px]">
                    progress_activity
                  </span>
                )}
                确认回滚
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────── 加载骨架 ──────────────── */

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-[#eff3f4] p-4 animate-pulse">
            <div className="h-3 bg-surface-container-high rounded w-2/3 mb-2" />
            <div className="h-2 bg-surface-container-high rounded w-1/3" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-[#eff3f4] min-h-100 animate-pulse" />
    </div>
  );
}
