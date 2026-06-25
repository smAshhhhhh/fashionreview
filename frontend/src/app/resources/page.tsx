import Link from "next/link";
import Sidebar from "../components/Sidebar";
import MobileBottomNav from "../components/MobileBottomNav";

/* ──────────────────────────────────────────────
 * 资源管理页 /resources
 * 仅实现页面主体内容；左侧菜单与底部导航复用现有组件。
 * 自定义 spacing/fontSize token 已翻译为标准 Tailwind 值，
 * 颜色沿用 globals.css 中已定义的主题 token。
 * ────────────────────────────────────────────── */

/* 卡片通用外观（替代源 HTML 的 pro-card-shadow） */
const cardBase =
  "bg-white border border-outline-variant/30 rounded-xl shadow-sm hover:shadow-lg hover:border-outline-variant/50 transition-all cursor-pointer";

export default function ResourcesPage() {
  return (
    <>
      <Sidebar activeHref="/resources" />

      <main className="lg:ml-64 min-h-screen pt-16 lg:pt-0 pb-24 lg:pb-12">
        {/* ──── 顶部工作台头部 ──── */}
        <div className="sticky top-0 z-30 bg-white/70 backdrop-blur-md border-b border-outline-variant/20 px-3 lg:px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <h2 className="text-[23px] leading-7 font-bold tracking-tight text-on-surface">
                工作台中心
              </h2>
              <p className="text-[15px] text-on-surface-variant mt-1">
                管理大规模资源档案、AI训练任务及多维评分规则体系。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <StatusPill
                icon="cloud_sync"
                iconClass="bg-primary/10 text-primary"
                label="资源同步状态"
                value="良好 (Healthy)"
                valueClass="text-green-600"
              />
              <StatusPill
                icon="bolt"
                iconFill
                iconClass="bg-tertiary/10 text-tertiary"
                label="计算节点"
                value="14/16 活跃 (Active)"
                valueClass="text-on-surface"
              />
            </div>
          </div>
        </div>

        <div className="px-3 lg:px-6 py-10 space-y-20">
          {/* ──── 资源中心 ──── */}
          <Section accent="bg-primary" title="资源中心" subtitle="Resource Center">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {/* 分析管理 */}
              <Link href="/resources/analysis" className={`${cardBase} group p-5 min-h-45 block`}>
                <div className="flex justify-between items-start mb-3">
                  <IconBadge icon="tune" tone="primary" />
                  <span className="text-[10px] bg-green-100/40 text-green-700 px-2 py-1 rounded font-black tracking-wide">
                    STABLE
                  </span>
                </div>
                <h4 className="text-[15px] font-semibold mb-1">分析管理</h4>
                <p className="text-[13px] text-on-surface-variant mb-6 leading-relaxed">
                  管控分析中心展示的内容区块
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-on-surface-variant/60 uppercase">展示区块</span>
                    <span className="tabular-nums tracking-tight">9 区块</span>
                  </div>
                  <div className="w-full bg-surface-container rounded-full h-1">
                    <div className="bg-primary h-1 rounded-full w-[85%]" />
                  </div>
                </div>
              </Link>

              {/* 指标体系 */}
              <Link href="/resources/metrics" className={`${cardBase} group p-5 min-h-45 block`}>
                <div className="flex justify-between items-start mb-3">
                  <IconBadge icon="account_tree" tone="secondary" />
                  <span className="text-[10px] bg-green-100/40 text-green-700 px-2 py-1 rounded font-black tracking-wide">
                    ACTIVE
                  </span>
                </div>
                <h4 className="text-[15px] font-semibold mb-1">指标体系</h4>
                <p className="text-[13px] text-on-surface-variant mb-6 leading-relaxed">
                  多维时尚度评价架构 · 模板版本管理
                </p>
                <div className="flex items-end gap-1">
                  <span className="text-2xl font-black tabular-nums tracking-tight">5</span>
                  <span className="text-[10px] text-on-surface-variant font-bold mb-1">
                    一级维度
                  </span>
                </div>
              </Link>

              {/* POI管理 */}
              <div className={`${cardBase} group p-5 min-h-45`}>
                <div className="flex justify-between items-start mb-3">
                  <IconBadge icon="location_on" tone="tertiary" />
                </div>
                <h4 className="text-[15px] font-semibold mb-1">POI管理</h4>
                <p className="text-[13px] text-on-surface-variant mb-6 leading-relaxed">
                  全球时尚地标与商业网点
                </p>
                <div className="flex items-center gap-1">
                  <div className="flex -space-x-2">
                    <div className="w-6 h-6 rounded-full border-2 border-white bg-blue-400" />
                    <div className="w-6 h-6 rounded-full border-2 border-white bg-indigo-400" />
                  </div>
                  <span className="tabular-nums tracking-tight text-xs font-bold text-on-surface-variant ml-2">
                    42.5k 节点
                  </span>
                </div>
              </div>

              {/* 知识库管理 */}
              <div className={`${cardBase} group p-5 min-h-45`}>
                <div className="flex justify-between items-start mb-3">
                  <IconBadge icon="database" tone="primary" />
                </div>
                <h4 className="text-[15px] font-semibold mb-1">知识库管理</h4>
                <p className="text-[13px] text-on-surface-variant mb-6 leading-relaxed">
                  RAG 增强索引架构
                </p>
                <div className="bg-surface-container/30 rounded p-2">
                  <div className="flex justify-between items-center text-[10px] font-bold text-primary mb-1">
                    <span>CACHE LOAD</span>
                    <span>1.2GB</span>
                  </div>
                  <div className="flex gap-0.5">
                    {[20, 40, 60, 80, 100].map((o) => (
                      <div
                        key={o}
                        className="h-1.5 w-full bg-primary rounded-sm"
                        style={{ opacity: o / 100 }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* 向量库管理 */}
              <div className={`${cardBase} group p-5 min-h-45`}>
                <div className="flex justify-between items-start mb-3">
                  <IconBadge icon="hub" tone="secondary" />
                </div>
                <h4 className="text-[15px] font-semibold mb-1">向量库管理</h4>
                <p className="text-[13px] text-on-surface-variant mb-6 leading-relaxed">
                  Milvus 引擎高性能检索
                </p>
                <div className="flex justify-between items-center">
                  <span className="tabular-nums tracking-tight text-xl font-black">
                    12
                    <span className="text-xs font-medium opacity-50 ml-0.5">ms</span>
                  </span>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-green-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    FAST
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* ──── AI中心 ──── */}
          <Section
            accent="bg-tertiary"
            title="AI中心"
            subtitle="Intelligence Operations"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* AI任务 */}
              <div className={`${cardBase} group p-5 min-h-45 overflow-hidden relative`}>
                <div className="absolute top-0 right-0 p-4 opacity-10 scale-150">
                  <span className="material-symbols-outlined text-[64px]">
                    dynamic_form
                  </span>
                </div>
                <div className="relative z-10">
                  <IconBadge icon="dynamic_form" tone="primary" className="mb-3" />
                  <h4 className="text-[15px] font-semibold mb-1">AI任务</h4>
                  <p className="text-[13px] text-on-surface-variant mb-3">
                    视觉识别与预测监控系统
                  </p>
                  <div className="flex items-center justify-between pt-3 border-t border-outline-variant/30">
                    <span className="text-[11px] font-bold text-primary px-2 py-0.5 bg-primary/5 rounded uppercase">
                      Running
                    </span>
                    <span className="tabular-nums tracking-tight text-xs font-bold">
                      98.2% ACC
                    </span>
                  </div>
                </div>
              </div>

              {/* RAG调试 */}
              <div className={`${cardBase} group p-5 min-h-45`}>
                <IconBadge icon="bug_report" tone="tertiary" className="mb-3" />
                <h4 className="text-[15px] font-semibold mb-1">RAG调试</h4>
                <p className="text-[13px] text-on-surface-variant mb-3">
                  语义检索链路性能优化
                </p>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase">
                    Sandbox Mode
                  </span>
                </div>
              </div>

              {/* Prompt管理 */}
              <Link href="/resources/prompts" className={`${cardBase} group p-5 min-h-45 block`}>
                <IconBadge icon="terminal" tone="secondary" className="mb-3" />
                <h4 className="text-[15px] font-semibold mb-1">Prompt管理</h4>
                <p className="text-[13px] text-on-surface-variant mb-3">
                  自动报告生产模版库
                </p>
                <div className="flex items-center justify-end">
                  <span className="text-[10px] font-bold bg-surface-container px-2 py-1 rounded">
                    PROMPTS
                  </span>
                </div>
              </Link>

              {/* 模型管理 */}
              <div className={`${cardBase} group p-5 min-h-45`}>
                <IconBadge icon="model_training" tone="primary" className="mb-3" />
                <h4 className="text-[15px] font-semibold mb-1">模型管理</h4>
                <p className="text-[13px] text-on-surface-variant mb-3">
                  权重版本分发与负载治理
                </p>
                <div className="mt-1">
                  <span className="tabular-nums tracking-tight text-xs font-black text-primary px-2 py-1 bg-primary/10 rounded">
                    V3.1-STABLE
                  </span>
                </div>
              </div>
            </div>
          </Section>

          {/* ──── 规则中心 + 数据中心 ──── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 规则中心 */}
            <Section accent="bg-secondary" title="规则中心" subtitle="Rules" compact>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`${cardBase} group p-5 min-h-45`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-secondary-fixed flex items-center justify-center text-secondary">
                    <span className="material-symbols-outlined text-[20px]">
                      face
                    </span>
                  </div>
                  <h4 className="text-[15px] font-semibold">街巷画像</h4>
                </div>
                <p className="text-[13px] text-on-surface-variant mb-3">
                  风格趋势与受众细分分析
                </p>
                <div className="flex justify-between items-center text-[11px] font-bold">
                  <span>24 维度属性</span>
                  <span className="text-green-600">ACTIVE</span>
                </div>
              </div>

                <div className={`${cardBase} group p-5 min-h-45`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-tertiary-fixed flex items-center justify-center text-tertiary">
                      <span className="material-symbols-outlined text-[20px]">rule</span>
                    </div>
                    <h4 className="text-[15px] font-semibold">评分规则</h4>
                  </div>
                  <p className="text-[13px] text-on-surface-variant mb-3">
                    权重配置与算子计算模型
                  </p>
                  <div className="flex justify-between items-center text-[11px] font-bold">
                    <span>V2.4 版本</span>
                    <span className="text-blue-600 tabular-nums tracking-tight">
                      BUILD 82
                    </span>
                  </div>
                </div>
              </div>
            </Section>

            {/* 数据中心 */}
            <Section accent="bg-primary" title="数据中心" subtitle="Data Flow" compact>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <DataTile
                  icon="rss_feed"
                  iconClass="text-secondary"
                  title="数据源"
                  value="8 SOURCES"
                  valueClass="text-on-surface-variant tabular-nums tracking-tight"
                />
                <DataTile
                  icon="sync"
                  iconClass="text-primary"
                  title="同步任务"
                  value="IDLE"
                  valueClass="text-green-600 font-black"
                />
                <DataTile
                  icon="schema"
                  iconClass="text-tertiary"
                  title="知识图谱"
                  value="2.1k EDGES"
                  valueClass="text-on-surface-variant tabular-nums tracking-tight"
                />
              </div>
            </Section>
          </div>
        </div>
      </main>

      <MobileBottomNav activeHref="/resources" />
    </>
  );
}

/* ──────────────── 局部子组件 ──────────────── */

function StatusPill({
  icon,
  iconFill,
  iconClass,
  label,
  value,
  valueClass,
}: {
  icon: string;
  iconFill?: boolean;
  iconClass: string;
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-lg shadow-sm border border-outline-variant/30">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center ${iconClass}`}
      >
        <span
          className="material-symbols-outlined text-[18px]"
          style={iconFill ? { fontVariationSettings: "'FILL' 1" } : undefined}
        >
          {icon}
        </span>
      </div>
      <div>
        <p className="text-[10px] font-bold text-on-surface-variant/60 uppercase">
          {label}
        </p>
        <p className={`text-[15px] font-bold ${valueClass}`}>{value}</p>
      </div>
    </div>
  );
}

function Section({
  accent,
  title,
  subtitle,
  compact,
  children,
}: {
  accent: string;
  title: string;
  subtitle: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white/40 p-4 rounded-2xl border border-outline-variant/20 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className={`w-1.5 h-6 rounded-full ${accent}`} />
        <h3
          className={`font-black tracking-tight ${
            compact ? "text-[15px]" : "text-xl"
          }`}
        >
          {title}
          <span
            className={`text-on-surface-variant/40 font-normal ${
              compact ? "ml-1" : "ml-2 text-[15px]"
            }`}
          >
            {subtitle}
          </span>
        </h3>
        <div className="h-px flex-1 bg-outline-variant/30" />
      </div>
      {children}
    </section>
  );
}

const toneMap: Record<string, string> = {
  primary: "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white",
  secondary:
    "bg-primary/10 text-secondary group-hover:bg-secondary group-hover:text-white",
  tertiary:
    "bg-primary/10 text-tertiary group-hover:bg-tertiary group-hover:text-white",
};

function IconBadge({
  icon,
  tone,
  className = "",
}: {
  icon: string;
  tone: "primary" | "secondary" | "tertiary";
  className?: string;
}) {
  return (
    <div
      className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${toneMap[tone]} ${className}`}
    >
      <span className="material-symbols-outlined">{icon}</span>
    </div>
  );
}

function DataTile({
  icon,
  iconClass,
  title,
  value,
  valueClass,
}: {
  icon: string;
  iconClass: string;
  title: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="border border-outline-variant/30 bg-white p-3 rounded-xl text-center cursor-pointer shadow-sm hover:shadow-lg hover:border-primary/40 transition-all min-h-45 flex flex-col items-center justify-center">
      <span className={`material-symbols-outlined mb-2 ${iconClass}`}>{icon}</span>
      <h4 className="text-xs font-bold mb-1">{title}</h4>
      <p className={`text-[10px] ${valueClass}`}>{value}</p>
    </div>
  );
}
