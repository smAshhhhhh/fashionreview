import Link from "next/link";
import Sidebar from "../components/Sidebar";
import MobileBottomNav from "../components/MobileBottomNav";

/* ──────────────────────────────────────────────
 * 资源管理页 /resources
 * 仅实现页面主体内容；左侧菜单与底部导航复用现有组件。
 * 视觉对齐扁平 Twitter/X 风格（白底 / #eff3f4 发丝线 / primary-container 蓝）。
 * ────────────────────────────────────────────── */

/* 卡片通用外观：扁平白底 + 发丝线，hover 浅灰 */
const cardBase =
  "bg-white border border-[#eff3f4] rounded-2xl hover:bg-[#f7f9f9] transition-colors cursor-pointer";

export default function ResourcesPage() {
  return (
    <>
      <Sidebar activeHref="/resources" />

      <main className="lg:ml-64 min-h-screen pt-16 lg:pt-0 pb-24 lg:pb-12 bg-white text-[#0f1419]">
        {/* ──── 顶部工作台头部 ──── */}
        <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-[#eff3f4] px-3 lg:px-6 py-6">
          <h2 className="text-[23px] leading-7 font-bold tracking-tight text-[#0f1419]">
            工作台中心
          </h2>
          <p className="text-[15px] text-[#536471] mt-1">
            管理大规模资源档案、AI训练任务及多维评分规则体系。
          </p>
        </div>

        <div className="px-3 lg:px-6 py-8 space-y-12">
          {/* ──── 资源中心 ──── */}
          <Section title="资源中心" subtitle="Resource Center">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {/* 分析管理 */}
              <Link href="/resources/analysis" className={`${cardBase} group p-5 min-h-45 block`}>
                <div className="mb-3">
                  <IconBadge icon="tune" />
                </div>
                <h4 className="text-[15px] font-bold mb-1">分析管理</h4>
                <p className="text-[13px] text-[#536471] mb-6 leading-relaxed">
                  管控分析中心展示的内容区块
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-[#536471] uppercase">展示区块</span>
                    <span className="tabular-nums tracking-tight">9 区块</span>
                  </div>
                  <div className="w-full bg-surface-container-low rounded-full h-1">
                    <div className="bg-primary-container h-1 rounded-full w-[85%]" />
                  </div>
                </div>
              </Link>

              {/* 指标体系 */}
              <Link href="/resources/metrics" className={`${cardBase} group p-5 min-h-45 block`}>
                <div className="mb-3">
                  <IconBadge icon="account_tree" />
                </div>
                <h4 className="text-[15px] font-bold mb-1">指标体系</h4>
                <p className="text-[13px] text-[#536471] mb-6 leading-relaxed">
                  多维时尚度评价架构 · 模板版本管理
                </p>
                <div className="flex items-end gap-1">
                  <span className="text-2xl font-black tabular-nums tracking-tight">5</span>
                  <span className="text-[10px] text-[#536471] font-bold mb-1">一级维度</span>
                </div>
              </Link>

              {/* POI管理 */}
              <Link href="/resources/poi" className={`${cardBase} group p-5 min-h-45 block`}>
                <div className="mb-3">
                  <IconBadge icon="location_on" />
                </div>
                <h4 className="text-[15px] font-bold mb-1">POI管理</h4>
                <p className="text-[13px] text-[#536471] mb-6 leading-relaxed">
                  上传解析高德/点评 SQL/CSV，管理街区 POI 事实层
                </p>
                <div className="flex items-center gap-2 text-[11px] font-bold text-[#536471]">
                  <span className="material-symbols-outlined text-[16px]">upload_file</span>
                  <span>导入 & 事实层可视化</span>
                </div>
              </Link>

              {/* 街巷画像 */}
              <Link href="/resources/profiles" className={`${cardBase} group p-5 min-h-45 block`}>
                <div className="mb-3">
                  <IconBadge icon="insights" />
                </div>
                <h4 className="text-[15px] font-bold mb-1">街巷画像</h4>
                <p className="text-[13px] text-[#536471] mb-6 leading-relaxed">
                  从事实层生成画像，可视化业态/评分/时尚标签
                </p>
                <div className="flex items-center gap-2 text-[11px] font-bold text-[#536471]">
                  <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                  <span>画像生成 & 预览 facts</span>
                </div>
              </Link>

              {/* 向量库管理 */}
              <div className={`${cardBase} group p-5 min-h-45`}>
                <div className="mb-3">
                  <IconBadge icon="hub" />
                </div>
                <h4 className="text-[15px] font-bold mb-1">向量库管理</h4>
                <p className="text-[13px] text-[#536471] mb-6 leading-relaxed">
                  Milvus 引擎高性能检索
                </p>
                <div className="flex items-center gap-1 text-[11px] font-bold text-primary-container">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-container" />
                  就绪
                </div>
              </div>
            </div>
          </Section>

          {/* ──── AI中心 ──── */}
          <Section title="AI中心" subtitle="Intelligence Operations">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* AI任务 */}
              <div className={`${cardBase} group p-5 min-h-45`}>
                <div className="mb-3">
                  <IconBadge icon="dynamic_form" />
                </div>
                <h4 className="text-[15px] font-bold mb-1">AI任务</h4>
                <p className="text-[13px] text-[#536471] mb-3">
                  视觉识别与预测监控系统
                </p>
              </div>

              {/* RAG调试 */}
              <div className={`${cardBase} group p-5 min-h-45`}>
                <div className="mb-3">
                  <IconBadge icon="bug_report" />
                </div>
                <h4 className="text-[15px] font-bold mb-1">RAG调试</h4>
                <p className="text-[13px] text-[#536471] mb-3">
                  语义检索链路性能优化
                </p>
              </div>

              {/* Prompt管理 */}
              <Link href="/resources/prompts" className={`${cardBase} group p-5 min-h-45 block`}>
                <div className="mb-3">
                  <IconBadge icon="terminal" />
                </div>
                <h4 className="text-[15px] font-bold mb-1">Prompt管理</h4>
                <p className="text-[13px] text-[#536471] mb-3">
                  自动报告生产模版库
                </p>
              </Link>

              {/* 模型管理 */}
              <div className={`${cardBase} group p-5 min-h-45`}>
                <div className="mb-3">
                  <IconBadge icon="model_training" />
                </div>
                <h4 className="text-[15px] font-bold mb-1">模型管理</h4>
                <p className="text-[13px] text-[#536471] mb-3">
                  权重版本分发与负载治理
                </p>
              </div>
            </div>
          </Section>

          {/* ──── 规则中心 ──── */}
          <Section title="规则中心" subtitle="Rules" compact>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* 评分规则 */}
              <div className={`${cardBase} group p-5 min-h-45`}>
                <div className="mb-3">
                  <IconBadge icon="rule" />
                </div>
                <h4 className="text-[15px] font-bold mb-1">评分规则</h4>
                <p className="text-[13px] text-[#536471]">
                  权重配置与算子计算模型
                </p>
              </div>

              {/* 知识库管理 */}
              <div className={`${cardBase} group p-5 min-h-45`}>
                <div className="mb-3">
                  <IconBadge icon="database" />
                </div>
                <h4 className="text-[15px] font-bold mb-1">知识库管理</h4>
                <p className="text-[13px] text-[#536471]">
                  RAG 增强索引架构
                </p>
              </div>
            </div>
          </Section>
        </div>
      </main>

      <MobileBottomNav activeHref="/resources" />
    </>
  );
}

/* ──────────────── 局部子组件 ──────────────── */

function Section({
  title,
  subtitle,
  compact,
  children,
}: {
  title: string;
  subtitle: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <h3
          className={`font-black tracking-tight text-[#0f1419] ${
            compact ? "text-[15px]" : "text-xl"
          }`}
        >
          {title}
          <span
            className={`text-[#536471] font-normal ${
              compact ? "ml-1" : "ml-2 text-[15px]"
            }`}
          >
            {subtitle}
          </span>
        </h3>
        <div className="h-px flex-1 bg-[#eff3f4]" />
      </div>
      {children}
    </section>
  );
}

function IconBadge({ icon, className = "" }: { icon: string; className?: string }) {
  return (
    <div
      className={`w-10 h-10 rounded-full flex items-center justify-center bg-primary-container/10 text-primary-container transition-colors group-hover:bg-primary-container group-hover:text-white ${className}`}
    >
      <span className="material-symbols-outlined">{icon}</span>
    </div>
  );
}
