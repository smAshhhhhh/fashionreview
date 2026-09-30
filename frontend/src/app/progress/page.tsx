"use client";

import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "../components/Sidebar";
import MobileBottomNav from "../components/MobileBottomNav";
import ProgressStep from "../components/ProgressStep";
import { ACTIVE_TASK_KEY } from "../components/ActiveTaskGuard";
import type { ProgressStage, ProgressStatus, ProgressTone } from "../types";
import {
  cancelTask,
  fetchTaskProgress,
  progressStreamUrl,
  type ScoringDetail,
  type TaskProgress,
} from "../../lib/api";

/* ──── 时间线骨架（progress 阈值对齐后端 progress_service 真实节点）──── */
// 后端进度为计数式并发评分：识别10 → 画像20 → 评分33/46/59/72/85 → 报告95 → 完成100。
//
// 每段写三套标题：节点会在 pending / active / done 下各渲染一次。评分段的标题在
// 运行时被 stage_detail 里的真实维度名改写，这里的「第 N 维度」只是降级兜底
// （老任务、或库还没执行 stage_detail 列迁移时）。
//
// 「第 N 维度」中的 N 是**完成名次**，不是维度编号：5 个维度由 ThreadPoolExecutor
// 全并发、as_completed 谁先回谁先计数，所以第 2 个完成的完全可能是 dim_sort 里的第 5 个。
const SCORING_TOTAL_FALLBACK = 5;

const STAGES: ProgressStage[] = [
  {
    stage: "recognize",
    progress: 10,
    titles: { pending: "识别街巷", active: "正在识别街巷", done: "街巷识别完成" },
    detail: "定位地理坐标与街道轮廓",
  },
  {
    stage: "profile",
    progress: 20,
    titles: { pending: "获取街巷画像", active: "正在获取街巷画像", done: "街巷画像完成" },
    detail: "汇总街区事实数据",
  },
  ...Array.from({ length: SCORING_TOTAL_FALLBACK }, (_, i) => i + 1).map((n) => ({
    stage: "scoring",
    progress: 20 + n * 13,
    titles: {
      pending: `第 ${n} 维度`,
      active: `正在评分 · 第 ${n} 维度`,
      done: `第 ${n} 维度评分完成`,
    },
    detail: "多维度并发评分中",
    rank: n,
  })),
  {
    stage: "report",
    progress: 95,
    titles: { pending: "生成评价报告", active: "正在生成评价报告", done: "评价报告完成" },
    detail: "综合各维度得分撰写画像",
  },
  {
    stage: "done",
    progress: 100,
    titles: { pending: "输出分析结果", active: "正在整理分析结果", done: "分析完成" },
    detail: "正在跳转到分析结果…",
  },
];

const VIEWPORT_HEIGHT = 520; // 时间线可视区高度（px）
const FIRST_SCORING_INDEX = STAGES.findIndex((s) => s.stage === "scoring");
const SCORING_NODE_COUNT = STAGES.filter((s) => s.stage === "scoring").length;

/** 已完成的维度数：优先用后端权威名单，缺失时按 20+N*13 反推。 */
function doneCountOf(detail: ScoringDetail | null, p: number): number {
  if (detail) return Math.min(detail.done.length, SCORING_NODE_COUNT);
  const inferred = Math.floor((p - 20) / 13);
  return Math.min(Math.max(inferred, 0), SCORING_NODE_COUNT);
}

/**
 * 定位「正在进行」的节点。
 *
 * 阶段归属以 current_stage 为准（后端权威），只有评分段内部的推进量取自
 * stage_detail.done.length —— 后端是每完成一个维度才写一帧，所以 done.length
 * 就是已完成数，第 done.length+1 个节点才是在跑的那个。
 *
 * 不再单纯按 progress 阈值反推：那样会把「已完成 3 个」的 59% 错标成第 3 个节点
 * active，于是节点一边转 sync 一边宣布自己已完成，且上方打勾数比文案少一个。
 */
