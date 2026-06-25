"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Sidebar from "../../components/Sidebar";
import MobileBottomNav from "../../components/MobileBottomNav";
import {
  listAnalyticsConfig,
  updateAnalyticsConfig,
  type AnalyticsDisplayConfig,
} from "../../../lib/api";

/* ──────────────────────────────────────────────
 * 分析管理页 /resources/analysis
 * 全局统一配置：按分组手风琴罗列分析中心各内容区块，逐块启用/隐藏开关（即时 PUT）。
 * 控制 /analytics 结果页展示哪些内容（综合分、雷达图、各级维度得分、得分依据、AI画像等）。
 * 视觉对齐 Prompt 管理页；数据全部接真实 /analytics-config API。
 * ────────────────────────────────────────────── */

type GroupMeta = {
  label: string;
  icon: string;
  desc: string;
  iconClass: string;
  countClass: string;
};

const GROUP_META: Record<string, GroupMeta> = {
  overview: {
    label: "概览头部 (overview)",
    icon: "dashboard",
    desc: "结果页顶部的街景原图、综合评分与星级",
    iconClass: "text-primary",
    countClass: "bg-primary/10 text-primary",
  },
  visual: {
    label: "可视化 (visual)",
    icon: "radar",
    desc: "维度雷达图与一级维度拆解图",
    iconClass: "text-tertiary",
    countClass: "bg-tertiary/10 text-tertiary",
  },
  detail: {
    label: "评分明细 (detail)",
    icon: "format_list_numbered",
    desc: "二级维度、三级指标逐项得分与 AI 评分依据",
    iconClass: "text-[#9333ea]",
    countClass: "bg-purple-100 text-purple-700",
  },
  report: {
    label: "报告与推荐 (report)",
    icon: "description",
    desc: "AI 街道画像与相似街区推荐",
    iconClass: "text-secondary",
    countClass: "bg-primary/10 text-secondary",
  },
};
const GROUP_ORDER = ["overview", "visual", "detail", "report"];

export default function AnalysisConfigPage() {
  const [configs, setConfigs] = useState<AnalyticsDisplayConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listAnalyticsConfig();
        if (!cancelled) setConfigs(data);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载显示配置失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 本地乐观更新单个区块的 enabled
  const applyEnabled = (blockKey: string, enabled: number) =>
    setConfigs((prev) =>
      prev.map((c) => (c.block_key === blockKey ? { ...c, enabled } : c)),
    );

  const grouped = useMemo(() => {
    const map = new Map<string, AnalyticsDisplayConfig[]>();
    for (const c of configs) {
      const arr = map.get(c.block_group) ?? [];
      arr.push(c);
      map.set(c.block_group, arr);
    }
    return map;
  }, [configs]);

  const toggleGroup = (group: string) =>
    setCollapsed((c) => ({ ...c, [group]: !c[group] }));

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
    return GROUP_ORDER.map((group) => {
      const meta = GROUP_META[group];
      const items = grouped.get(group) ?? [];
      if (items.length === 0) return null;
      const isCollapsed = collapsed[group] ?? false;
      const activeCount = items.filter((i) => i.enabled === 1).length;
      return (
        <div
          key={group}
          className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm"
        >
          {/* 组头 */}
          <button
            type="button"
            onClick={() => toggleGroup(group)}
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
                {activeCount}/{items.length} 启用
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
              {items.map((c) => (
                <BlockItem
                  key={c.block_key}
                  config={c}
                  onApply={applyEnabled}
                  onError={setError}
                />
              ))}
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
            <h2 className="text-[18px] font-bold text-on-surface">分析管理</h2>
          </div>
        </header>

        <section className="p-6 max-w-[1200px] mx-auto w-full flex-1 pb-28 lg:pb-12">
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-low/40 p-4">
            <span className="material-symbols-outlined text-primary">info</span>
            <p className="text-[13px] leading-relaxed text-on-surface-variant">
              这里的开关控制
              <Link href="/analytics" className="text-primary font-semibold mx-1 hover:underline">
                分析中心
              </Link>
              结果页展示哪些内容区块。关闭后该区块对所有评价结果统一隐藏；「得分依据」依赖「三级指标得分」开启才会出现。
            </p>
          </div>
          <div className="space-y-6">{renderGroups()}</div>
        </section>
      </main>

      <MobileBottomNav activeHref="/resources" />
    </div>
  );
}

/* ──────────────── 单个区块（名称 + 说明 + 开关） ──────────────── */

function BlockItem({
  config,
  onApply,
  onError,
}: {
  config: AnalyticsDisplayConfig;
  onApply: (blockKey: string, enabled: number) => void;
  onError: (msg: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const checked = config.enabled === 1;

  const handle = async () => {
    const next = checked ? 0 : 1;
    setBusy(true);
    onError(null);
    onApply(config.block_key, next); // 乐观更新
    try {
      await updateAnalyticsConfig(config.block_key, next);
    } catch (e: unknown) {
      onApply(config.block_key, checked ? 1 : 0); // 回滚
      onError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 hover:bg-surface-bright transition-all border-b border-outline-variant/30 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h4 className="text-[15px] font-bold text-on-surface">{config.name}</h4>
            <span className="text-[10px] px-2 py-0.5 bg-surface-container text-on-surface-variant rounded font-mono">
              {config.block_key}
            </span>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                checked
                  ? "bg-green-100/50 text-green-700"
                  : "bg-surface-container text-on-surface-variant"
              }`}
            >
              {checked ? "展示中" : "已隐藏"}
            </span>
          </div>
          {config.description && (
            <p className="text-[13px] text-on-surface-variant mt-1">
              {config.description}
            </p>
          )}
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={checked}
            disabled={busy}
            onChange={handle}
          />
          <div className="w-9 h-5 bg-surface-container-highest rounded-full peer peer-checked:bg-primary peer-focus:outline-none after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white" />
        </label>
      </div>
    </div>
  );
}

/* ──────────────── 加载骨架 ──────────────── */

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1, 2, 3].map((i) => (
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
