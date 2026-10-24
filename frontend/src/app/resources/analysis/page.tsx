"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import ResourceFeedback from "../../components/ResourceFeedback";
import ResourceShell from "../../components/ResourceShell";
import ResourceContentCard from "../../components/ResourceContentCard";
import {
  listAnalyticsConfig,
  updateAnalyticsConfig,
  type AnalyticsDisplayConfig,
} from "../../../lib/api";

/* ──────────────────────────────────────────────
 * 展示与流程配置页 /resources/analysis
 * 全局统一配置，逐项启用/隐藏开关（即时 PUT）。版式对齐指标体系页：
 *   一级卡片「结果页展示」—— 内含概览头部 / 可视化 / 评分明细 / 报告与推荐四个分组面板，
 *                            控制 /analytics 结果页展示哪些内容区块；
 *   一级卡片「流程控制」  —— 点评链路的流程开关（不是结果页区块，单独一张）。
 * ────────────────────────────────────────────── */

/** 一级卡片：结果页展示类分组合为一张，流程开关单独一张。 */
const SECTIONS = [
  {
    key: "display",
    label: "结果页展示",
    icon: "web",
    desc: "控制分析中心结果页展示哪些内容区块，关闭后对所有评价结果统一隐藏",
    groups: ["overview", "visual", "detail", "report"],
  },
  {
    key: "flow",
    label: "流程控制",
    icon: "account_tree",
    desc: "照片地点确认、街区类型选择、文字点评自动封面等链路流程开关",
    groups: ["flow"],
  },
] as const;

/** 结果页展示卡片内的分组面板名称（对应指标页的二级维度表头）。 */
const GROUP_LABEL: Record<string, string> = {
  overview: "概览头部",
  visual: "可视化",
  detail: "评分明细",
  report: "报告与推荐",
};

