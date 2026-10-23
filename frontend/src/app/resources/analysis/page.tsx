"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import ResourceFeedback from "../../components/ResourceFeedback";
import ResourceShell from "../../components/ResourceShell";
import ResourceContentCard from "../../components/ResourceContentCard";
import {
  listAnalyticsConfig,
  updateAnalyticsConfig,
  type AnalyticsDisplayConfig,
} from "../../../lib/api";

/* ──────────────────────────────────────────────
 * 分析管理页 /resources/analysis
 * 全局统一配置：按分组手风琴罗列分析中心各内容区块，逐块启用/隐藏开关（即时 PUT）。
 * 控制 /analytics 结果页展示哪些内容（综合分、雷达图、各级维度得分、得分依据、AI画像等）。
 * 视觉对齐扁平 Twitter/X 风格；数据全部接真实 /analytics-config API。
 * ────────────────────────────────────────────── */

type GroupMeta = {
  label: string;
  icon: string;
  desc: string;
};

// 统一走单一主色（primary），不再按分组用多种花哨配色
const GROUP_META: Record<string, GroupMeta> = {
  overview: {
    label: "概览头部",
    icon: "dashboard",
    desc: "结果页顶部的街景原图、综合评分与星级",
  },
  visual: {
    label: "可视化",
    icon: "radar",
    desc: "维度雷达图与一级维度拆解图",
  },
  detail: {
    label: "评分明细",
    icon: "format_list_numbered",
    desc: "二级维度、三级指标逐项得分与 AI 评分依据",
  },
  report: {
    label: "报告与推荐",
    icon: "description",
    desc: "AI 街道画像与相似街区推荐",
  },
  // flow 不是结果页区块，而是点评链路的流程开关
  flow: {
    label: "流程控制",
    icon: "account_tree",
    desc: "照片地点确认、文字点评自动封面等链路流程开关",
  },
};
const GROUP_ORDER = ["overview", "visual", "detail", "report", "flow"];

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

  const toggleGroup = (group: string) =>
    setCollapsed((c) => ({ ...c, [group]: !c[group] }));

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
    return [
      ...GROUP_ORDER,
      ...Array.from(grouped.keys()).filter((key) => !GROUP_ORDER.includes(key)),
    ].map((group) => {
      const meta = GROUP_META[group] ?? {
        label: group,
        icon: "tune",
        desc: "其他分析配置",
      };
      const items = grouped.get(group) ?? [];
      if (items.length === 0) return null;
      const isCollapsed = collapsed[group] ?? false;
      const activeCount = items.filter((i) => i.enabled === 1).length;
      return (
        <div
          key={group}
          className="resource-settings-group"
        >
          {/* 组头 */}
          <h2>
            <button
              type="button"
              aria-label={meta.label}
              aria-expanded={!isCollapsed}
              aria-controls={`analysis-group-${group}`}
              onClick={() => toggleGroup(group)}
              className="resource-settings-heading"
            >
              <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
                <span className="resource-section-icon">
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined"
                  >
                    {meta.icon}
                  </span>
                </span>
                <div className="min-w-0">
                  <span className="block resource-item-title font-bold text-on-surface">
                    {meta.label}
                  </span>
                  <p className="resource-caption text-on-surface-variant">
                    {meta.desc}
                  </p>
                </div>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-6">
                <span className={`
                  whitespace-nowrap px-3 py-1 rounded-full resource-caption font-semibold
                  bg-surface-container-low text-on-surface-variant
                `}>
                  {activeCount}/{items.length} 启用
                </span>
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined resource-chevron text-on-surface-variant"
                  data-collapsed={isCollapsed}
                >
                  expand_more
                </span>
              </div>
            </button>
          </h2>

          {/* 组内容 */}
          <div
            id={`analysis-group-${group}`}
            hidden={isCollapsed}
            className="resource-settings-items resource-scroll-card"
          >
            {items.map((c) => (
              <BlockItem key={c.block_key} config={c} onApply={applyEnabled} />
            ))}
          </div>
        </div>
      );
    });
  };

  return (
    <ResourceShell title="分析管理">
      <section className="resource-content">
        {/* 说明条 */}
        <div className="resource-note resource-top-note">
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-primary"
          >
            info
          </span>
          <p className="resource-caption leading-relaxed text-on-surface-variant">
            这里的开关控制
            <Link
              href="/analytics"
              className="text-primary font-semibold mx-1 hover:underline"
            >
              分析中心
            </Link>
            结果页展示哪些内容区块。关闭后该区块对所有评价结果统一隐藏；「得分依据」依赖「三级指标得分」开启才会出现。
          </p>
        </div>
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
