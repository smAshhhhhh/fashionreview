import type { DimensionScoreResult } from "../types";

/**
 * 维度雷达图。吃后端一级维度分（5 分制），按维度数均分轴角度。
 * 标签位置根据每根轴的角度自动计算，支持任意维度数（当前后端为 5 维）。
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
  // 从正上方(-90°)开始，顺时针均分
  const angleAt = (i: number) => -90 + (360 / n) * i;

  // 各轴端点（栅格）
  const axes = dimensions.map((_, i) => ({
    x: cx + r * Math.cos(rad(angleAt(i))),
    y: cy + r * Math.sin(rad(angleAt(i))),
  }));

  // 数据多边形：score/5 归一化
  const dataPoints = dimensions.map((d, i) => {
    const ratio = Math.max(0, Math.min(1, d.score / 5));
    return {
      x: cx + r * ratio * Math.cos(rad(angleAt(i))),
      y: cy + r * ratio * Math.sin(rad(angleAt(i))),
    };
  });
  const polygonPoints = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  // 顶点分数标签：在顶点基础上沿轴向外推一点，避免压在多边形描边上
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

  // 标签锚点：略超出最外圈，按角度推到轴外侧
  const labelPoints = dimensions.map((d, i) => {
    const deg = angleAt(i);
    const lr = r + 8;
    const x = cx + lr * Math.cos(rad(deg));
    const y = cy + lr * Math.sin(rad(deg));
    // 根据 x 相对中心决定文本对齐，避免标签压到图形
    const anchor: "middle" | "start" | "end" =
      Math.abs(x - cx) < 4 ? "middle" : x < cx ? "end" : "start";
    return { x, y, anchor, name: d.dim_name };
  });

  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 flex flex-col items-center justify-center min-h-75">
      <h3 className="text-sm font-semibold text-on-surface self-start mb-6">
        街道 DNA 指纹
      </h3>
      <div className="relative w-full aspect-square max-w-65 flex items-center justify-center">
        <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100">
          {/* 栅格圈 */}
          {[40, 30, 20, 10].map((gr) => (
            <circle
              key={gr}
              cx="50"
              cy="50"
              r={gr}
              fill="none"
              stroke="#EFF3F4"
              strokeWidth="0.5"
            />
          ))}
          {/* 轴线 */}
          {axes.map((p, i) => (
            <line
              key={i}
              x1="50"
              y1="50"
              x2={p.x}
              y2={p.y}
              stroke="#EFF3F4"
              strokeWidth="0.5"
            />
          ))}
          {/* 数据多边形 */}
          {n > 0 && (
            <polygon
              points={polygonPoints}
              fill="rgba(0, 98, 157, 0.2)"
              stroke="#00629d"
              strokeWidth="1.5"
            />
          )}
          {/* 顶点圆点 */}
          {dataPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="1.4" fill="#00629d" />
          ))}
          {/* 顶点分数 */}
          {valuePoints.map((vp, i) => (
            <text
              key={i}
              x={vp.x}
              y={vp.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="4"
              fontWeight="700"
              fill="#00629d"
            >
              {vp.value}
            </text>
          ))}
          {/* 轴标签（随维度名动态渲染） */}
          {labelPoints.map((lp, i) => (
            <text
              key={i}
              x={lp.x}
              y={lp.y}
              textAnchor={lp.anchor}
              dominantBaseline="middle"
              fontSize="4.5"
              fill="currentColor"
              className="text-on-surface-variant"
            >
              {lp.name}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
