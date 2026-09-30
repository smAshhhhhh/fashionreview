import type { ProgressStatus, ProgressTone } from "../types";

interface ProgressStepProps {
  title: string;
  detail: string;
  status: ProgressStatus;
  /**
   * done 节点的色调。warn = 完成了但结果需注意（维度评分失败、已兜底中位分）。
   * 用琥珀 tertiary 而非红 error：该维度确实产出了分数，只是兜底值，不是流程失败。
   * 仅对 done 生效 —— 状态机保持三态，不因此变成四态。
   */
  tone?: ProgressTone;
  /** 是否最后一项（不画连接线） */
  isLast?: boolean;
}

/** 单个进度时间线节点：已完成 / 进行中 / 待处理 三态。 */
export default function ProgressStep({
  title,
  detail,
  status,
  tone = "normal",
  isLast = false,
}: ProgressStepProps) {
  const isActive = status === "active";
  const isPending = status === "pending";
  const isWarn = status === "done" && tone === "warn";

  return (
    <div
      className={`flex gap-4 relative ${isLast ? "" : "pb-6"} ${
        isPending ? "opacity-40" : ""
      }`}
    >
      {/* 连接线 */}
      {!isLast && (
        <span className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-surface-container-highest z-0" />
      )}

      {/* 节点图标 */}
      {status === "done" && (
        <div
          className={`z-10 mt-1 shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            isWarn ? "bg-tertiary/10 text-tertiary" : "bg-primary/10 text-primary"
          }`}
        >
          <span
            className="material-symbols-outlined text-[20px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {isWarn ? "error" : "check_circle"}
          </span>
        </div>
      )}
      {isActive && (
        <div className="z-10 -ml-1 shrink-0 w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center active-pulse shadow-lg">
          <span className="material-symbols-outlined text-[24px] animate-spin">
            sync
          </span>
        </div>
      )}
      {isPending && (
        <div className="z-10 mt-1 shrink-0 w-8 h-8 rounded-full border-2 border-outline-variant bg-surface-container-lowest flex items-center justify-center">
          <span className="material-symbols-outlined text-[18px] text-outline-variant">
            hourglass_empty
          </span>
        </div>
      )}

      {/* 文案 */}
      <div className={`flex flex-col ${isActive ? "pt-0" : "pt-1"}`}>
        {isActive ? (
          <>
            <span className="text-xl font-bold text-primary">{title}</span>
            <span className="text-on-surface text-base mt-1">{detail}</span>
          </>
        ) : (
          <>
            <span
              className={`text-sm font-bold ${
                isWarn
                  ? "text-tertiary"
                  : status === "done"
                    ? "text-on-surface-variant/80"
                    : ""
              }`}
            >
              {title}
            </span>
            <span
              className={`text-xs ${
                isWarn
                  ? "text-tertiary/80"
                  : status === "done"
                    ? "text-on-surface-variant/60"
                    : "text-on-surface-variant"
              }`}
            >
              {detail}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
