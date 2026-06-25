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
 * 手风琴分组（recognize / score / report）+ 行内编辑器 + 版本历史 / 回滚。
 * 视觉对齐设计稿；数据全部接真实 /prompts API（不照搬设计稿占位值）。
 * 设计稿自定义 spacing/font token 已翻译为标准 Tailwind 值。
 * ────────────────────────────────────────────── */

type StageMeta = {
  label: string;
  icon: string;
  desc: string;
  /** 标识条 / 图标 / 计数 chip 配色 */
  iconClass: string;
  countClass: string;
};

const STAGE_META: Record<string, StageMeta> = {
  recognize: {
    label: "街巷识别 (recognize)",
    icon: "location_on",
    desc: "针对街头时尚图像的基础位置与环境语义识别",
    iconClass: "text-primary",
    countClass: "bg-primary/10 text-primary",
  },
  score: {
    label: "维度评分 (score)",
    icon: "star",
    desc: "对空间美学、商业业态等核心维度进行量化评估",
    iconClass: "text-tertiary",
    countClass: "bg-tertiary/10 text-tertiary",
  },
  report: {
    label: "报告生成 (report)",
    icon: "description",
    desc: "自动化生成时尚趋势简报与深度分析文档",
    iconClass: "text-[#9333ea]",
    countClass: "bg-purple-100 text-purple-700",
  },
};
const STAGE_ORDER = ["recognize", "score", "report"];

export default function PromptsPage() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<number | null>(null);

  const reload = async () => {
    const data = await listPrompts();
    setTemplates(data);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listPrompts();
        if (!cancelled) setTemplates(data);
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

  const toggleGroup = (stage: string) =>
    setCollapsed((c) => ({ ...c, [stage]: !c[stage] }));

  const renderGroups = () => {
    if (loading) return <LoadingSkeleton />;
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-on-surface-variant">
          <span className="material-symbols-outlined text-5xl text-error">error</span>
          <p className="text-[15px]">{error}</p>
        </div>
      );
    }
    return STAGE_ORDER.map((stage) => {
      const meta = STAGE_META[stage];
      const items = grouped.get(stage) ?? [];
      const isCollapsed = collapsed[stage] ?? false;
      return (
        <div
          key={stage}
          className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm"
        >
          {/* 组头 */}
          <button
            type="button"
            onClick={() => toggleGroup(stage)}
            className="w-full flex items-center justify-between p-4 hover:bg-surface-container-low/50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <span className={`material-symbols-outlined ${meta.iconClass}`}>
                {meta.icon}
              </span>
              <div>
                <h3 className="text-[17px] font-bold text-on-surface">{meta.label}</h3>
                <p className="text-[13px] text-on-surface-variant">{meta.desc}</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <span
                className={`px-3 py-1 rounded-full text-[15px] font-semibold ${meta.countClass}`}
              >
                {items.length} 模版
              </span>
              <span
                className="material-symbols-outlined transition-transform duration-300"
                style={{ transform: isCollapsed ? "rotate(0deg)" : "rotate(180deg)" }}
              >
                expand_more
              </span>
            </div>
          </button>

          {/* 组内容 */}
          {!isCollapsed && (
            <div className="border-t border-outline-variant/30">
              {items.length === 0 ? (
                <div className="py-12 text-center space-y-3 bg-surface-container-low/20">
                  <span className="material-symbols-outlined text-outline/30 text-5xl">
                    inventory_2
                  </span>
                  <p className="text-[15px] text-on-surface-variant">
                    暂无可用活跃模版
                  </p>
                </div>
              ) : (
                items.map((t) => (
                  <PromptItem
                    key={t.id}
                    template={t}
                    editing={editingId === t.id}
                    onEdit={() =>
                      setEditingId((cur) => (cur === t.id ? null : t.id))
                    }
                    onSaved={async () => {
                      await reload();
                      setEditingId(null);
                    }}
                    onRolledBack={reload}
                  />
                ))
              )}
            </div>
          )}
        </div>
      );
    });
  };

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
            <h2 className="text-[18px] font-bold text-on-surface">Prompt 管理</h2>
          </div>
        </header>

        <section className="p-6 max-w-[1200px] mx-auto w-full flex-1 pb-28 lg:pb-12">
          <div className="space-y-6">{renderGroups()}</div>
        </section>
      </main>

      <MobileBottomNav activeHref="/resources" />
    </div>
  );
}

/* ──────────────── 单条模板（行头 + 行内编辑器） ──────────────── */

