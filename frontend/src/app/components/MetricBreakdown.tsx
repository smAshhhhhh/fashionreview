"use client";

import { useMemo, useState } from "react";
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
  if (score < 3) return "text-[#f4212e]";
  if (score < 4) return "text-[#536471]";
  return "text-[#0f1419]";
}

/**
 * 多维指标明细（完全对齐 mock）：一级维度 tab 切换 + 二级维度表格，行可展开看三级指标。
 * 表格样式沿用 mock：#eff3f4 分割线、白底、无圆角、真实 <table>。
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
  const [activeDim, setActiveDim] = useState<number>(dimensions[0]?.dim_id ?? 0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

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
    <section className="space-y-4">
      <h3 className="text-xl font-black text-[#0f1419]">多维指标明细</h3>

      {/* 维度切换 tab */}
      <div className="flex border-b border-[#eff3f4] overflow-x-auto no-scrollbar">
        {dimensions.map((dim) => {
          const active = dim.dim_id === activeDim;
          return (
            <button
              key={dim.dim_id}
              type="button"
              onClick={() => setActiveDim(dim.dim_id)}
              className={`px-6 py-4 border-b-4 text-sm shrink-0 transition-colors whitespace-nowrap ${
                active
                  ? "border-primary-container text-[#0f1419] font-bold"
                  : "border-transparent text-[#536471] hover:bg-black/5 font-medium"
              }`}
            >
              {dim.dim_name}
            </button>
          );
        })}
      </div>

      {/* 指标表格 */}
      <div className="w-full border border-[#eff3f4] overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#eff3f4] bg-white">
              <th className="px-6 py-4 font-bold text-[14px] text-[#536471] uppercase">
                指标名称
              </th>
              <th className="px-6 py-4 font-bold text-[14px] text-[#536471] text-center uppercase">
                权重
              </th>
              <th className="px-6 py-4 font-bold text-[14px] text-[#536471] text-right uppercase">
                得分
              </th>
              <th className="px-4 py-4 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eff3f4]">
            {activeSubs.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-8 text-center text-sm text-[#536471]"
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
}: {
  sub: SubDimensionScoreResult;
  items: MetricScoreResult[];
  canExpand: boolean;
  isOpen: boolean;
  onToggle: () => void;
  showReason: boolean;
  /** metric_id → 等级成语列表；无属性的指标取不到值，渲染与原先一致 */
  attrsByMetric: Map<number, string[]>;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`transition-colors group ${
          canExpand ? "hover:bg-black/2 cursor-pointer" : ""
        }`}
      >
        <td className="px-6 py-4">
          <div className="font-bold text-sm text-[#0f1419]">{sub.sub_name}</div>
        </td>
        <td className="px-6 py-4 text-center text-[#536471] text-sm">
          {weightPct(sub.weight)}
        </td>
        <td className="px-6 py-4 text-right">
          <span className={`font-bold text-lg ${scoreColor(sub.score)}`}>
            {sub.score.toFixed(1)}
          </span>
        </td>
        <td className="px-4 py-4 text-right">
          {canExpand && (
            <span
              className="material-symbols-outlined text-[20px] text-[#536471] group-hover:text-primary-container transition-transform"
              style={{ transform: isOpen ? "rotate(180deg)" : "none" }}
            >
              expand_more
            </span>
          )}
        </td>
      </tr>
      {canExpand && isOpen && (
        <tr className="bg-white">
          <td className="px-6 py-0 border-t border-[#eff3f4]" colSpan={4}>
            <div className="divide-y divide-[#eff3f4]">
              {items.map((m) => (
                <div
                  key={m.metric_id}
                  className="py-4 flex justify-between items-start gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-[#0f1419]">
                        {m.metric_name}
                      </span>
                      {m.weight != null && (
                        <span className="text-xs text-[#536471]">
                          (权重 {weightPct(m.weight)})
                        </span>
                      )}
                    </div>
                    {showReason && m.reason && (
                      <p className="text-xs text-[#536471] leading-relaxed">
                        评分理由：{m.reason}
                      </p>
                    )}
                  </div>
                  {/* 得分右侧并排：图片属性标签（绿色圆角）+ 得分。
                      无属性时标签数组为空，渲染结果与接入本功能前完全一致。 */}
                  <div className="flex items-center gap-2 shrink-0">
                    {(attrsByMetric.get(m.metric_id) ?? []).map((word) => (
                      <span
                        key={word}
                        className="rounded-md bg-[#e8f5e9] px-2 py-0.5 text-xs font-medium text-[#1b5e20] whitespace-nowrap"
                        title="人工标注库匹配到的图片属性"
                      >
                        {word}
                      </span>
                    ))}
                    <span className="font-bold text-primary-container">
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
