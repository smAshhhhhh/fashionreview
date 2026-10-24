"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  confirmStreetType,
  TaskActionError,
  fetchTypeInfo,
  type TypeInfo,
} from "../../lib/api";

/* ──────────────────────────────────────────────
 * 街区类型选择卡（进度页在 status=awaiting_type 时渲染）
 *
 * AI 已给出 7 种类型的匹配度，按匹配度降序列出，默认选中最高项；
 * 最终类型由用户决定，评分使用所选类型下启用的指标模板。
 * 类型定义通过名称旁的信息按钮悬浮查看。
 * ────────────────────────────────────────────── */

const percent = (value: number) => `${Math.round(value * 100)}%`;

export default function StreetTypeSelectCard({
  taskId,
  onConfirmed,
}: {
  taskId: number;
  /** 确认成功（或已被另一次提交确认）后通知父组件重连 SSE */
  onConfirmed: () => void;
}) {
  const [info, setInfo] = useState<TypeInfo | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchTypeInfo(taskId);
        if (cancelled) return;
        setInfo(data);
        setSelectedId(data.recommended_type_id ?? null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载街区类型失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const handleConfirm = async () => {
    if (busy || selectedId == null) return;
    setBusy(true);
    setError(null);
    try {
      await confirmStreetType(taskId, selectedId);
      onConfirmed();
    } catch (e) {
      if (e instanceof TaskActionError && e.status === 409) {
        // 另一次提交已推进了任务（或任务已结束）：切回时间线以后端状态为准
        setNotice("该任务已在继续分析");
        onConfirmed();
        return;
      }
      setError(e instanceof Error ? e.message : "确认失败，请重试");
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-105 rounded-3xl border border-divider bg-surface-container-lowest p-7">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-40 rounded-full bg-surface-container" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 w-full rounded-2xl bg-surface-container" />
          ))}
        </div>
      </div>
    );
  }

  const location = [info?.city, info?.district].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto flex w-full max-w-105 flex-col rounded-3xl border border-divider bg-surface-container-lowest p-6 shadow-[0_12px_40px_rgb(0,0,0,0.06)] sm:p-7">
      <h3 className="pt-2 text-xl font-bold tracking-tight text-on-surface">
        选择街区类型
      </h3>
      <p className="text-xs leading-relaxed text-on-surface-variant">
        {info?.street ? `「${info.street}」` : "该地点"}
        {location && `（${location}）`}
        将按所选类型的维度权重评分
      </p>

      {info && !info.has_candidates && (
        <p className="mt-4 rounded-2xl bg-surface-container-low px-4 py-3 text-xs text-on-surface-variant">
          AI 未能给出判断，请手动选择
        </p>
      )}

      <fieldset className="mt-5 min-w-0" disabled={busy}>
        <legend className="sr-only">街区类型</legend>
        {/* 不设内部滚动：滚动容器会裁掉类型定义的悬浮提示 */}
        <div className="space-y-2">
          {info?.types.map((t) => {
            const checked = t.id === selectedId;
            const inputId = `street-type-${taskId}-${t.id}`;
            return (
              <div
                key={t.id}
                className={`relative rounded-2xl border px-3 py-2 transition-colors has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-brand ${
                  checked
                    ? "border-primary bg-primary/5"
                    : "border-divider hover:bg-surface-container-low"
                }`}
              >
                {/* 单选框视觉隐藏：整张卡片即点选区域，选中态由描边与底色表达；
                    键盘与读屏仍按单选组操作 */}
                <input
                  id={inputId}
                  type="radio"
                  name={`street-type-${taskId}`}
                  value={t.id}
                  checked={checked}
                  onChange={() => setSelectedId(t.id)}
                  aria-labelledby={`${inputId}-name`}
                  aria-describedby={t.reason ? `${inputId}-reason` : undefined}
                  className="sr-only"
                />
                <label
                  htmlFor={inputId}
                  className="absolute inset-0 cursor-pointer rounded-2xl"
                />
                {/* 内容让点击穿透到上面的 label，信息按钮单独接收悬浮与聚焦 */}
                <div className="pointer-events-none relative flex items-stretch gap-3">
                  <div className="relative aspect-square w-14 shrink-0 self-stretch">
                    <Image
                      src={`/images/street-types/${t.code}.svg`}
                      alt=""
                      fill
                      sizes="56px"
                      className="object-contain"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-center">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                      <span
                        id={`${inputId}-name`}
                        className="text-sm font-bold text-on-surface"
                      >
                        {t.name}
                      </span>
                      {t.description && (
                        <span className="group pointer-events-auto relative inline-flex shrink-0">
                          {/* 不设固定尺寸：图标与名称文字同高，不撑高行 */}
                          <button
                            type="button"
                            aria-label={`查看「${t.name}」的类型定义`}
                            aria-describedby={`${inputId}-desc`}
                            className="inline-flex items-center leading-none text-on-surface-variant transition-colors hover:text-primary focus-visible:text-primary"
                          >
                            <span
                              aria-hidden="true"
                              className="material-symbols-outlined text-[16px] leading-none"
                            >
                              info
                            </span>
                          </button>
                          <span
                            id={`${inputId}-desc`}
                            role="tooltip"
                            className="pointer-events-none invisible absolute left-0 top-full z-10 mt-1 w-72 max-w-[calc(100vw-4rem)] rounded-lg bg-inverse-surface px-3 py-2 text-xs leading-relaxed text-inverse-on-surface opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                          >
                            {t.description}
                          </span>
                        </span>
                      )}
                      </div>
                      {t.match_score != null && (
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-on-surface-variant">
                          {percent(t.match_score)} 匹配度
                        </span>
                      )}
                    </div>
                    {t.reason && (
                      /* 单行省略，悬浮看全文。用 label 而非 p：它需要接收悬浮才能显示 title，
                         同时点击仍能选中该类型 */
                      <label
                        id={`${inputId}-reason`}
                        htmlFor={inputId}
                        title={t.reason}
                        className="pointer-events-auto mt-1 block cursor-pointer truncate text-xs leading-snug text-on-surface-variant"
                      >
                        {t.reason}
                      </label>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>

      {error && (
        <p className="mt-4 text-xs text-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 text-xs text-on-surface-variant" role="status">
          {notice}
        </p>
      )}

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-divider pt-5">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy || selectedId == null}
          aria-label="按所选类型继续评分"
          title={selectedId == null ? "请先选择街区类型" : "按所选类型继续评分"}
          className="group flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-on-primary shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[24px] transition-transform group-hover:translate-x-0.5">
            {busy ? "progress_activity" : "arrow_forward"}
          </span>
        </button>
      </div>
    </div>
  );
}
