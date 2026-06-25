import Link from "next/link";
import Sidebar from "./components/Sidebar";
import MobileBottomNav from "./components/MobileBottomNav";
import SearchBar from "./components/SearchBar";
import RecentInsights from "./components/RecentInsights";
import ActiveTaskGuard from "./components/ActiveTaskGuard";

/* ──── Page ──── */

export default function Home() {
  return (
    <ActiveTaskGuard>
      <Sidebar activeHref="/" />

      <main className="lg:ml-64 flex flex-col items-center min-h-screen">
        <div className="w-full max-w-225 px-3 lg:px-0 py-6 flex flex-col gap-6">
          {/* Hero / Search */}
          <SearchBar />

          <hr className="border-outline-variant max-w-150 mx-auto w-full" />

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
        <footer className="w-full py-4 px-4 flex flex-col sm:flex-row justify-between items-center max-w-150 mx-auto border-t border-outline-variant mt-6 bg-transparent gap-4">
          <div className="flex flex-col items-center sm:items-start">
            <span className="text-sm font-bold text-on-surface">
              Fashion Street AI
            </span>
            <span className="text-xs text-on-surface-variant">
              © 2024 Fashion Street AI
            </span>
          </div>
          <div className="flex gap-4">
            {["关于我们", "联系我们", "数据源"].map((link) => (
              <a
                key={link}
                href="#"
                className="text-xs text-on-surface-variant hover:text-primary hover:underline transition-colors"
              >
                {link}
              </a>
            ))}
          </div>
        </footer>
      </main>

      <MobileBottomNav activeHref="/" />
    </ActiveTaskGuard>
  );
}
