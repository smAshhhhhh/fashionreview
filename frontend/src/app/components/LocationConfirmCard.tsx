"use client";

import { useEffect, useRef, useState } from "react";
import {
  assetUrl,
  confirmLocation,
  fetchConfirmInfo,
  replaceConfirmImage,
  type ConfirmInfo,
} from "../../lib/api";

/* ──────────────────────────────────────────────
 * 照片地点确认卡（进度页在 status=awaiting_confirm 时渲染）
 *
 * 竖式 3D 翻转卡：
 *   正面 —— 原图 + 识别地点，右下角「不是目标地址？」+ 箭头确认
 *   反面 —— 地点输入框，右下角相机换图 + 箭头提交
 * ────────────────────────────────────────────── */

export default function LocationConfirmCard({
  taskId,
  onConfirmed,
  onImageReplaced,
}: {
  taskId: number;
  /** 确认成功（任务回到 analyzing）后通知父组件重连 SSE */
  onConfirmed: () => void;
  /** 换图已提交，仍是同一个 taskId，父组件据此重连 SSE */
  onImageReplaced: () => void;
}) {
  const [info, setInfo] = useState<ConfirmInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [flipped, setFlipped] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchConfirmInfo(taskId);
        if (cancelled) return;
        setInfo(data);
        const recognized = data.street?.trim() ?? "";
        // 低置信度时不预填：模型本就没认出来，填进去像个可信答案
        setDraft(data.low_confidence ? "" : recognized);
        // 没认出地点时直接翻到输入面，省掉一次必然的点击
        if (data.low_confidence || !recognized) setFlipped(true);
        // 上次改写归一化失败被退回时，说明原因
        if (data.confirm_error) setError(data.confirm_error);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载待确认地点失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  /** 采用 AI 识别结果（override 为空）或用户改写的地点。 */
  const handleConfirm = async (override?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await confirmLocation(taskId, override);
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "确认失败，请重试");
      setBusy(false);
    }
  };

  /** 换图：在同一个 taskId 上重新识别。 */
  const handleReupload = async (file: File) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await replaceConfirmImage(taskId, file);
      onImageReplaced();
    } catch (e) {
      setError(e instanceof Error ? e.message : "重新上传失败，请重试");
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-105 rounded-3xl border border-outline-variant/60 bg-surface-container-lowest p-7">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-40 rounded-full bg-surface-container" />
          <div className="aspect-4/3 w-full rounded-2xl bg-surface-container" />
          <div className="h-6 w-52 rounded-full bg-surface-container" />
        </div>
      </div>
    );
  }

  const recognized = info?.street?.trim() ?? "";
  const subLocation = [info?.city, info?.district].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto w-full max-w-105 perspective-distant">
      <div
        className={`relative w-full transform-3d transition-transform duration-600 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          flipped ? "rotate-y-180" : ""
        }`}
      >
        {/* ──── 正面：识别结果 ──── */}
        <div
          aria-hidden={flipped}
          className="backface-hidden flex w-full flex-col rounded-3xl border border-outline-variant/60 bg-surface-container-lowest p-6 shadow-[0_12px_40px_rgb(0,0,0,0.06)] sm:p-7"
        >
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary-fixed bg-primary-fixed/40 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-container" />
            AI 场景分析已就绪
          </div>
          <h3 className="pt-2 text-xl font-bold tracking-tight text-on-surface">
            确认照片所在地点
          </h3>
          <p className="text-xs leading-relaxed text-on-surface-variant">
            地点决定了后续全部评分
          </p>

          {/* 街景原图 */}
          <div className="group relative mt-5 aspect-4/3 overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container">
            {info?.image_url && (
              /* eslint-disable-next-line @next/next/no-img-element -- 后端静态图，无需 next/image */
              <img
                src={assetUrl(info.image_url)}
                alt="上传的街景照片"
                className="h-full w-full object-cover object-center transition duration-500 group-hover:scale-105"
              />
            )}
            {info?.confidence != null && (
              <span className="absolute bottom-2.5 right-2.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold tabular-nums text-on-surface shadow-sm backdrop-blur-md">
                {(info.confidence * 100).toFixed(0)}% 置信度
              </span>
            )}
          </div>

          {/* 识别地点 */}
          <div className="mt-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary-container">
              识别地标
            </span>
            <h4 className="truncate text-lg font-extrabold leading-snug tracking-tight text-on-surface">
              {recognized || "未能识别出地点"}
            </h4>
            {subLocation && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-on-surface-variant">
                <span className="material-symbols-outlined shrink-0 text-[16px]">
                  location_on
                </span>
                <span className="truncate">{subLocation}</span>
              </p>
            )}
          </div>

          {!flipped && error && (
            <p className="mt-4 text-xs text-error" role="alert">
              {error}
            </p>
          )}

          {/* 底部右下角：改地址 + 确认 */}
          <div className="mt-6 flex items-center justify-end gap-2 border-t border-outline-variant/40 pt-5">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setFlipped(true);
              }}
              disabled={busy}
              className="flex cursor-pointer items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">
                edit_location_alt
              </span>
              不是目标地址？
            </button>
            <button
              type="button"
              onClick={() => handleConfirm()}
              disabled={busy || !recognized}
              aria-label="确认该地点并继续"
              title={
                recognized ? "确认该地点并继续" : "未识别出地点，请改用手动输入"
              }
              className="group flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[24px] transition-transform group-hover:translate-x-0.5">
                {busy ? "progress_activity" : "arrow_forward"}
              </span>
            </button>
          </div>
        </div>

        {/* ──── 反面：手动输入地点 ──── */}
        <div
          aria-hidden={!flipped}
          className="backface-hidden absolute inset-0 flex h-full w-full rotate-y-180 flex-col rounded-3xl border border-outline-variant/60 bg-surface-container-lowest p-6 shadow-[0_12px_40px_rgb(0,0,0,0.06)] sm:p-7"
        >
          <div className="flex items-center gap-2">
            {/* 没认出地点时无正面可回退，不给返回入口 */}
            {recognized && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setFlipped(false);
                }}
                disabled={busy}
                aria-label="返回识别结果"
                title="返回识别结果"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[20px]">
                  arrow_back
                </span>
              </button>
            )}
            <h3 className="text-base font-bold tracking-tight text-on-surface">
              {recognized ? "修改目标地址" : "输入照片所在地点"}
            </h3>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-on-surface-variant">
            {recognized
              ? "可改为街巷或商圈全称，也可以重新上传照片。"
              : "照片里的地点线索不足，请直接输入地点名称，或换一张含街道标识的照片。"}
          </p>

          <div className="mt-5">
            <label
              htmlFor={`confirm-street-${taskId}`}
              className="mb-2 block pl-0.5 text-xs font-semibold text-on-surface"
            >
              街区 / 地标名称
            </label>
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-outline">
                search
              </span>
              <input
                id={`confirm-street-${taskId}`}
                value={draft}
                disabled={busy}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && draft.trim()) handleConfirm(draft);
                }}
                placeholder="如：武康路"
                className="w-full rounded-2xl border border-outline-variant bg-surface-container-low py-3 pl-10 pr-4 text-sm font-medium text-on-surface outline-none transition placeholder:text-outline focus:border-primary-container focus:bg-surface-container-lowest disabled:opacity-60"
              />
            </div>
          </div>

          {flipped && error && (
            <p className="mt-4 text-xs text-error" role="alert">
              {error}
            </p>
          )}

          {/* 底部右下角：重新上传 + 提交 */}
          <div className="mt-auto flex items-center justify-end gap-2 border-t border-outline-variant/40 pt-5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = ""; // 清空以便重选同一文件
                if (file) handleReupload(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              aria-label="重新上传照片"
              title="重新上传照片"
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[22px]">
                photo_camera
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleConfirm(draft)}
              disabled={busy || !draft.trim()}
              aria-label="按此地点继续"
              title="按此地点继续"
              className="group flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[24px] transition-transform group-hover:translate-x-0.5">
                {busy ? "progress_activity" : "arrow_forward"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