function PromptItem({
  template,
  editing,
  onEdit,
  onSaved,
  onRolledBack,
}: {
  template: PromptTemplate;
  editing: boolean;
  onEdit: () => void;
  onSaved: () => Promise<void>;
  onRolledBack: () => Promise<void>;
}) {
  return (
    <div className="p-4 hover:bg-surface-bright transition-all border-b border-outline-variant/30 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap min-w-0">
          <h4 className="text-[15px] font-bold text-on-surface">{template.name}</h4>
          <span className="text-[12px] px-2 py-0.5 bg-surface-container text-on-surface-variant rounded tabular-nums tracking-tight">
            v{template.version}
          </span>
          <div className="flex items-center gap-1 text-on-surface-variant text-[13px]">
            <span className="material-symbols-outlined text-[16px]">smart_toy</span>
            {template.model || "默认模型"}
          </div>
          <div className="flex items-center gap-1 text-on-surface-variant text-[13px]">
            <span className="material-symbols-outlined text-[16px]">thermostat</span>
            Temp: {template.temperature != null ? template.temperature : "默认 (0.3)"}
          </div>
          {template.dim_code && (
            <span className="text-[10px] px-2 py-0.5 bg-tertiary/10 text-tertiary rounded font-mono">
              {template.dim_code}
            </span>
          )}
        </div>
        <div className="flex items-center gap-6 shrink-0">
          <EnabledToggle template={template} onChanged={onRolledBack} />
          <button
            type="button"
            onClick={onEdit}
            className="text-primary text-[15px] font-bold flex items-center gap-1 hover:opacity-70 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px]">
              {editing ? "close" : "edit"}
            </span>
            {editing ? "收起" : "编辑"}
          </button>
        </div>
      </div>

      {editing && (
        <PromptEditor
          template={template}
          onCancel={onEdit}
          onSaved={onSaved}
          onRolledBack={onRolledBack}
        />
      )}
    </div>
  );
}

