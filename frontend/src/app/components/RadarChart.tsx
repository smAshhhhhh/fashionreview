"use client";

import { useId, useState } from "react";
import type { DimensionScoreResult } from "../types";

/** 维度雷达图：一级维度分（5 分制），虚线多边形网格、渐变发光数据面，悬停显示分数。 */

const MAX_SCORE = 5;
const LEVELS = 5;
const C = 50; // viewBox 0~100 的中心
const R = 32; // 数据区半径
const LABEL_R = 39;
const HIT_R = 48; // 悬停感应扇区半径，覆盖到维度名称

const polar = (deg: number, radius: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: C + radius * Math.cos(a), y: C + radius * Math.sin(a) };
};
const toPoints = (pts: { x: number; y: number }[]) =>
  pts.map((p) => `${p.x},${p.y}`).join(" ");

export default function RadarChart({
  dimensions,
}: {
  dimensions: DimensionScoreResult[];
}) {
  // useId 可能含冒号等字符，url(#id) 引用前先清理
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fillId = `radar-fill-${uid}`;
  const glowId = `radar-glow-${uid}`;
  const [active, setActive] = useState<number | null>(null);

  const n = dimensions.length;
  if (n < 3) return null;

  const angles = dimensions.map((_, i) => -90 + (360 / n) * i);
  const ratio = (s: number) => Math.max(0, Math.min(1, s / MAX_SCORE));
  const points = dimensions.map((d, i) => polar(angles[i], R * ratio(d.score)));
  const half = 180 / n;

  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-100"
      onMouseLeave={() => setActive(null)}
    >
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full overflow-visible"
        role="img"
        aria-label={dimensions.map((d) => `${d.dim_name} ${d.score.toFixed(1)} 分`).join("，")}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.1} />
          </linearGradient>
          <filter id={glowId} x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation="1.7" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 网格：每 1 分一圈虚线多边形 + 放射线 */}
        <g fill="none" stroke="var(--color-divider)" strokeWidth="0.35" strokeDasharray="1 1">
          {Array.from({ length: LEVELS }, (_, k) => (
            <polygon
              key={k}
              points={toPoints(angles.map((a) => polar(a, (R * (k + 1)) / LEVELS)))}
            />
          ))}
          {angles.map((a, i) => {
            const p = polar(a, R);
            return <line key={i} x1={C} y1={C} x2={p.x} y2={p.y} />;
          })}
        </g>

        <g className="fx-radar-in">
          <polygon
            points={toPoints(points)}
            fill={`url(#${fillId})`}
            stroke="var(--color-primary)"
            strokeWidth="0.85"
            strokeLinejoin="round"
            filter={`url(#${glowId})`}
          />
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={active === i ? 1.9 : 1.3}
              fill={active === i ? "var(--color-primary)" : "var(--color-surface)"}
              stroke="var(--color-primary)"
              strokeWidth="0.85"
            />
          ))}
        </g>

        {dimensions.map((d, i) => {
          const p = polar(angles[i], LABEL_R);
          const cos = Math.cos((angles[i] * Math.PI) / 180);
          const anchor = Math.abs(cos) < 0.2 ? "middle" : cos < 0 ? "end" : "start";
          return (
            <text
              key={d.dim_id}
              x={p.x}
              y={p.y}
              textAnchor={anchor}
              dominantBaseline="middle"
              fontSize="3.8"
              fontWeight={active === i ? 600 : 500}
              fill={active === i ? "var(--color-on-surface)" : "var(--color-on-surface-variant)"}
            >
              {d.dim_name}
            </text>
          );
        })}

        {/* 透明扇区：鼠标移到维度方向即激活，不必精确对准圆点 */}
        {angles.map((a, i) => {
          const p1 = polar(a - half, HIT_R);
          const p2 = polar(a + half, HIT_R);
          return (
            <path
              key={i}
              d={`M ${C} ${C} L ${p1.x} ${p1.y} A ${HIT_R} ${HIT_R} 0 0 1 ${p2.x} ${p2.y} Z`}
              fill="transparent"
              onMouseEnter={() => setActive(i)}
            />
          );
        })}
      </svg>

      {active !== null && (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            left: `${points[active].x}%`,
            top: `${points[active].y}%`,
            transform: "translate(-50%, calc(-100% - 8px))",
          }}
        >
          <div className="fx-pop-in whitespace-nowrap rounded-lg border border-divider bg-surface-container-lowest px-2.5 py-1.5 text-xs shadow-lg">
            <span className="text-on-surface-variant">{dimensions[active].dim_name}</span>
            <span className="ml-2 font-semibold tabular-nums text-primary">
              {dimensions[active].score.toFixed(1)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
