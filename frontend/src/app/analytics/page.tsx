"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "../components/Sidebar";
import MobileBottomNav from "../components/MobileBottomNav";
import HeaderCard from "../components/HeaderCard";
import RadarChart from "../components/RadarChart";
import MetricBreakdown from "../components/MetricBreakdown";
import ReportSummary from "../components/ReportSummary";
import SimilarStreets from "../components/SimilarStreets";
import { LAST_EVAL_KEY } from "../components/ActiveTaskGuard";
import { getEvaluationResult } from "../../lib/api";
import { evaluationId } from "../../lib/evaluation-result";
import type { EvaluationResult } from "../types";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar activeHref="/analytics" />
      <main
        id="analytics-content"
        className="analytics-main lg:ml-64 bg-surface text-on-surface"
      >
        <div className="@container mx-auto max-w-247.5 px-4 py-6 sm:py-8 md:px-8">
          {children}
        </div>
      </main>
      <MobileBottomNav activeHref="/analytics" />
    </>
  );
}

function CenteredNotice({
  icon,
  title,
  desc,
  action,
  spin = false,
  error = false,
}: {
  icon: string;
  title: string;
  desc?: string;
  action?: { label: string; onClick: () => void };
  spin?: boolean;
  error?: boolean;
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-4 py-16 text-center sm:py-24">
      <span
        aria-hidden="true"
        className={`material-symbols-outlined text-5xl text-on-surface-variant ${spin ? "motion-safe:animate-spin" : ""}`}
      >
        {icon}
      </span>
      <div role={error ? "alert" : "status"} aria-atomic="true">
        <h1 className="text-xl font-bold text-brand">{title}</h1>
        {desc && (
          <p className="mt-2 text-base leading-relaxed text-on-surface-variant">
            {desc}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="min-h-11 rounded-full bg-primary px-5 py-2 text-sm font-bold text-on-primary hover:opacity-90 transition-opacity"
          >
            {action.label}
          </button>
        )}
        {!spin && (
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-full px-4 py-2 text-sm font-semibold text-primary hover:bg-surface-container"
          >
            {error ? "返回首页" : "去首页发起分析"}
          </Link>
        )}
      </div>
    </div>
  );
}

function ResultView({ data }: { data: EvaluationResult }) {
  const enabled = new Set(data.enabled_blocks);
  const show = (key: string) => enabled.has(key);
  const showRadar = show("radar_chart") && data.dimension_scores.length >= 3;
  const showReport = show("ai_summary");
  return (
    <div className="space-y-8 sm:space-y-10">
      <p role="status" className="sr-only">
        已加载{data.street.trim() || "未命名街巷"}的分析结果。
      </p>
      <HeaderCard
        streetName={data.street}
        totalScore={data.total_score}
        imageUrl={show("header_image") ? data.image_url : null}
        streetType={data.street_type?.name}
        showScore={show("total_score")}
      />
      {(showRadar || showReport) && (
        <section
          aria-label="总体评价"
          className={`grid min-w-0 grid-cols-1 items-center gap-8 border-b border-divider pb-8 ${showRadar && showReport ? "@[48rem]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @[48rem]:gap-10" : ""}`}
        >
          {showRadar && (
            <div className="min-w-0 px-4">
              <RadarChart dimensions={data.dimension_scores} />
            </div>
          )}
          {showReport && (
            <div className="min-w-0">
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
          templateSource={data.template_source}
          imageAttributes={show("image_attribute") ? data.image_attributes : []}
        />
      )}
      {show("similar_streets") && (
        <SimilarStreets items={data.similar_streets} />
      )}
    </div>
  );
}

type ResultState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: EvaluationResult };

/** 以记录 id 和重试次数作为 key，避免切换记录时沿用上一条的状态。 */
function ResultRequest({ eid, retry }: { eid: number; retry: () => void }) {
  const [state, setState] = useState<ResultState>({ phase: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    void getEvaluationResult(eid, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ phase: "ready", data });
        if (data.status === "completed") {
          try {
            localStorage.setItem(LAST_EVAL_KEY, String(data.evaluation_id));
          } catch {
            /* 存储不可用时忽略 */
          }
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setState({
            phase: "error",
            message:
              cause instanceof Error
                ? cause.message
                : "加载评价结果失败，请重试。",
          });
      });
    return () => controller.abort();
  }, [eid]);

  if (state.phase === "loading")
    return (
      <CenteredNotice icon="progress_activity" title="正在加载评价结果…" spin />
    );
  if (state.phase === "error")
    return (
      <CenteredNotice
        icon="error"
        title="加载失败"
        desc={state.message}
        action={{ label: "重新加载", onClick: retry }}
        error
      />
    );
  if (state.data.status !== "completed") {
    const ended = ["failed", "cancelled"].includes(state.data.status);
    return (
      <CenteredNotice
        icon={ended ? "error" : "hourglass_top"}
        title={ended ? "该分析未能完成" : "分析仍在进行中"}
        desc={
          ended
            ? "可返回首页重新发起分析，或查看历史记录中的其他结果。"
            : "本页不会自动刷新。稍候点击「核对分析状态」，完成后即可查看结果。"
        }
        action={ended ? undefined : { label: "核对分析状态", onClick: retry }}
        error={ended}
      />
    );
  }
  return <ResultView data={state.data} />;
}

function RecordResult({ eid }: { eid: number }) {
  const [attempt, setAttempt] = useState(0);
  return (
    <ResultRequest
      key={attempt}
      eid={eid}
      retry={() => setAttempt((value) => value + 1)}
    />
  );
}

function LastResult() {
  const router = useRouter();
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    let stored: number | null = null;
    try {
      stored = evaluationId(localStorage.getItem(LAST_EVAL_KEY));
    } catch {
      /* 读不到时显示空态 */
    }
    if (stored !== null) router.replace(`/analytics?eid=${stored}`);
    else {
      // 在客户端挂载后再读浏览器存储，避免服务端渲染结果不一致。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResolved(true);
    }
  }, [router]);
  return resolved ? (
    <CenteredNotice
      icon="analytics"
      title="还没有可展示的分析"
      desc="从首页搜索一条街道，发起一次时尚度分析。"
    />
  ) : (
    <CenteredNotice icon="progress_activity" title="正在加载上次评价…" spin />
  );
}

function AnalyticsInner() {
  const params = useSearchParams();
  const rawId = params.get("eid");
  const eid = evaluationId(rawId);
  return (
    <Shell>
      {rawId !== null && eid === null ? (
        <CenteredNotice
          icon="error"
          title="评价地址无效"
          desc="请从历史记录打开已有评价，或返回首页发起分析。"
          error
        />
      ) : eid !== null ? (
        <RecordResult key={eid} eid={eid} />
      ) : (
        <LastResult />
      )}
    </Shell>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <CenteredNotice
            icon="progress_activity"
            title="正在加载分析中心…"
            spin
          />
        </Shell>
      }
    >
      <AnalyticsInner />
    </Suspense>
  );
}
