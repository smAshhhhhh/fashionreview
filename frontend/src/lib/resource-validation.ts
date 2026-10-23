import type { DimensionNode } from "./api";

/** 与保存结构保持一致；范围检查独立于同级合计，防止负数与超额互相抵消。 */
export function metricFieldProblems(dims: DimensionNode[]): string[] {
  const problems: string[] = [];
  const check = (name: string, weight: number, label: string, maxLength: number) => {
    if (!name.trim()) problems.push(`${label}名称不能为空`);
    else if (name.length > maxLength) problems.push(`${label}名称不能超过 ${maxLength} 个字符`);
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) problems.push(`${label}权重必须在 0% 到 100% 之间`);
  };
  for (const [di, dim] of dims.entries()) {
    check(dim.dim_name, dim.dim_weight, `第 ${di + 1} 个一级维度`, 100);
    for (const [si, sub] of dim.subs.entries()) {
      check(sub.sub_name, sub.sub_weight, `「${dim.dim_name}」第 ${si + 1} 个二级维度`, 100);
      for (const [mi, metric] of sub.metrics.entries()) check(metric.metric_name, metric.metric_weight, `「${sub.sub_name}」第 ${mi + 1} 个指标`, 200);
    }
  }
  return problems;
}
