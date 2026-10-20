import Link from "next/link";
import Sidebar from "./components/Sidebar";
import MobileBottomNav from "./components/MobileBottomNav";
import SearchBar from "./components/SearchBar";
import RecentInsights from "./components/RecentInsights";
import ActiveTaskGuard from "./components/ActiveTaskGuard";
import ContactUs from "./components/ContactUs";

const footerLinkClass =
  "text-xs text-on-surface-variant hover:text-primary hover:underline transition-colors";

/* ──── Page ──── */

export default function Home() {
  return (
    <ActiveTaskGuard>
      <Sidebar activeHref="/" />

      <main className="relative isolate lg:ml-64 flex flex-col items-center min-h-screen bg-surface">
        {/* isolate + -z-10：网格垫在内容下方，不遮挡点击 */}
        <div aria-hidden className="grid-background pointer-events-none absolute inset-0 -z-10" />
        <div className="w-full max-w-225 px-3 lg:px-0 py-6 flex flex-col gap-6">
          {/* Hero / Search */}
          <SearchBar />

          <hr className="border-divider max-w-150 mx-auto w-full" />

          {/* Recent Insights */}
          <section className="flex flex-col gap-4 max-w-150 mx-auto w-full">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-on-surface">最近洞察</h3>
              <Link href="/history" className="text-primary text-sm font-bold hover:underline">
                查看全部
              </Link>
            </div>
            <RecentInsights />
          </section>
        </div>

        {/* Footer */}
        <footer className="w-full py-4 px-4 flex flex-col sm:flex-row justify-between items-center max-w-150 mx-auto mt-6 bg-transparent gap-4">
          <div className="flex flex-col items-center sm:items-start">
            <span className="text-sm font-bold text-on-surface">
              Fashion Street AI
            </span>
            <span className="text-xs text-on-surface-variant">
              © 2026 Fashion Street AI
            </span>
          </div>
          <div className="flex gap-4">
            <a href="#" className={footerLinkClass}>
              关于我们
            </a>
            <ContactUs className={`${footerLinkClass} cursor-pointer`} />
            <a href="#" className={footerLinkClass}>
              数据源
            </a>
          </div>
        </footer>
      </main>

      <MobileBottomNav activeHref="/" />
    </ActiveTaskGuard>
  );
}