export default function AnalysisConfigPage() {
  const [configs, setConfigs] = useState<AnalyticsDisplayConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setConfigs(await listAnalyticsConfig());
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载显示配置失败，请重试。");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    void listAnalyticsConfig()
      .then((data) => {
        if (!cancelled) setConfigs(data);
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "加载显示配置失败，请重试。",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
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

  const toggleSection = (key: string) =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  // 不在任何一级卡片里的分组（后端新增的未知分组）归入「结果页展示」，不丢配置项
  const knownGroups = new Set<string>(SECTIONS.flatMap((s) => [...s.groups]));
  const extraGroups = Array.from(grouped.keys()).filter((g) => !knownGroups.has(g));

  const renderGroups = () => {
    if (loading) return <LoadingSkeleton />;
    if (error)
      return <ResourceFeedback error={error} onRetry={() => void load()} />;
    if (configs.length === 0)
      return (
        <div className="py-12 text-center text-on-surface-variant">
          <p>暂无分析配置。</p>
          <button
            type="button"
            onClick={() => void load()}
            className="resource-button resource-button--secondary mt-3"
          >
            重新加载
          </button>
        </div>
      );
    return SECTIONS.map((section) => {
      const groups =
        section.key === "display"
          ? [...section.groups, ...extraGroups]
          : [...section.groups];
      const panels = groups
        .map((g) => ({ group: g, items: grouped.get(g) ?? [] }))
        .filter((p) => p.items.length > 0);
      if (panels.length === 0) return null;
      const isCollapsed = collapsed[section.key] ?? false;
      // 只有一个分组（流程控制）时不再套分组表头，开关直接列在面板里
      const showGroupHead = panels.length > 1 || section.key === "display";
      // 卡片样式与指标体系页的一级维度卡片一致：图标 + 名称在左，折叠按钮在右，
      // 展开后每个分组一个面板，对应指标页的二级维度表格
      return (
        <div key={section.key} className="resource-dimension-card">
          <div className="w-full flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1 basis-32">
              <span className="resource-section-icon">
                <span aria-hidden="true" className="material-symbols-outlined">
                  {section.icon}
                </span>
              </span>
              <div className="min-w-0">
                <h2 className="text-on-surface wrap-anywhere resource-item-title">
                  {section.label}
                </h2>
                <p className="resource-caption text-on-surface-variant">
                  {section.desc}
                </p>
              </div>
            </div>
            <div className="ml-auto flex items-center shrink-0">
              <button
                type="button"
                aria-label={`${isCollapsed ? "展开" : "收起"}${section.label}`}
                aria-expanded={!isCollapsed}
                aria-controls={`analysis-section-${section.key}`}
                onClick={() => toggleSection(section.key)}
                className="resource-button resource-button--quiet resource-button--icon"
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined resource-chevron"
                  data-collapsed={isCollapsed}
                >
                  expand_more
                </span>
              </button>
            </div>
          </div>

          <div
            id={`analysis-section-${section.key}`}
            hidden={isCollapsed}
            className="resource-dimension-content"
          >
            {panels.map(({ group, items }) => {
              const headId = `analysis-group-${group}`;
              return (
                <section
                  key={group}
                  aria-labelledby={showGroupHead ? headId : undefined}
                  aria-label={showGroupHead ? undefined : section.label}
                  className="resource-panel"
                >
                  {showGroupHead && (
                    <div className="border-b border-divider bg-surface-container-low px-4 py-2">
                      <h3
                        id={headId}
                        className="resource-detail font-bold text-on-surface wrap-anywhere"
                      >
                        {GROUP_LABEL[group] ?? group}
                      </h3>
                    </div>
                  )}
                  {items.map((c) => (
                    <BlockItem key={c.block_key} config={c} onApply={applyEnabled} />
                  ))}
                </section>
              );
            })}
          </div>
        </div>
      );
    });
  };

  return (
    <ResourceShell title="展示与流程配置">
      <section className="resource-content">
        <ResourceContentCard label="分析展示配置" variant="stack">
          <div className="resource-settings">{renderGroups()}</div>
        </ResourceContentCard>
      </section>


    </ResourceShell>
  );
}

/* ──────────────── 单个区块（名称 + 说明 + 开关） ──────────────── */

function BlockItem({
  config,
  onApply,
}: {
  config: AnalyticsDisplayConfig;
  onApply: (blockKey: string, enabled: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const labelId = useId();
  const descriptionId = useId();
  const checked = config.enabled === 1;
  const verify = async () => {
    if (busy) return;
    setBusy(true);
    setSaveError(null);
    try {
      const configs = await listAnalyticsConfig();
      const current = configs.find(
        (item) => item.block_key === config.block_key,
      );
      if (!current) setSaveError("此配置已不存在，请重新加载页面。");
      else onApply(config.block_key, current.enabled);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "无法核对状态，请重试。");
    } finally {
      setBusy(false);
    }
  };

  const handle = async () => {
    if (busy) return;
    const next = checked ? 0 : 1;
    setBusy(true);
    setSaveError(null);
    onApply(config.block_key, next); // 乐观更新
    try {
      await updateAnalyticsConfig(config.block_key, next);
    } catch (e: unknown) {
      onApply(config.block_key, checked ? 1 : 0); // 回滚
      setSaveError(e instanceof Error ? e.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="resource-settings-row">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 id={labelId} className="text-on-surface resource-item-title">
            {config.name}
          </h3>
          {config.description && (
            <p
              id={descriptionId}
              className="resource-caption text-on-surface-variant mt-1"
            >
              {config.description}
            </p>
          )}
        </div>
        <label className="inline-flex min-h-11 min-w-11 items-center justify-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            aria-labelledby={labelId}
            aria-describedby={config.description ? descriptionId : undefined}
            className="sr-only peer"
            checked={checked}
            disabled={busy}
            onChange={handle}
          />
          <div className="resource-switch" />
        </label>
      </div>
      {saveError && (
        <ResourceFeedback error={saveError} onRetry={() => void verify()} />
      )}
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
          className="resource-panel resource-panel--padded animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-surface-container-high rounded-full" />
            <div className="space-y-2 flex-1">
              <div className="h-3 bg-surface-container-high rounded w-1/4" />
              <div className="h-2 bg-surface-container-high rounded w-1/2" />
            </div>
            <div className="w-20 h-8 bg-surface-container-high rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
