import type { DimensionScoreResult } from "../types";

/**
 * 维度雷达图（完全对齐 mock 外观）：网格 #eff3f4、数据面 rgba(29,155,240,0.1)、
 * 描边 #1d9bf0、标签 #536471。无卡片外壳，直接作为报告中段左栏。
 * 吃后端一级维度分（5 分制），按维度数均分轴角度，支持任意维度数。
 */
export default function RadarChart({
  dimensions,
}: {
  dimensions: DimensionScoreResult[];
}) {
  const cx = 50;
  const cy = 50;
  const r = 40;
  const n = dimensions.length;

  const rad = (deg: number) => (deg * Math.PI) / 180;
  const angleAt = (i: number) => -90 + (360 / n) * i;

  const axes = dimensions.map((_, i) => ({
    x: cx + r * Math.cos(rad(angleAt(i))),
    y: cy + r * Math.sin(rad(angleAt(i))),
  }));

  const dataPoints = dimensions.map((d, i) => {
    const ratio = Math.max(0, Math.min(1, d.score / 5));
    return {
      x: cx + r * ratio * Math.cos(rad(angleAt(i))),
      y: cy + r * ratio * Math.sin(rad(angleAt(i))),
    };
  });
  const polygonPoints = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  const valuePoints = dimensions.map((d, i) => {
    const deg = angleAt(i);
    const ratio = Math.max(0, Math.min(1, d.score / 5));
    const vr = r * ratio + 4;
    return {
      x: cx + vr * Math.cos(rad(deg)),
      y: cy + vr * Math.sin(rad(deg)),
      value: d.score.toFixed(1),
    };
  });

  const labelPoints = dimensions.map((d, i) => {
    const deg = angleAt(i);
    const lr = r + 9;
    const x = cx + lr * Math.cos(rad(deg));
    const y = cy + lr * Math.sin(rad(deg));
    const anchor: "middle" | "start" | "end" =
      Math.abs(x - cx) < 4 ? "middle" : x < cx ? "end" : "start";
    return { x, y, anchor, name: d.dim_name };
  });

  return (
    <div className="flex items-center justify-center w-full">
      <div className="relative w-full max-w-100 aspect-square">
        <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100">
          {[40, 30, 20, 10].map((gr) => (
            <circle
              key={gr}
              cx="50"
              cy="50"
              r={gr}
              fill="none"
              stroke="#eff3f4"
              strokeWidth="0.6"
            />
          ))}
          {axes.map((p, i) => (
            <line
              key={i}
              x1="50"
              y1="50"
              x2={p.x}
              y2={p.y}
              stroke="#eff3f4"
              strokeWidth="0.6"
            />
          ))}
          {n > 0 && (
            <polygon
              points={polygonPoints}
              fill="rgba(29, 155, 240, 0.1)"
              stroke="#1d9bf0"
              strokeWidth="1.5"
            />
          )}
          {dataPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="1.3" fill="#1d9bf0" />
          ))}
          {valuePoints.map((vp, i) => (
            <text
              key={i}
              x={vp.x}
              y={vp.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="4"
              fontWeight="700"
              fill="#1d9bf0"
            >
              {vp.value}
            </text>
          ))}
          {labelPoints.map((lp, i) => (
            <text
              key={i}
              x={lp.x}
              y={lp.y}
              textAnchor={lp.anchor}
              dominantBaseline="middle"
              fontSize="4.5"
              fontWeight="500"
              fill="#536471"
            >
              {lp.name}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
