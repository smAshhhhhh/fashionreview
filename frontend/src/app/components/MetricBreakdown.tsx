"use client";

import { useId, useMemo, useState } from "react";
import type {
  DimensionScoreResult,
  ImageAttribute,
  MetricScoreResult,
  SubDimensionScoreResult,
} from "../types";

/** 权重（0~1）→ 百分比文本；空值返回 "—"。 */
function weightPct(weight?: number | null): string {
  if (weight == null) return "—";
  return `${(weight * 100).toFixed(0)}%`;
}

/** 分数(5 分制) → mock 的得分文字色：低分红，其余黑。 */
function scoreColor(score: number): string {
  if (score < 3) return "text-error";
  if (score < 4) return "text-on-surface-variant";
  return "text-on-surface";
}

/**
 * 多维指标明细（完全对齐 mock）：一级维度 tab 切换 + 二级维度表格，行可展开看三级指标。
 * 表格样式沿用 mock：divider 分割线、白底、无圆角、真实 <table>。
 * showReason 关闭时不展示三级评分理由；无三级数据时行不可展开。
 */
export default function MetricBreakdown({
  dimensions,
  subDimensions,
  metrics,
  showReason,
  imageAttributes = [],
}: {
  dimensions: DimensionScoreResult[];
  subDimensions: SubDimensionScoreResult[];
  metrics: MetricScoreResult[];
  /** 是否展示三级指标的 AI 评分依据 */
  showReason: boolean;
  /**
   * 图片属性标签（照片点评匹配人工标注库所得），按 metric_id 挂到对应三级指标行。
   * 文字点评、或「图片属性」区块关闭时为空数组，此时渲染结果与接入本功能前一致。
   */
  imageAttributes?: ImageAttribute[];
}) {
  const [selectedDim, setActiveDim] = useState<number>(dimensions[0]?.dim_id ?? 0);
  const activeDim = dimensions.some((dimension) => dimension.dim_id === selectedDim) ? selectedDim : dimensions[0]?.dim_id;
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const uid = useId();

  const subsByDim = useMemo(() => {
    const map = new Map<number, SubDimensionScoreResult[]>();
    for (const s of subDimensions) {
      const arr = map.get(s.dim_id) ?? [];
      arr.push(s);
      map.set(s.dim_id, arr);
    }
    return map;
  }, [subDimensions]);

  const metricsBySub = useMemo(() => {
    const map = new Map<number, MetricScoreResult[]>();
    for (const m of metrics) {
      const arr = map.get(m.sub_id) ?? [];
      arr.push(m);
      map.set(m.sub_id, arr);
    }
    return map;
  }, [metrics]);

  // metric_id → 该指标的等级成语列表。一个指标理论上只被赋一条属性，
  // 但用数组承接以免同名属性重复时丢数据。
  const attrsByMetric = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const a of imageAttributes) {
      if (a.metric_id == null || !a.grade_word) continue;
      const arr = map.get(a.metric_id) ?? [];
      arr.push(a.grade_word);
      map.set(a.metric_id, arr);
    }
    return map;
  }, [imageAttributes]);

  if (dimensions.length === 0) return null;

  const toggle = (subId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  };

  const activeSubs = subsByDim.get(activeDim) ?? [];

  return (
    <section aria-labelledby={`${uid}-title`} className="min-w-0 space-y-4">
      <h2 id={`${uid}-title`} className="text-xl font-black text-on-surface">多维指标明细</h2>

      {/* 维度切换 tab */}
      <div role="group" aria-label="选择指标维度" className="flex border-b border-divider overflow-x-auto">
        {dimensions.map((dim) => {
          const active = dim.dim_id === activeDim;
          return (
            <button
              key={dim.dim_id}
              type="button"
              aria-pressed={active}
              aria-controls={`${uid}-table`}
              onClick={() => setActiveDim(dim.dim_id)}
              className={`min-h-11 px-4 sm:px-6 py-3 border-b-4 text-sm shrink-0 transition-colors whitespace-nowrap ${
                active
                  ? "border-primary text-on-surface font-bold"
                  : "border-transparent text-on-surface-variant hover:bg-surface-container font-medium"
              }`}
            >
              {dim.dim_name}
            </button>
          );
        })}
      </div>

      {/* 指标表格 */}
      <div id={`${uid}-table`} role="region" aria-label="指标明细表，可横向滚动" tabIndex={0} className="w-full overflow-x-auto border border-divider bg-surface-container-lowest">
        <table className="w-full min-w-100 table-fixed text-left border-collapse">
          <caption className="sr-only">{dimensions.find((dimension) => dimension.dim_id === activeDim)?.dim_name}的二级维度、权重与得分；可展开查看三级指标。</caption>
          <colgroup><col className="w-[60%]" /><col className="w-[20%]" /><col className="w-[20%]" /></colgroup>
          <thead>
            <tr className="border-b border-divider bg-surface-container-lowest">
              <th scope="col" className="px-3 sm:px-6 py-4 font-bold text-sm text-on-surface-variant">
                指标名称
              </th>
              <th scope="col" className="px-2 sm:px-3 py-4 font-bold text-sm text-on-surface-variant text-center">
                权重
              </th>
              <th scope="col" className="px-3 sm:px-6 py-4 font-bold text-sm text-on-surface-variant text-right">
                得分
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {activeSubs.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-6 py-8 text-center text-sm text-on-surface-variant"
                >
                  该维度暂无明细数据
                </td>
              </tr>
            )}
            {activeSubs.map((sub) => {
              const children = metricsBySub.get(sub.sub_id) ?? [];
              const canExpand = children.length > 0;
              const isOpen = expanded.has(sub.sub_id);
              return (
                <FragmentRow
                  key={sub.sub_id}
                  sub={sub}
                  items={children}
                  canExpand={canExpand}
                  isOpen={isOpen}
                  onToggle={() => canExpand && toggle(sub.sub_id)}
                  showReason={showReason}
                  attrsByMetric={attrsByMetric}
                  contentId={`${uid}-sub-${sub.sub_id}`}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** 一个二级维度行 + 其展开的三级明细行（对齐 mock 的行 / 展开行结构）。 */
function FragmentRow({
  sub,
  items,
  canExpand,
  isOpen,
  onToggle,
  showReason,
  attrsByMetric,
  contentId,
}: {
  sub: SubDimensionScoreResult;
  items: MetricScoreResult[];
  canExpand: boolean;
  isOpen: boolean;
  onToggle: () => void;
  showReason: boolean;
  /** metric_id → 等级成语列表；无属性的指标取不到值，渲染与原先一致 */
  attrsByMetric: Map<number, string[]>;
  contentId: string;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`transition-colors group ${
          canExpand ? "hover:bg-surface-container-low cursor-pointer" : ""
        }`}
      >
        <td className="px-3 sm:px-6 py-3">
          {canExpand ? <button type="button" aria-expanded={isOpen} aria-controls={contentId} onClick={(event) => { event.stopPropagation(); onToggle(); }} className="flex min-h-11 w-full items-center gap-2 rounded-md py-1 text-left text-sm font-bold text-on-surface">
            <span aria-hidden="true" className={`material-symbols-outlined shrink-0 text-xl text-on-surface-variant transition-transform ${isOpen ? "rotate-180" : ""}`}>expand_more</span>
            <span className="min-w-0">{sub.sub_name}</span>
          </button> : <div className="font-bold text-sm text-on-surface">{sub.sub_name}</div>}
        </td>
        <td className="px-2 sm:px-3 py-4 text-center text-on-surface-variant text-sm tabular-nums">
          {weightPct(sub.weight)}
        </td>
        <td className="px-3 sm:px-6 py-4 text-right">
          <span className={`font-bold text-lg tabular-nums ${scoreColor(sub.score)}`}>
            {sub.score.toFixed(1)}
          </span>
        </td>
      </tr>
      {canExpand && (
        <tr hidden={!isOpen} className="bg-surface-container-lowest">
          <td className="px-3 sm:px-6 py-0 border-t border-divider" colSpan={3}>
            <div id={contentId} className="divide-y divide-divider">
              {items.map((m) => (
                <div
                  key={m.metric_id}
                  className="py-4 flex flex-wrap justify-between items-start gap-x-4 gap-y-2"
                >
                  <div className="flex-1 basis-48 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-1">
                      <span className="text-sm font-bold text-on-surface">
                        {m.metric_name}
                      </span>
                      {m.weight != null && (
                        <span className="text-xs text-on-surface-variant">
                          (权重 {weightPct(m.weight)})
                        </span>
                      )}
                    </div>
                    {showReason && m.reason && (
                      <p className="text-sm text-on-surface-variant leading-relaxed">
                        评分理由：{m.reason}
                      </p>
                    )}
                  </div>
                  {/* 得分右侧并排：图片属性标签（绿色圆角）+ 得分。
                      无属性时标签数组为空，渲染结果与接入本功能前完全一致。 */}
                  <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
                    {(attrsByMetric.get(m.metric_id) ?? []).map((word) => (
                      <span
                        key={word}
                        className="max-w-full rounded-md bg-success-container px-2 py-0.5 text-xs font-medium text-success"
                        title="人工标注库匹配到的图片属性"
                      >
                        {word}
                      </span>
                    ))}
                    <span className="font-bold tabular-nums text-primary">
                      {m.score}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
