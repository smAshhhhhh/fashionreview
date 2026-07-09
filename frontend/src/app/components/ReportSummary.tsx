/**
 * AI 综合评价（完全对齐 mock 右栏「综合评价」）：综合画像段 + 优势/短板/建议三色边栏。
 *
 * 后端 render_report_summary 的入库格式（\n 连接）：
 *   {综合画像段}
 *   【优势】优势1；优势2
 *   【短板】短板1；短板2
 *   【建议】建议1；建议2
 * 无标记（旧记录 / 纯文本）时整体作为综合画像段落。
 */

interface ParsedSummary {
  overview: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

const MARKERS = [
  { key: "strengths", tag: "【优势】" },
  { key: "weaknesses", tag: "【短板】" },
  { key: "suggestions", tag: "【建议】" },
] as const;

function splitItems(text: string): string[] {
  return text
    .split(/[；;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSummary(summary: string): ParsedSummary {
  const result: ParsedSummary = {
    overview: "",
    strengths: [],
    weaknesses: [],
    suggestions: [],
  };
  const overviewLines: string[] = [];

  for (const rawLine of summary.split(/\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const marker = MARKERS.find((m) => line.startsWith(m.tag));
    if (marker) {
      result[marker.key] = splitItems(line.slice(marker.tag.length));
    } else {
      overviewLines.push(line);
    }
  }
  result.overview = overviewLines.join("\n");
  return result;
}

/** 三色边栏：优势蓝(#1d9bf0)/短板红(#f4212e)/建议灰(#536471)，对齐 mock。 */
const SECTIONS = [
  {
    key: "strengths",
    label: "优势",
    en: "Advantages",
    border: "border-primary-container",
    text: "text-primary-container",
  },
  {
    key: "weaknesses",
    label: "短板",
    en: "Weakness",
    border: "border-[#f4212e]",
    text: "text-[#f4212e]",
  },
  {
    key: "suggestions",
    label: "建议",
    en: "Suggestions",
    border: "border-[#536471]",
    text: "text-[#536471]",
  },
] as const;

export default function ReportSummary({ summary }: { summary: string | null }) {
  const parsed = parseSummary(summary ?? "");
  const hasSections =
    parsed.strengths.length > 0 ||
    parsed.weaknesses.length > 0 ||
    parsed.suggestions.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-black text-[#0f1419] mb-3">综合评价</h3>
        {parsed.overview ? (
          <p className="text-[17px] leading-relaxed text-[#0f1419] whitespace-pre-line">
            {parsed.overview}
          </p>
        ) : (
          !hasSections && (
            <p className="text-base text-[#536471]">暂无 AI 画像内容。</p>
          )
        )}
      </div>

      {hasSections && (
        <div className="space-y-5">
          {SECTIONS.map((sec) => {
            const items = parsed[sec.key];
            if (items.length === 0) return null;
            return (
              <div key={sec.key} className={`border-l-2 ${sec.border} pl-4 py-1`}>
                <span
                  className={`block font-bold text-[15px] uppercase tracking-wider mb-1 ${sec.text}`}
                >
                  {sec.en} / {sec.label}
                </span>
                <p className="text-[15px] text-[#0f1419] leading-relaxed">
                  {items.join("；")}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
