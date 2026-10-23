"use client";

import Link from "next/link";
import { useState } from "react";
import { assetUrl } from "../../lib/api";
import type { SimilarStreet } from "../types";

/** 相似审美节点：历史点评中维度画像最相似的街区，点击打开那条历史结果。 */
export default function SimilarStreets({ items }: { items: SimilarStreet[] }) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
        <h2 className="text-xl font-black text-on-surface">相似审美节点</h2>
        <span className="text-[13px] text-on-surface-variant">
          历史点评中最相似的 {items.length} 个街区
        </span>
      </div>

      <div className="grid grid-cols-2 @[32rem]:grid-cols-3 @[52rem]:grid-cols-5 gap-3">
        {items.map((it) => (
          <Link
            key={it.evaluation_id}
            href={`/analytics?eid=${it.evaluation_id}`}
            className="min-w-0 border border-divider rounded-2xl overflow-hidden bg-surface-container-lowest"
          >
            <div className="relative">
              <StreetThumbnail key={it.image_url} imageUrl={it.image_url} />
              <span className="absolute top-1.5 right-1.5 rounded-md bg-inverse-surface px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-inverse-on-surface">
                {(it.similarity * 100).toFixed(1)}%
              </span>
            </div>
            <div className="p-2.5">
              <p className="text-[13px] font-semibold text-on-surface">
                {it.street}
              </p>
              {it.shared_strengths.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {it.shared_strengths.map((s) => (
                    <span
                      key={s}
                      className="max-w-full rounded-md bg-success-container px-1.5 py-0.5 text-[11px] font-medium text-success"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function StreetThumbnail({ imageUrl }: { imageUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className="grid h-28 place-items-center bg-surface-container-low px-3 text-center text-xs text-on-surface-variant">
        图片无法加载
      </div>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 后端街景图保留固定高度并延迟加载。
    <img
      src={assetUrl(imageUrl)}
      alt=""
      className="h-28 w-full object-cover bg-surface-container-low"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
