"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { assetUrl } from "../../lib/api";
import type { HistoryItem } from "../types";

/** 历史记录卡片：普通模式点击进结果页；多选模式点击切换选中。 */
export default function HistoryCard({
  record,
  priority = false,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  record: HistoryItem;
  priority?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (evaluationId: number) => void;
}) {
  const place =
    [record.city, record.district].filter(Boolean).join(" · ") || "";
  const title = place ? `${place} · ${record.street}` : record.street;
  const date = record.created_at ? record.created_at.slice(0, 10) : "";
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const source = assetUrl(record.image_url);
  const score = record.total_score !== null && (
    <span className="bg-primary text-white px-2 py-0.5 rounded-full text-xs tabular-nums shrink-0">
      {record.total_score.toFixed(1)} 分
    </span>
  );

  const inner = (
    <div className="flex min-w-0 gap-4">
      <div className="relative min-h-20 w-20 shrink-0 self-stretch overflow-hidden rounded-lg bg-surface-container sm:min-h-24 sm:w-24">
        {/* 图片点评显示上传原图；文字点评显示街道封面，没有则回退 no_photo 占位 */}
        {failedUrl === source ? <span aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-on-surface-variant"><span className="material-symbols-outlined text-2xl">broken_image</span>图片无法加载</span> : <Image
          src={source}
          alt=""
          width={96}
          height={96}
          className="absolute inset-0 w-full h-full object-cover"
          loading={priority ? "eager" : "lazy"}
          unoptimized
          onError={() => setFailedUrl(source)}
        />}
      </div>
      <div className="flex min-h-20 min-w-0 grow flex-col gap-2 sm:min-h-24">
        <div>
          <div className="flex justify-between items-start gap-2">
            <h3
              title={title}
              className="min-w-0 flex-1 text-balance text-base font-semibold leading-snug text-on-surface transition-colors group-hover:text-primary line-clamp-2 [overflow-wrap:anywhere]"
            >
              <bdi>{record.street.trim() || "未命名街巷"}</bdi>
            </h3>
            {score}
          </div>
          {(place || date) && (
            <div className="mt-1 flex items-center gap-2 text-xs text-on-surface-variant">
              {place && <p title={place} className="min-w-0 truncate">{place}</p>}
              {date && <time dateTime={date} className="shrink-0 tabular-nums">{date}</time>}
            </div>
          )}
        </div>
        <p className="mt-auto h-10 shrink-0 text-sm leading-5 text-on-surface-variant line-clamp-2 [overflow-wrap:anywhere]">
          {record.summary || "暂无 AI 画像摘要"}
        </p>
      </div>
    </div>
  );

  // 多选模式：整卡是一个切换选中的按钮，选中态用外边框高亮，不跳转
  if (selectMode) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`选择记录：${title || "未命名街巷"}${date ? `，${date}` : ""}`}
        onClick={() => onToggleSelect?.(record.evaluation_id)}
        className={`relative block w-full min-w-0 cursor-pointer rounded-2xl border p-4 text-left transition-colors group ${
          selected
            ? "bg-primary/5 border-primary"
            : "bg-surface-container-lowest border-divider hover:bg-surface-container-low"
        }`}
      >
        <span aria-hidden="true" className={`absolute left-2 top-2 grid h-5 w-5 place-items-center rounded-full border ${selected ? "border-primary bg-primary text-on-primary" : "border-outline bg-surface-container-lowest text-on-surface"}`}><span className="material-symbols-outlined text-base">{selected ? "check" : ""}</span></span>
        {inner}
      </button>
    );
  }

  return (
    <Link
      href={`/analytics?eid=${record.evaluation_id}`}
      className="relative block w-full min-w-0 bg-surface-container-lowest border border-divider rounded-2xl p-4 hover:bg-surface-container-low transition-colors cursor-pointer group"
    >
      {inner}
    </Link>
  );
}
