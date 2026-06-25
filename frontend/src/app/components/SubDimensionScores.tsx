import type { DimensionScoreResult, SubDimensionScoreResult } from "../types";

/** 维度名 → 图标，与 DimensionScores 保持一致；未命中给兜底。 */
const DIM_ICONS: Record<string, string> = {
  空间美学: "architecture",
  商业业态: "storefront",
  文化体验: "theater_comedy",
  活力人气: "groups",
  传播影响: "share",
};
const FALLBACK_ICON = "insights";

/**
 * 二级维度明细：按一级维度分组，列出每个二级维度的得分（5 分制）与进度条。
 */
export default function SubDimensionScores({
  dimensions,
  subDimensions,
}: {
  dimensions: DimensionScoreResult[];
  subDimensions: SubDimensionScoreResult[];
}) {
  // 一级 id → 名称；保证分组标题可读
  const dimName = new Map(dimensions.map((d) => [d.dim_id, d.dim_name]));
  // 一级 id → 其下二级列表
  const byDim = new Map<number, SubDimensionScoreResult[]>();
  for (const s of subDimensions) {
    const arr = byDim.get(s.dim_id) ?? [];
    arr.push(s);
    byDim.set(s.dim_id, arr);
  }
  // 以一级维度顺序为准展开
  const groups = dimensions
    .map((d) => ({ dim: d, subs: byDim.get(d.dim_id) ?? [] }))
    .filter((g) => g.subs.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 mb-4">
      <h3 className="text-sm font-semibold text-on-surface mb-4">二级维度明细</h3>
      <div className="space-y-6">
        {groups.map(({ dim, subs }) => (
          <div key={dim.dim_id}>
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-primary text-[20px]">
                {DIM_ICONS[dim.dim_name] ?? FALLBACK_ICON}
              </span>
              <span className="text-sm font-bold text-on-surface">
                {dimName.get(dim.dim_id) ?? dim.dim_name}
              </span>
            </div>
            <div className="space-y-3 pl-1">
              {subs.map((s) => {
                const pct = Math.max(0, Math.min(100, (s.score / 5) * 100));
                return (
                  <div key={s.sub_id} className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-on-surface-variant min-w-0 truncate">
                      {s.sub_name}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-20 h-1.5 bg-surface-container rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[13px] font-semibold w-8 text-right">
                        {s.score.toFixed(1)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
