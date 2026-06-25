import type {
  DimensionScoreResult,
  MetricScoreResult,
  SubDimensionScoreResult,
} from "../types";

/** 5 分制 → 配色档：高分绿、中分主色、低分橙。 */
function scoreTone(score: number): string {
  if (score >= 4) return "bg-green-100/60 text-green-700";
  if (score >= 3) return "bg-primary/10 text-primary";
  return "bg-orange-100/60 text-orange-700";
}

/**
 * 三级指标得分：按「一级维度 → 二级维度」层级罗列每个三级指标的得分（整数 1~5），
 * showReason 开启时一并展示 AI 评分依据 reason。
 */
export default function MetricScores({
  dimensions,
  subDimensions,
  metrics,
  showReason,
}: {
  dimensions: DimensionScoreResult[];
  subDimensions: SubDimensionScoreResult[];
  metrics: MetricScoreResult[];
  /** 是否展示三级指标的 AI 评分依据 */
  showReason: boolean;
}) {
  if (metrics.length === 0) return null;

  const subName = new Map(subDimensions.map((s) => [s.sub_id, s.sub_name]));

  // 三级按 sub_id 归组
  const bySub = new Map<number, MetricScoreResult[]>();
  for (const m of metrics) {
    const arr = bySub.get(m.sub_id) ?? [];
    arr.push(m);
    bySub.set(m.sub_id, arr);
  }
  // 二级按 dim_id 归组（保留后端顺序）
  const subsByDim = new Map<number, SubDimensionScoreResult[]>();
  for (const s of subDimensions) {
    const arr = subsByDim.get(s.dim_id) ?? [];
    arr.push(s);
    subsByDim.set(s.dim_id, arr);
  }

  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 mb-4">
      <h3 className="text-sm font-semibold text-on-surface mb-4">
        三级指标得分
        <span className="text-on-surface-variant font-normal ml-2">
          共 {metrics.length} 项
        </span>
      </h3>
      <div className="space-y-6">
        {dimensions.map((dim) => {
          const subs = subsByDim.get(dim.dim_id) ?? [];
          if (subs.length === 0) return null;
          return (
            <div key={dim.dim_id}>
              <span className="text-sm font-bold text-on-surface">{dim.dim_name}</span>
              <div className="mt-3 space-y-4">
                {subs.map((s) => {
                  const items = bySub.get(s.sub_id) ?? [];
                  if (items.length === 0) return null;
                  return (
                    <div key={s.sub_id}>
                      <p className="text-[13px] font-semibold text-on-surface-variant mb-2">
                        {subName.get(s.sub_id) ?? s.sub_name}
                      </p>
                      <div className="space-y-2">
                        {items.map((m) => (
                          <div
                            key={m.metric_id}
                            className="rounded-xl border border-outline-variant/50 p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[13px] text-on-surface min-w-0">
                                {m.metric_name}
                              </span>
                              <span
                                className={`text-[12px] font-bold px-2 py-0.5 rounded shrink-0 tabular-nums ${scoreTone(
                                  m.score,
                                )}`}
                              >
                                {m.score} / 5
                              </span>
                            </div>
                            {showReason && m.reason && (
                              <p className="text-[12px] text-on-surface-variant mt-2 leading-relaxed">
                                {m.reason}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
