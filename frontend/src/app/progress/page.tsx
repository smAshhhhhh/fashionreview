"use client";

import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "../components/Sidebar";
import MobileBottomNav from "../components/MobileBottomNav";
import ProgressStep from "../components/ProgressStep";
import { ACTIVE_TASK_KEY } from "../components/ActiveTaskGuard";
import type { ProgressStage, ProgressStatus } from "../types";
import {
  fetchTaskProgress,
  progressStreamUrl,
  type TaskProgress,
} from "../../lib/api";

/* ──── 时间线骨架（progress 阈值对齐后端 progress_service 真实节点）──── */
// 后端进度为计数式并发评分：识别10 → 画像20 → 评分33/46/59/72/85 → 报告95 → 完成100。
// detail 为缺省文案，运行时 active 段会被 SSE 的 stage_message 覆盖。
const STAGES: ProgressStage[] = [
  { stage: "recognize", progress: 10, title: "正在识别街巷", detail: "定位地理坐标与街道轮廓" },
  { stage: "profile", progress: 20, title: "正在获取街巷画像", detail: "汇总街区事实数据" },
  { stage: "scoring", progress: 33, title: "已完成 1/5 维度评分", detail: "多维度并发评分中" },
  { stage: "scoring", progress: 46, title: "已完成 2/5 维度评分", detail: "多维度并发评分中" },
  { stage: "scoring", progress: 59, title: "已完成 3/5 维度评分", detail: "多维度并发评分中" },
  { stage: "scoring", progress: 72, title: "已完成 4/5 维度评分", detail: "多维度并发评分中" },
  { stage: "scoring", progress: 85, title: "已完成 5/5 维度评分", detail: "多维度并发评分中" },
  { stage: "report", progress: 95, title: "正在生成评价报告", detail: "综合各维度得分撰写画像" },
  { stage: "done", progress: 100, title: "分析完成", detail: "正在跳转到分析结果…" },
];

const VIEWPORT_HEIGHT = 520; // 时间线可视区高度（px）

/** 根据后端 progress 百分比，反推应点亮到第几段（最后一个 progress<=当前值的段）。 */
function indexFromProgress(p: number): number {
  let idx = 0;
  for (let i = 0; i < STAGES.length; i++) {
    if (p >= STAGES[i].progress) idx = i;
  }
  return idx;
}

function AnalysisProgressInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // 街道名标题：URL 的 q 仅作首帧前的初始占位；拿到后端 text_input 后以它为准。
  // 这样刷新 / 被守卫重定向（URL 不带 q）时也能从后端恢复真实街道名，不丢名。
  const initialQuery = searchParams.get("q") || "";
  const [streetName, setStreetName] = useState(initialQuery);
  const title = streetName || "目标街道";
  // 任务由提交页（SearchBar）创建后经 URL 传入，进度页只负责恢复 + 订阅，绝不再提交。
  // 这样刷新 / 后退 / 分享链接都不会触发新任务（见 docs/analyze_process_optimization.md）。
  const taskIdParam = searchParams.get("taskId");
  const taskId = taskIdParam ? Number(taskIdParam) : NaN;
  // taskId 无效是渲染期即可判定的派生状态，不放进 effect（避免 effect 内同步 setState）
  const hasValidTask = Number.isFinite(taskId);

  // 当前点亮到第几段（由后端 progress 反推）
  const [currentIndex, setCurrentIndex] = useState(0);
  // active 段的实时文案（来自 SSE stage_message）
  const [activeMessage, setActiveMessage] = useState<string | null>(null);
  // 错误信息（failed 或网络异常）
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 用于测量「当前阶段」节点位置，计算居中偏移
  const trackRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [offsetY, setOffsetY] = useState(0);

  // 恢复进度快照 → 订阅 SSE 实时进度（不提交任务）
  useEffect(() => {
    if (!hasValidTask) return; // 无效 taskId 在渲染期已处理，effect 不做任何事

    let es: EventSource | null = null;
    let cancelled = false;

    // 快照与 SSE 帧共用的处理逻辑：反推阶段、覆盖文案、终态收尾。
    // 返回 true 表示已进入终态（completed/failed），调用方据此决定是否还需连 SSE。
    const applyProgress = (data: TaskProgress): boolean => {
      setCurrentIndex(indexFromProgress(data.progress));
      if (data.stage_message) setActiveMessage(data.stage_message);
      // 后端回传的原始输入即街道名，作为标题权威来源（覆盖 URL q 占位）
      if (data.text_input) setStreetName(data.text_input);

      // 任务进入终态：清除活跃任务记录，避免下次进首页被守卫误拦
      const clearActive = () => {
        try {
          localStorage.removeItem(ACTIVE_TASK_KEY);
        } catch {
          /* storage 不可用，忽略 */
        }
      };

      if (data.status === "completed") {
        clearActive();
        const eid = data.evaluation_id;
        setTimeout(() => {
          router.push(eid ? `/analytics?eid=${eid}` : "/analytics");
        }, 800);
        return true;
      }
      if (data.status === "failed") {
        clearActive();
        setErrorMsg(data.error_message || "分析失败，请重试");
        return true;
      }
      return false;
    };

    (async () => {
      // ① 刷新后立即恢复当前进度，避免从 0 开始；拿不到快照不阻断，继续连 SSE
      try {
        const snap = await fetchTaskProgress(taskId);
        if (cancelled) return;
        if (applyProgress(snap)) return; // 已是终态，无需再连 SSE
      } catch {
        /* 快照失败（如任务刚建索引未就绪）忽略，交给 SSE 续推 */
      }
      if (cancelled) return;

      // ② 续接实时进度
      es = new EventSource(progressStreamUrl(taskId));
      es.addEventListener("progress", (ev) => {
        const data: TaskProgress = JSON.parse((ev as MessageEvent).data);
        if (applyProgress(data)) es?.close();
      });
      es.addEventListener("error", () => {
        // SSE 连接异常（区别于业务 failed）
        es?.close();
        if (!cancelled) setErrorMsg("与服务器的连接中断，请重试");
      });
    })();

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [taskId, hasValidTask, router]);

  // 计算偏移量：让当前 active 节点在视口垂直居中
  useLayoutEffect(() => {
    const el = stepRefs.current[currentIndex];
    if (!el) return;
    const stepCenter = el.offsetTop + el.offsetHeight / 2;
    setOffsetY(VIEWPORT_HEIGHT / 2 - stepCenter);
  }, [currentIndex]);

  const statusOf = (index: number): ProgressStatus => {
    if (index < currentIndex) return "done";
    if (index === currentIndex) return "active";
    return "pending";
  };

  // 无效 taskId（渲染期派生）与运行时错误合并为统一错误态展示
  const displayError = !hasValidTask
    ? "缺少有效的任务 ID，请返回重新发起分析"
    : errorMsg;

  return (
    <>
      <Sidebar activeHref="/" />

      <main className="lg:ml-64 flex flex-col items-center min-h-screen justify-center">
        <div className="w-full max-w-200 px-4 flex flex-col py-12">
          {/* 顶部标题（左对齐） */}
          <div className="mb-10">
            <h2 className="text-3xl font-extrabold text-on-surface">
              正在分析「{title}」
            </h2>
            <p className="text-base text-on-surface-variant mt-2">
              系统正在多维度评估该街区的时尚度，请稍候
            </p>
          </div>

          {displayError ? (
            /* 错误态 */
            <div className="flex flex-col items-start gap-4 rounded-2xl border border-error/30 bg-error-container/40 p-6">
              <div className="flex items-center gap-2 text-error">
                <span className="material-symbols-outlined">error</span>
                <span className="font-bold">分析未能完成</span>
              </div>
              <p className="text-sm text-on-surface-variant">{displayError}</p>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity"
              >
                返回重试
              </button>
            </div>
          ) : (
            /* 时间线视口：固定高度 + 上下边缘渐变淡出 */
            <div
              className="relative overflow-hidden"
              style={{
                height: VIEWPORT_HEIGHT,
                maskImage:
                  "linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%)",
              }}
            >
              {/* 滚动轨道：根据当前阶段平移，使 active 项居中 */}
              <div
                ref={trackRef}
                className="flex flex-col absolute left-0 right-0 px-2"
                style={{
                  transform: `translateY(${offsetY}px)`,
                  transition: "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                {STAGES.map((s, i) => (
                  <div
                    key={`${s.stage}-${i}`}
                    ref={(el) => {
                      stepRefs.current[i] = el;
                    }}
                  >
                    <ProgressStep
                      title={s.title}
                      detail={i === currentIndex && activeMessage ? activeMessage : s.detail}
                      status={statusOf(i)}
                      isLast={i === STAGES.length - 1}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <MobileBottomNav activeHref="/" />
    </>
  );
}

export default function AnalysisProgressPage() {
  return (
    <Suspense fallback={<div className="lg:ml-64 min-h-screen" />}>
      <AnalysisProgressInner />
    </Suspense>
  );
}