function activeIndexFrom(
  stage: string | null,
  detail: ScoringDetail | null,
  p: number,
): number {
  if (stage === "done") return STAGES.length - 1;
  if (stage === "scoring") {
    const done = doneCountOf(detail, p);
    // 5 个都完成但后端还没写 report 那一帧：让报告节点先亮，避免最后一个
    // 评分节点既显示真实维度名又在转圈
    return Math.min(FIRST_SCORING_INDEX + done, STAGES.length - 1);
  }
  const byStage = STAGES.findIndex((s) => s.stage === stage);
  if (byStage >= 0) return byStage;
  // 首帧前 current_stage 为 null，或后端新增了前端不认识的阶段：退回阈值反推
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

  // 当前「正在进行」的节点（阶段由 current_stage 定位，评分段内部由 stage_detail 推进）
  const [currentIndex, setCurrentIndex] = useState(0);
  // 后端语义阶段，决定阶段归属（progress 阈值只作降级兜底）
  const [stage, setStage] = useState<string | null>(null);
  // 评分阶段的结构化名单：done 按真实完成顺序累加，是维度名与打勾数的唯一权威来源
  const [scoring, setScoring] = useState<ScoringDetail | null>(null);
  // active 段的实时文案（来自 SSE stage_message）
  const [activeMessage, setActiveMessage] = useState<string | null>(null);
  // 错误信息（failed 或网络异常）
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // 取消态：cancelling=已点取消等待后端确认；cancelled=任务已终止
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  // 取消二次确认弹窗
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

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
      const detail = data.stage_detail ?? null;
      setStage(data.current_stage);
      setCurrentIndex(activeIndexFrom(data.current_stage, detail, data.progress));
      // 只在评分阶段接受名单：其余阶段后端不写这一列，若沿用旧值，报告阶段会
      // 把评分名单继续渲染进节点标题
      if (data.current_stage === "scoring") setScoring(detail);
      // 始终跟随本帧：后端某帧不带 message 时清空，避免上一阶段文案残留在新 active 节点上
      setActiveMessage(data.stage_message ?? null);
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
        // 后端在同一条 UPDATE 里写 status=completed 与 current_stage=done，
        // 这里显式兜底把时间线推到末节点，否则跳转前的 800ms 里最后一个节点
        // 仍在转 sync
        setStage("done");
        setCurrentIndex(STAGES.length - 1);
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
      if (data.status === "cancelled") {
        clearActive();
        setCancelled(true);
        setCancelling(false);
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

  const isDone = stage === "done";

  const statusOf = (index: number): ProgressStatus => {
    // 完成态：全部节点收敛为 done（否则最后一段会在跳转前的 800ms 里转着 sync）
    if (isDone) return "done";
    if (index < currentIndex) return "done";
    if (index === currentIndex) return "active";
    return "pending";
  };

  /**
   * 解析一个节点最终渲染的标题、副文案与色调。
   *
   * 评分节点是唯一需要改写的：它的标题在 done 时换成 stage_detail 里第 rank 个
   * 完成的**真实维度名**，这样「已完成」只会出现在真正完成的节点上，且顺序就是
   * 后端的实际完成顺序。active 时仍用「第 N 维度」占位 —— 那一个还没回来，
   * 后端也不知道会是谁先回。
   */
  const resolveNode = (
    s: ProgressStage,
    status: ProgressStatus,
  ): { title: string; detail: string; tone: ProgressTone } => {
    const fallback = {
      title: s.titles[status],
      // 实时文案只贴给它真正描述的那个阶段：评分名单会让 active 先于 current_stage
      // 迈进下一节点，此时无条件覆盖会出现「正在生成评价报告 / 已完成 5/5 维度评分」
      detail:
        status === "active" && activeMessage && s.stage === stage
          ? activeMessage
          : s.detail,
      tone: "normal" as ProgressTone,
    };
    if (s.stage !== "scoring" || s.rank === undefined) return fallback;

    const finished = scoring?.done[s.rank - 1];
    if (status === "done" && finished) {
      return {
        title: finished.name,
        detail: finished.ok ? "评分完成" : "评分失败，已补中位分",
        tone: finished.ok ? "normal" : "warn",
      };
    }
    if (status === "active" && scoring) {
      // 把仍在跑的维度真名列出来（全部维度减去已完成的）。并发中无法预知
      // 下一个回来的是谁，所以标题保持「第 N 维度」占位，真名放副文案。
      const doneNames = new Set(scoring.done.map((d) => d.name));
      const running = scoring.all.filter((n) => !doneNames.has(n));
      if (running.length > 0) {
        return { ...fallback, detail: `并发中：${running.join("、")}` };
      }
    }
    return fallback;
  };

  // 取消分析：二次确认后调后端取消接口（不等结果），直接返回主页。
  // 后端置 cancelled 是即时的；页面已离开，无需在此等待 SSE。
  const handleCancelConfirmed = () => {
    setShowCancelConfirm(false);
    if (!hasValidTask) {
      router.push("/");
      return;
    }
    setCancelling(true);
    try {
      localStorage.removeItem(ACTIVE_TASK_KEY);
    } catch {
      /* storage 不可用，忽略 */
    }
    // 触发取消但不阻塞跳转；失败也不影响用户离开
    cancelTask(taskId).catch(() => {});
    router.push("/");
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
            <div className="flex items-center gap-2">
              <h2 className="text-3xl font-extrabold text-on-surface">
                {cancelled ? `已取消分析「${title}」` : `正在分析「${title}」`}
              </h2>
              {/* 取消入口：仅分析进行中展示，icon 紧跟标题 */}
              {!displayError && !cancelled && hasValidTask && (
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={cancelling}
                  aria-label="取消分析"
                  title="取消分析"
                  className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full text-on-surface-variant hover:bg-surface-container hover:text-error transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[22px]">
                    {cancelling ? "progress_activity" : "close"}
                  </span>
                </button>
              )}
            </div>
            <p className="text-base text-on-surface-variant mt-2">
              {cancelled
                ? "本次分析已停止，你可以重新发起。"
                : "系统正在多维度评估该街区的时尚度，请稍候"}
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
          ) : cancelled ? (
            /* 已取消态 */
            <div className="flex flex-col items-start gap-4 rounded-2xl border border-outline-variant/40 bg-surface-container/40 p-6">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <span className="material-symbols-outlined">cancel</span>
                <span className="font-bold">分析已取消</span>
              </div>
              <p className="text-sm text-on-surface-variant">
                后台任务已停止，未生成评价结果。
              </p>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity"
              >
                重新发起分析
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
                {STAGES.map((s, i) => {
                  const status = statusOf(i);
                  const node = resolveNode(s, status);
                  return (
                    <div
                      key={`${s.stage}-${i}`}
                      ref={(el) => {
                        stepRefs.current[i] = el;
                      }}
                    >
                      <ProgressStep
                        title={node.title}
                        detail={node.detail}
                        status={status}
                        tone={node.tone}
                        isLast={i === STAGES.length - 1}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 取消二次确认弹窗 */}
      {showCancelConfirm && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-surface-container-lowest p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-on-surface">
              <span className="material-symbols-outlined text-error">cancel</span>
              <h3 className="text-lg font-bold">取消本次分析？</h3>
            </div>
            <p className="mt-3 text-sm text-on-surface-variant">
              取消后当前分析将停止，不会生成评价结果。确定要返回首页吗？
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="rounded-full px-5 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                继续分析
              </button>
              <button
                type="button"
                onClick={handleCancelConfirmed}
                className="rounded-full bg-error px-5 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity"
              >
                取消并返回
              </button>
            </div>
          </div>
        </div>
      )}

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
