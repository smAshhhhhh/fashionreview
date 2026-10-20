import Link from "next/link";
import Sidebar from "../components/Sidebar";
import MobileBottomNav from "../components/MobileBottomNav";

/* 资源中心 /resources：各管理页的入口 */

type Entry = {
  href: string;
  icon: string;
  title: string;
  desc: string;
};

const SECTIONS: { title: string; subtitle: string; entries: Entry[] }[] = [
  {
    title: "数据资源",
    subtitle: "Data",
    entries: [
      {
        href: "/resources/poi",
        icon: "location_on",
        title: "POI 管理",
        desc: "导入高德 / 大众点评数据，管理街区 POI 事实层",
      },
      {
        href: "/resources/profiles",
        icon: "insights",
        title: "街巷画像",
        desc: "由 POI 生成画像，预览评分时使用的街区事实",
      },
      {
        href: "/resources/annotations",
        icon: "photo_library",
        title: "人工标注库",
        desc: "导入标注街景图与属性，照片点评时匹配赋值",
      },
    ],
  },
  {
    title: "分析配置",
    subtitle: "Configuration",
    entries: [
      {
        href: "/resources/metrics",
        icon: "account_tree",
        title: "指标体系",
        desc: "维度与指标权重，模板版本管理",
      },
      {
        href: "/resources/prompts",
        icon: "terminal",
        title: "Prompt 管理",
        desc: "识别、评分、报告各阶段的提示词与历史版本",
      },
      {
        href: "/resources/analysis",
        icon: "tune",
        title: "分析管理",
        desc: "结果页展示区块与点评流程开关",
      },
    ],
  },
];

export default function ResourcesPage() {
  return (
    <>
      <Sidebar activeHref="/resources" />

      <main className="lg:ml-64 min-h-screen pt-16 lg:pt-0 pb-24 lg:pb-12 bg-surface text-on-surface">
        <div className="mx-auto w-full max-w-5xl px-4 lg:px-8 py-10 space-y-10">
          <header>
            <h2 className="text-brand text-[28px] leading-8 font-black tracking-tight">资源中心</h2>
            <p className="mt-2 text-[15px] text-on-surface-variant">
              管理点评所用的数据资源与分析配置。
            </p>
          </header>

          {SECTIONS.map((section) => (
            <section key={section.title}>
              <div className="mb-4 flex items-center gap-3">
                <h3 className="text-lg font-bold tracking-tight">
                  {section.title}
                  <span className="ml-2 text-[13px] font-normal text-on-surface-variant">
                    {section.subtitle}
                  </span>
                </h3>
                <div className="h-px flex-1 bg-divider" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {section.entries.map((entry) => (
                  <EntryCard key={entry.href} entry={entry} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      <MobileBottomNav activeHref="/resources" />
    </>
  );
}

function EntryCard({ entry }: { entry: Entry }) {
  return (
    <Link
      href={entry.href}
      className="group flex h-full flex-col rounded-2xl border border-divider bg-surface-container-lowest p-6 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_8px_24px_rgb(0,0,0,0.05)]"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
        <span className="material-symbols-outlined">{entry.icon}</span>
      </div>
      <h4 className="mt-5 text-base font-bold">{entry.title}</h4>
      <p className="mt-1.5 text-[13px] leading-relaxed text-on-surface-variant">{entry.desc}</p>
      <span className="mt-auto flex items-center gap-1 pt-5 text-[13px] font-bold text-primary">
        进入
        <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-0.5">
          arrow_forward
        </span>
      </span>
    </Link>
  );
}
