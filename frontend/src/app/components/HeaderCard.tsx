"use client";

import Image from "next/image";
import { useState } from "react";
import { assetUrl } from "../../lib/api";

/**
 * 顶部街道概览（完全对齐 mock「Street Overview」段）：
 * 左侧标签 + 街道名（大号 black），右侧综合时尚指数（5 分制）。
 * mock 的城市/区/日期/ID 因后端 payload 无对应字段，未渲染。
 */
export default function HeaderCard({
  streetName,
  totalScore,
  imageUrl,
  showScore = true,
}: {
  streetName: string;
  totalScore: number | null;
  /** 上传原图相对路径；为空时显示图标占位 */
  imageUrl?: string | null;
  /** 是否展示综合分（受分析管理配置控制） */
  showScore?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <section className="flex flex-col @[40rem]:flex-row justify-between items-start gap-6 pb-6 border-b border-divider">
      <div className="flex flex-1 items-center gap-3 sm:gap-5 min-w-0">
        {imageUrl && (
          <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 border border-divider bg-divider">
            {failedUrl === imageUrl ? <span className="grid h-full place-items-center text-xs text-on-surface-variant">图片无法加载</span> : <Image
              src={assetUrl(imageUrl)}
              alt={streetName}
              width={96}
              height={96}
              className="w-full h-full object-cover"
              unoptimized
              onError={() => setFailedUrl(imageUrl)}
            />}
          </div>
        )}
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span aria-hidden="true" className="material-symbols-outlined text-primary text-[16px] shrink-0">
              location_on
            </span>
            <span className="font-bold text-primary">AI 街巷时尚度评价</span>
          </div>
          <h1 className="text-[31px] leading-tight font-black text-brand tracking-tight wrap-break-word">
            {streetName.trim() || "未命名街巷"}
          </h1>
        </div>
      </div>

      {showScore && (
        <div className="max-w-full shrink-0 text-left @[40rem]:text-right">
          <div className="text-sm font-medium text-on-surface-variant mb-1">
            综合时尚指数 (Fashion Score)
          </div>
          <div className="flex items-baseline gap-1 @[40rem]:justify-end">
            <span className="text-[48px] leading-none font-black tabular-nums text-primary">
              {totalScore !== null ? totalScore.toFixed(1) : "—"}
            </span>
            <span className="text-lg font-bold text-on-surface-variant">/ 5</span>
          </div>
        </div>
      )}
    </section>
  );
}
