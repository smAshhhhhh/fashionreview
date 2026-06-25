"use client";

import Image from "next/image";
import Link from "next/link";
import { assetUrl } from "../../lib/api";
import type { HistoryItem } from "../types";

/** 历史记录卡片：点击进入分析中心查看完整结果。 */
export default function HistoryCard({
  record,
  priority = false,
}: {
  record: HistoryItem;
  priority?: boolean;
}) {
  const place =
    [record.city, record.district].filter(Boolean).join(" · ") || "";
  const title = place ? `${place} · ${record.street}` : record.street;
  const date = record.created_at ? record.created_at.slice(0, 10) : "";

  return (
    <Link
      href={`/analytics?eid=${record.evaluation_id}`}
      className="block bg-surface-container-lowest border border-outline-variant rounded-2xl p-4 hover:bg-surface-container-low transition-colors cursor-pointer group"
    >
      <div className="flex gap-4">
        <div className="w-24 h-24 rounded-lg overflow-hidden shrink-0 bg-surface-container">
          {/* 图片发起的点评显示上传原图；文字发起的回退到 no_photo 占位 */}
          <Image
            src={assetUrl(record.image_url)}
            alt={record.street}
            width={96}
            height={96}
            className="w-full h-full object-cover"
            loading={priority ? "eager" : "lazy"}
            unoptimized
          />
        </div>
        <div className="flex flex-col justify-between py-1 grow min-w-0">
          <div>
            <div className="flex justify-between items-start gap-2">
              <h4 className="text-sm font-semibold text-on-surface group-hover:text-primary transition-colors truncate">
                {title}
              </h4>
              {record.total_score !== null && (
                <span className="bg-primary text-white px-2 py-0.5 rounded-full text-xs shrink-0">
                  {record.total_score.toFixed(1)} 分
                </span>
              )}
            </div>
            <p className="text-sm text-on-surface-variant mt-1 line-clamp-2">
              {record.summary || "暂无 AI 画像摘要"}
            </p>
          </div>
          <div className="flex items-center mt-2 text-on-surface-variant">
            <span className="text-xs">{date}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
