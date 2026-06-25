"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchTaskProgress } from "../../lib/api";

/** localStorage 中记录「当前活跃任务」的键。提交时写入，任务终态时清除。 */
export const ACTIVE_TASK_KEY = "activeTaskId";

/** localStorage 中记录「最近一次评价结果 id」的键。
 *  分析中心无 eid 进入时回退展示它；发起新任务时清除。 */
export const LAST_EVAL_KEY = "lastEvaluationId";

/** 安全读取 activeTaskId（隐身模式/禁用 storage 时降级为 null）。 */
function readActiveTaskId(): number | null {
  try {
    const raw = localStorage.getItem(ACTIVE_TASK_KEY);
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

/** 安全清除 activeTaskId（失败静默）。 */
function clearActiveTaskId(): void {
  try {
    localStorage.removeItem(ACTIVE_TASK_KEY);
  } catch {
    /* storage 不可用，忽略 */
  }
}

/**
 * 首页入口守卫：进入首页时检查是否有未完成的分析任务。
 *
 * 读 localStorage.activeTaskId → 以后端真实状态为准：
 *   - 仍在跑（pending/analyzing）→ 跳进度页 /progress 继续显示进度条
 *   - 已 completed / failed       → 清账放行
 *   - 查询失败 / 任务不存在        → 清账放行（脏数据自愈）
 *   - 无活跃任务                   → 直接放行
 *
 * 任务进行中首页被进度页占据，用户无法发起第二个点评；
 * 分析中心 / 历史记录 / 资源中心不受此守卫影响，可自由浏览。
 *
 * 判断期间渲染极简占位，避免静态内容先闪现再跳转。
 */
export default function ActiveTaskGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  // 初值在 SSR / CSR 两端都确定为 checking，避免 hydration 不匹配；
  // localStorage 是浏览器专属 API，只能在 effect（仅客户端）里读取。
  const [phase, setPhase] = useState<"checking" | "redirecting" | "ready">(
    "checking",
  );

  useEffect(() => {
    let cancelled = false;
    const taskId = readActiveTaskId();
    if (taskId === null) {
      // 无活跃任务：与外部系统（localStorage）同步的合法 effect setState。
      // localStorage 无法在渲染期读取，故不能改为渲染期派生值。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("ready");
      return;
    }

    (async () => {
      try {
        const snap = await fetchTaskProgress(taskId);
        if (cancelled) return;
        if (snap.status === "pending" || snap.status === "analyzing") {
          // 仍在跑：回到进度页，replace 不留历史栈
          setPhase("redirecting");
          router.replace(`/progress?taskId=${taskId}`);
          return;
        }
        // completed / failed：任务已结束，清账放行
        clearActiveTaskId();
        setPhase("ready");
      } catch {
        // 查询失败 / 任务不存在：清掉失效记录，避免永久拦截
        if (cancelled) return;
        clearActiveTaskId();
        setPhase("ready");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (phase !== "ready") {
    return (
      <main className="lg:ml-64 flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-3xl">
            progress_activity
          </span>
          <p className="text-sm">
            {phase === "redirecting" ? "检测到进行中的分析，正在跳转…" : "加载中…"}
          </p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
