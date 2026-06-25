"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "../components/Sidebar";
import MobileBottomNav from "../components/MobileBottomNav";
import HeaderCard from "../components/HeaderCard";
import RadarChart from "../components/RadarChart";
import DimensionScores from "../components/DimensionScores";
import SubDimensionScores from "../components/SubDimensionScores";
import MetricScores from "../components/MetricScores";
import AIInsight from "../components/AIInsight";
import { LAST_EVAL_KEY } from "../components/ActiveTaskGuard";
import { getEvaluationResult } from "../../lib/api";
import type { EvaluationResult } from "../types";

/* ──── 页面外壳：侧边栏 + 内容 + 底部导航 ──── */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar activeHref="/analytics" />
      <main className="lg:ml-64 min-h-screen">
        <div className="pt-12 pb-12 px-4 max-w-5xl mx-auto">{children}</div>
      </main>
      <MobileBottomNav activeHref="/analytics" />
    </>
  );
}

/* ──── 居中提示（空态 / 加载 / 错误共用）──── */
function CenteredNotice({
  icon,
  title,
  desc,
  action,
  spin = false,
}: {
  icon: string;
  title: string;
  desc?: string;
  action?: { label: string; onClick: () => void };
  spin?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <span
        className={`material-symbols-outlined text-5xl text-on-surface-variant ${
          spin ? "animate-spin" : ""
        }`}
      >
        {icon}
      </span>
      <div>
        <h2 className="text-xl font-bold text-on-surface">{title}</h2>
        {desc && (
          <p className="text-sm text-on-surface-variant mt-1">{desc}</p>
        )}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/* ──── 结果内容区 ──── */
function ResultView({ data }: { data: EvaluationResult }) {
  // 后端已按「分析管理」配置过滤字段，并下发启用区块清单；前端据此渲染
  const enabled = new Set(data.enabled_blocks);
  const show = (key: string) => enabled.has(key);

  const showRadar = show("radar_chart");
  const showBreak = show("dimension_break");
  // 雷达图与一级拆解共用一行栅格，两者都关时整行不渲染
  const showVisualRow = showRadar || showBreak;

  return (
    <>
      <HeaderCard
        streetName={data.street}
        totalScore={data.total_score}
        imageUrl={show("header_image") ? data.image_url : null}
        showScore={show("total_score")}
      />

      {showVisualRow && (
        <div
          className={`grid grid-cols-1 gap-4 mb-4 ${
            showRadar && showBreak ? "md:grid-cols-2" : ""
          }`}
        >
          {showRadar && <RadarChart dimensions={data.dimension_scores} />}
          {showBreak && <DimensionScores dimensions={data.dimension_scores} />}
        </div>
      )}

      {show("sub_dimension") && (
        <SubDimensionScores
          dimensions={data.dimension_scores}
          subDimensions={data.sub_dimension_scores}
        />
      )}

      {show("metric_score") && (
        <MetricScores
          dimensions={data.dimension_scores}
          subDimensions={data.sub_dimension_scores}
          metrics={data.metric_scores}
          showReason={show("metric_reason")}
        />
      )}

      {show("ai_summary") && <AIInsight summary={data.summary} />}

      {show("similar_streets") && (
        /* TODO: 相似街道推荐。待 street_similarity 表产出数据后接入，
            目前评价链未生成相似街巷，先以占位提示保留区块。 */
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-on-surface-variant mb-3 px-1 uppercase tracking-widest">
            相似审美节点
          </h3>
          <div className="rounded-2xl border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">
            相似街道推荐即将上线（待接入 street_similarity 数据）
          </div>
        </div>
      )}
    </>
  );
}

/* ──── 数据装载：读 eid → 拉结果 → 分状态渲染 ──── */
function AnalyticsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eidParam = searchParams.get("eid");
  const eid = eidParam ? Number(eidParam) : NaN;
  const hasValidEid = Number.isFinite(eid);

  const [data, setData] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 无 eid 时：尝试回退到上次结果。null=判定中，false=确无上次结果（显示空态）
  const [fallbackResolved, setFallbackResolved] = useState(false);

  // 无 eid 进入：回退读 lastEvaluationId，有则跳过去显示上次结果
  useEffect(() => {
    if (hasValidEid) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_EVAL_KEY);
    } catch {
      /* storage 不可用，按无上次结果处理 */
    }
    if (last && Number.isFinite(Number(last))) {
      router.replace(`/analytics?eid=${last}`);
    } else {
      // 与外部系统（localStorage）同步：无法在渲染期读取，故此处同步置位。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFallbackResolved(true);
    }
  }, [hasValidEid, router]);

  useEffect(() => {
    if (!hasValidEid) return; // 无 eid 由上面的回退 effect 处理
    let cancelled = false;

    (async () => {
      try {
        const res = await getEvaluationResult(eid);
        if (cancelled) return;
        setData(res);
        // 成功展示的结果记为「上次结果」，供下次无 eid 进入时回退
        if (res.status === "completed") {
          try {
            localStorage.setItem(LAST_EVAL_KEY, String(res.evaluation_id));
          } catch {
            /* storage 不可用，忽略 */
          }
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "加载评价结果失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eid, hasValidEid]);

  // 无 eid：回退判定中显示 loading；确无上次结果才显示空态
  if (!hasValidEid) {
    if (!fallbackResolved) {
      return (
        <Shell>
          <CenteredNotice icon="progress_activity" title="正在加载…" spin />
        </Shell>
      );
    }
    return (
      <Shell>
        <CenteredNotice
          icon="analytics"
          title="还没有可展示的分析"
          desc="从首页搜索一条街道，发起一次时尚度分析吧"
          action={{ label: "去首页发起分析", onClick: () => router.push("/") }}
        />
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell>
        <CenteredNotice icon="progress_activity" title="正在加载评价结果…" spin />
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <CenteredNotice
          icon="error"
          title="加载失败"
          desc={error}
          action={{ label: "返回首页", onClick: () => router.push("/") }}
        />
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <CenteredNotice icon="help" title="未找到该评价记录" />
      </Shell>
    );
  }

  // 带 eid 但分析尚未完成（理论上守卫会先拦截，这里兜底）
  if (data.status !== "completed") {
    const isFailed = data.status === "failed";
    return (
      <Shell>
        <CenteredNotice
          icon={isFailed ? "error" : "hourglass_top"}
          title={isFailed ? "该分析未能完成" : "分析仍在进行中"}
          desc={
            isFailed
              ? "请返回首页重新发起分析"
              : "稍候片刻，分析完成后即可查看结果"
          }
          action={{ label: "返回首页", onClick: () => router.push("/") }}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <ResultView data={data} />
    </Shell>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="lg:ml-64 min-h-screen" />}>
      <AnalyticsInner />
    </Suspense>
  );
}
