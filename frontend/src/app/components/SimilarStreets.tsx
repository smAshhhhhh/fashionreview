import Link from "next/link";
import { assetUrl } from "../../lib/api";
import type { SimilarStreet } from "../types";

/** 相似审美节点：历史点评中维度画像最相似的街区，点击打开那条历史结果。 */
export default function SimilarStreets({ items }: { items: SimilarStreet[] }) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline gap-3 mb-3">
        <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest">
          相似审美节点
        </h3>
        <span className="text-[13px] text-on-surface-variant">
          历史点评中最相似的 {items.length} 个街区
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {items.map((it) => (
          <Link
            key={it.evaluation_id}
            href={`/analytics?eid=${it.evaluation_id}`}
            className="border border-divider rounded-2xl overflow-hidden bg-surface-container-lowest"
          >
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- 后端静态图，无需 next/image 优化 */}
              <img
                src={assetUrl(it.image_url)}
                alt={it.street}
                className="w-full h-28 object-cover bg-surface-container-low"
                loading="lazy"
              />
              <span className="absolute top-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
                {(it.similarity * 100).toFixed(1)}%
              </span>
            </div>
            <div className="p-2.5">
              <p className="truncate text-[13px] font-semibold text-on-surface">
                {it.street}
              </p>
              {it.shared_strengths.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {it.shared_strengths.map((s) => (
                    <span
                      key={s}
                      className="rounded-md bg-success-container px-1.5 py-0.5 text-[11px] font-medium text-success"
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
