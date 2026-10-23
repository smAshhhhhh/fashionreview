import Link from "next/link";
import Sidebar from "./components/Sidebar";
import MobileBottomNav from "./components/MobileBottomNav";
import SearchBar from "./components/SearchBar";
import RecentInsights from "./components/RecentInsights";
import ActiveTaskGuard from "./components/ActiveTaskGuard";
import ContactUs from "./components/ContactUs";

const footerLinkClass =
  "min-h-11 rounded-full px-2 text-xs text-on-surface-variant hover:text-primary hover:underline underline-offset-4 transition-colors";

/* ──── Page ──── */

export default function Home() {
  return (
    <ActiveTaskGuard>
      <Sidebar activeHref="/" />

      <main className="home-page relative isolate lg:ml-64 flex flex-col items-center min-h-dvh bg-surface">
        {/* isolate + -z-10：网格垫在内容下方，不遮挡点击 */}
        <div aria-hidden className="grid-background pointer-events-none absolute inset-x-0 top-0 -z-10" />
        <div className="w-full max-w-225 px-3 lg:px-0 pt-6 flex flex-1 flex-col">
          {/* Hero / Search */}
          <SearchBar />

          <hr className="border-divider max-w-150 mx-auto mt-6 w-full" />

          {/* Recent Insights */}
          <div className="flex flex-1 items-center py-6">
            <section aria-labelledby="recent-insights-title" className="flex flex-col gap-4 max-w-150 mx-auto w-full">
              <div className="flex items-center justify-between">
                <h2 id="recent-insights-title" className="text-xl font-bold text-on-surface">最近洞察</h2>
                <Link href="/history" className="inline-flex min-h-11 items-center rounded-sm text-primary text-sm font-bold hover:underline underline-offset-4">
                  查看全部
                </Link>
              </div>
              <RecentInsights />
            </section>
          </div>
        </div>

        {/* 移动端为底部导航与设备安全区留出空间。 */}
        <footer className="home-footer w-full px-4 flex shrink-0 flex-col gap-2 sm:flex-row justify-center sm:justify-between items-center max-w-150 mx-auto bg-transparent">
          <div className="flex flex-wrap justify-center sm:justify-start items-center gap-x-3 gap-y-1 text-center">
            <span className="text-sm font-bold text-on-surface">
              Fashion Street AI
            </span>
            <span className="text-xs text-on-surface-variant">
              © 2026 Fashion Street AI
            </span>
          </div>
          <div className="flex min-h-11 items-center gap-4">
            <ContactUs className={`${footerLinkClass} cursor-pointer`} />
          </div>
        </footer>
      </main>

      <MobileBottomNav activeHref="/" />
    </ActiveTaskGuard>
  );
}
