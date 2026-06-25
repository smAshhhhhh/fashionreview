import type { DimensionScoreResult } from "../types";

/** 维度名 → 图标的本地映射；未命中给兜底图标（后端不返回 icon）。 */
const DIM_ICONS: Record<string, string> = {
  空间美学: "architecture",
  商业业态: "storefront",
  文化体验: "theater_comedy",
  活力人气: "groups",
  传播影响: "share",
};
const FALLBACK_ICON = "insights";

/** 指标拆解：各一级维度的分数（5 分制）与进度条。 */
export default function DimensionScores({
  dimensions,
}: {
  dimensions: DimensionScoreResult[];
}) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6">
      <h3 className="text-sm font-semibold text-on-surface mb-4">指标拆解</h3>
      <div className="space-y-4">
        {dimensions.map((dim) => {
          const percentage = Math.max(0, Math.min(100, (dim.score / 5) * 100));
          return (
            <div
              key={dim.dim_id}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">
                  {DIM_ICONS[dim.dim_name] ?? FALLBACK_ICON}
                </span>
                <span className="text-sm">{dim.dim_name}</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-24 h-1.5 bg-surface-container rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-sm font-semibold w-8 text-right">
                  {dim.score.toFixed(1)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
