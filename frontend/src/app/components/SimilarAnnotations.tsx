"use client";

import { assetUrl } from "../../lib/api";
import type { SimilarAnnotation } from "../types";

/**
 * 相似审美节点：展示本次照片在人工标注库中最相似的若干张标注图。
 *
 * 数据来自 evaluation_image_match.candidates（Top-N 留痕），后端已按
 * annotation_similar_min_similarity（默认 0.5）过滤 —— 那是**展示下限**，
 * 与匹配判定无关：Top-1 赋属性始终不设阈值。故此处可能只有 1 张，也可能为空。
 *
 * 首张即 Top-1，也就是本次点评图片属性的来源，单独标注出来。
 */
export default function SimilarAnnotations({
  items,
}: {
  items: SimilarAnnotation[];
}) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline gap-3 mb-3">
        <h3 className="text-sm font-bold text-[#536471] uppercase tracking-widest">
          相似审美节点
        </h3>
        <span className="text-[13px] text-[#536471]">
          人工标注库中最相似的 {items.length} 张街景
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {items.map((it, idx) => (
          <figure
            key={it.annotation_id}
            className="border border-[#eff3f4] rounded-2xl overflow-hidden bg-white"
          >
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- 后端静态图，无需 next/image 优化 */}
              <img
                src={assetUrl(it.image_url)}
                alt={`相似标注图 ${it.file_name}`}
                className="w-full h-28 object-cover bg-surface-container-low"
                loading="lazy"
              />
              {/* 相似度角标：结果页唯一能看到匹配得有多像的地方 */}
              <span className="absolute top-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
                {(it.similarity * 100).toFixed(1)}%
              </span>
              {idx === 0 && (
                <span className="absolute top-1.5 left-1.5 rounded-md bg-primary-container px-1.5 py-0.5 text-[11px] font-bold text-white">
                  属性来源
                </span>
              )}
            </div>
            <figcaption className="p-2.5">
              <div className="flex flex-wrap gap-1">
                {it.attributes.slice(0, 3).map((a, i) => (
                  <span
                    key={`${a.metric_name}-${a.grade_word}-${i}`}
                    className="rounded-md bg-[#e8f5e9] px-1.5 py-0.5 text-[11px] font-medium text-[#1b5e20]"
                    title={
                      a.metric_name
                        ? `${a.metric_name}：${a.grade_word ?? ""}`
                        : undefined
                    }
                  >
                    {a.grade_word}
                  </span>
                ))}
                {it.attributes.length > 3 && (
                  <span className="text-[11px] text-[#536471] self-center">
                    +{it.attributes.length - 3}
                  </span>
                )}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
