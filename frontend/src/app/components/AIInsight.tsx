/** AI 街道画像：渲染后端 summary 文本（按空行/换行分段）。 */
export default function AIInsight({ summary }: { summary: string | null }) {
  const paragraphs = (summary ?? "")
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 mb-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-primary-fixed text-on-primary-fixed rounded-full flex items-center justify-center">
          <span className="material-symbols-outlined">psychology</span>
        </div>
        <h3 className="text-xl font-bold">AI 街道画像</h3>
      </div>
      {paragraphs.length > 0 ? (
        <div className="space-y-4">
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className="text-base text-on-surface-variant leading-relaxed"
            >
              {p}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">
          暂无 AI 画像内容。
        </p>
      )}
    </div>
  );
}
