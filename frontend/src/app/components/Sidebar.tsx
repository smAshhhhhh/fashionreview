import Link from "next/link";
import type { NavItem } from "../types";

const navItems: NavItem[] = [
  { icon: "home", label: "首页", href: "/" },
  { icon: "analytics", label: "分析中心", href: "/analytics" },
  { icon: "history", label: "历史记录", href: "/history" },
  { icon: "inventory_2", label: "资源中心", href: "/resources" },
];

export default function Sidebar({ activeHref = "/" }: { activeHref?: string }) {
  return (
    <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-full p-4 gap-2 bg-surface border-r border-outline-variant w-64 z-50">
      {/* Logo */}
      <div className="mb-6 px-4">
        <h1 className="text-xl font-extrabold text-on-surface">
          Fashion Street AI
        </h1>
        <p className="text-xs text-on-surface-variant">专业分析师</p>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 grow">
        {navItems.map((item) => {
          const isActive = item.href === activeHref;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 rounded-full px-4 py-3 font-semibold transition-transform active:scale-95 ${
                isActive
                  ? "bg-secondary-container text-on-secondary-container"
                  : "text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <span
                className="material-symbols-outlined"
                style={
                  isActive
                    ? { fontVariationSettings: "'FILL' 1" }
                    : undefined
                }
              >
                {item.icon}
              </span>
              <span className="text-sm font-semibold">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* CTA Button */}
      <button className="mt-auto bg-primary text-white font-bold text-sm py-3 px-4 rounded-full flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
        <span className="material-symbols-outlined">add</span>
        开始新分析
      </button>
    </aside>
  );
}
