import Image from "next/image";
import { assetUrl } from "../../lib/api";

/** 结果页头部：街道名 + 综合分（5 分制）。 */
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
  /** 是否展示右上角综合分（受分析管理配置控制） */
  showScore?: boolean;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant overflow-hidden mb-4 relative">
      {/* Score Badge */}
      {showScore && (
        <div className="absolute top-0 right-0 p-4">
          <div className="flex flex-col items-end">
            <div className="flex items-baseline gap-1">
              <span className="text-primary font-black text-6xl leading-none">
                {totalScore !== null ? totalScore.toFixed(1) : "—"}
              </span>
              <span className="text-on-surface-variant text-lg font-semibold">
                / 5
              </span>
            </div>
            <span className="text-xs text-on-surface-variant mt-1 uppercase tracking-widest">
              时尚评分
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-6 flex items-center gap-6">
        <div className="w-32 h-32 rounded-2xl overflow-hidden shrink-0 border border-outline-variant bg-surface-container flex items-center justify-center text-primary">
          {imageUrl ? (
            // 用户上传的街景原图（图片发起的点评）
            <Image
              src={assetUrl(imageUrl)}
              alt={streetName}
              width={128}
              height={128}
              className="w-full h-full object-cover"
              unoptimized
            />
          ) : (
            // 文字发起的点评无原图，图标占位
            <span className="material-symbols-outlined text-5xl">
              location_city
            </span>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-primary text-sm">
              location_on
            </span>
            <span className="text-sm font-semibold text-primary">
              AI 街巷时尚度评价
            </span>
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight mb-1">
            {streetName}
          </h2>
        </div>
      </div>
    </div>
  );
}
