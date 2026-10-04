"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "../components/Sidebar";
import MobileBottomNav from "../components/MobileBottomNav";
import HeaderCard from "../components/HeaderCard";
import RadarChart from "../components/RadarChart";
import MetricBreakdown from "../components/MetricBreakdown";
import ReportSummary from "../components/ReportSummary";
import SimilarAnnotations from "../components/SimilarAnnotations";
import { LAST_EVAL_KEY } from "../components/ActiveTaskGuard";
import { getEvaluationResult } from "../../lib/api";
import type { EvaluationResult } from "../types";

/* ──── 页面外壳：侧边栏 + 内容 + 底部导航 ──── */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar activeHref="/analytics" />
      {/* mock 为纯白主内容区，故内容容器强制白底 */}
      <main className="lg:ml-64 min-h-screen bg-white text-[#0f1419]">
        <div className="py-8 px-4 md:px-8 max-w-247.5 mx-auto">{children}</div>
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
  const showReport = show("ai_summary");
  // 雷达 / 综合评价共用「中段」，任一开启才渲染该段
  const showMidRow = showRadar || showReport;

  return (
    <div className="space-y-8">
      <HeaderCard
        streetName={data.street}
        totalScore={data.total_score}
        imageUrl={show("header_image") ? data.image_url : null}
        showScore={show("total_score")}
      />

      {/* 中段：雷达图（左） + 综合评价（右），对齐 mock 的 12 栏并排 */}
      {showMidRow && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-x-20 gap-y-8 pb-6 border-b border-[#eff3f4]">
          {showRadar && (
            <div className="lg:col-span-5 flex items-center justify-center">
              <RadarChart dimensions={data.dimension_scores} />
            </div>
          )}
          {showReport && (
            <div className={showRadar ? "lg:col-span-7" : "lg:col-span-12"}>
              <ReportSummary summary={data.summary} />
            </div>
          )}
        </section>
      )}

      {(show("sub_dimension") || show("metric_score")) && (
        <MetricBreakdown
          dimensions={data.dimension_scores}
          subDimensions={data.sub_dimension_scores}
          metrics={data.metric_scores}
          showReason={show("metric_reason")}
          imageAttributes={
            show("image_attribute") ? data.image_attributes : []
          }
        />
      )}

      {/* 相似审美节点：人工标注库里最相似的标注图（照片点评才有）。
          组件在无候选时自行返回 null，故文字点评下该区块不占位。 */}
      {show("similar_streets") && (
        <SimilarAnnotations items={data.similar_annotations} />
      )}
    </div>
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