/* 启用开关：即时 PUT，仅切 enabled */
function EnabledToggle({
  template,
  onChanged,
}: {
  template: PromptTemplate;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const checked = template.enabled === 1;

  const handle = async () => {
    setBusy(true);
    try {
      await updatePrompt(template.id, { enabled: checked ? 0 : 1 });
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        disabled={busy}
        onChange={handle}
      />
      <div className="w-9 h-5 bg-surface-container-highest rounded-full peer peer-checked:bg-primary peer-focus:outline-none after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white" />
    </label>
  );
}

/* ──────────────── 行内编辑器 ──────────────── */

function PromptEditor({
  template,
  onCancel,
  onSaved,
  onRolledBack,
}: {
  template: PromptTemplate;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onRolledBack: () => Promise<void>;
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
  const [saveError, setSaveError] = useState<string | null>(null);

  const placeholders = useMemo(
    () =>
      (template.placeholders ?? "")
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [template.placeholders],
  );

  const handleSave = async () => {
    setSaveError(null);
    const tempNum = temperature.trim() === "" ? null : Number(temperature);
    if (tempNum != null && (Number.isNaN(tempNum) || tempNum < 0 || tempNum > 2)) {
      setSaveError("采样温度需为 0~2 之间的数字");
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
      setSaveError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full bg-white border border-outline-variant/30 rounded-lg px-3 py-2 text-[15px] focus:ring-primary focus:border-primary focus:outline-none";

  return (
    <div className="mt-4 bg-surface-container-low/40 rounded-xl p-6 border border-outline-variant/30">
      {/* 可用占位符 */}
      <div className="mb-4 p-4 bg-white rounded-lg border border-outline-variant/30">
        <p className="text-[15px] text-primary font-bold mb-2">
          可用占位符 (Available Placeholders):
        </p>
        {placeholders.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {placeholders.map((p) => (
              <code
                key={p}
                className="text-[12px] bg-surface-container-lowest px-2 py-1 rounded-md border border-outline-variant/30 tabular-nums tracking-tight"
              >
                {p}
              </code>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-on-surface-variant">该模板未声明占位符</p>
        )}
      </div>

      {/* 名称 / 模型 / 温度 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="space-y-3">
          <label className="block text-[15px] font-semibold text-on-surface-variant">
            模版名称
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-3">
          <label className="block text-[15px] font-semibold text-on-surface-variant">
            模型（留空用默认）
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="如 gpt-4o"
            className={inputClass}
          />
        </div>
        <div className="space-y-3">
          <label className="block text-[15px] font-semibold text-on-surface-variant">
            采样温度 (0~2，留空用默认)
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
      <div className="space-y-6 mb-6">
        <div>
          <label className="block text-[15px] font-semibold text-on-surface-variant mb-2">
            System Prompt (系统提示词)
          </label>
          <textarea
            rows={4}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className={`${inputClass} font-mono leading-relaxed resize-y`}
          />
        </div>
        <div>
          <label className="block text-[15px] font-semibold text-on-surface-variant mb-2">
            User Template (用户模版)
          </label>
          <textarea
            rows={6}
            value={userTemplate}
            onChange={(e) => setUserTemplate(e.target.value)}
            className={`${inputClass} font-mono leading-relaxed resize-y`}
          />
        </div>
        <div>
          <label className="block text-[15px] font-semibold text-on-surface-variant mb-2">
            更新日志（选填，记入版本历史）
          </label>
          <textarea
            rows={2}
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            placeholder="请简要说明此次更新的内容..."
            className={`${inputClass} resize-y`}
          />
        </div>
      </div>

      {/* 版本历史 */}
      <HistoryPanel templateId={template.id} onRolledBack={onRolledBack} />

      {saveError && <p className="text-[15px] text-error mt-4">{saveError}</p>}

      {/* 操作 */}
      <div className="mt-6 pt-4 border-t border-outline-variant/30 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 rounded-lg text-[15px] font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-primary text-on-primary rounded-lg text-[15px] font-bold shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {saving && (
            <span className="material-symbols-outlined animate-spin text-[18px]">
              progress_activity
            </span>
          )}
          保存新版本
        </button>
      </div>
    </div>
  );
}

/* ──────────────── 版本历史 / 回滚 ──────────────── */

function HistoryPanel({
  templateId,
  onRolledBack,
}: {
  templateId: number;
  onRolledBack: () => Promise<void>;
}) {
  const [history, setHistory] = useState<PromptTemplateHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingVersion, setPendingVersion] = useState<number | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setHistory(await listPromptHistory(templateId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载历史失败");
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
        if (!cancelled) setError(e instanceof Error ? e.message : "加载历史失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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
      setError(e instanceof Error ? e.message : "回滚失败");
    } finally {
      setRollingBack(false);
    }
  };

  return (
    <div className="border-t border-outline-variant/30 pt-6">
      <h5 className="text-[15px] text-on-surface font-bold flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-[20px]">history</span>
        版本历史记录
      </h5>

      {loading ? (
        <p className="text-[13px] text-on-surface-variant">正在加载历史版本…</p>
      ) : error ? (
        <p className="text-[13px] text-error">{error}</p>
      ) : history.length === 0 ? (
        <p className="text-[13px] text-on-surface-variant">暂无历史版本</p>
      ) : (
        <div className="space-y-3">
          {history.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between gap-4 p-4 hover:bg-surface-container-low transition-colors rounded-lg border border-transparent"
            >
              <div className="flex items-center gap-6 min-w-0">
                <span className="font-bold text-on-surface-variant tabular-nums tracking-tight shrink-0">
                  v{h.version}
                </span>
                <span className="text-[15px] text-on-surface truncate">
                  {h.change_note || "（无变更说明）"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPendingVersion(h.version)}
                className="text-primary hover:underline text-[15px] font-semibold px-4 py-1 rounded-full border border-primary/30 hover:bg-primary/5 transition-all shrink-0"
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
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-3"
          onClick={() => !rollingBack && setPendingVersion(null)}
        >
          <div
            className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant/30"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-[20px] font-bold mb-3">确认回滚版本？</h4>
            <p className="text-[15px] text-on-surface-variant mb-6">
              确定要回滚到版本{" "}
              <span className="font-bold text-primary">v{pendingVersion}</span>{" "}
              吗？该版本内容会作为一个新版本写回，当前未保存的编辑将被丢弃。
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingVersion(null)}
                disabled={rollingBack}
                className="px-4 py-3 rounded-lg text-[15px] font-bold text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={executeRollback}
                disabled={rollingBack}
                className="px-6 py-3 rounded-lg text-[15px] font-bold bg-primary text-on-primary shadow-md hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
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
    <div className="space-y-6">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-white/50 rounded-xl border border-outline-variant/20 p-4 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-surface-container-highest/50 rounded-full" />
            <div className="space-y-2 flex-1">
              <div className="h-3 bg-surface-container-highest/50 rounded w-1/4" />
              <div className="h-2 bg-surface-container-highest/50 rounded w-1/2" />
            </div>
            <div className="w-20 h-8 bg-surface-container-highest/50 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
