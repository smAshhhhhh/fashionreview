import Link from "next/link";
import type { NavItem } from "../types";
import Logo from "./Logo";

const navItems: NavItem[] = [
  { icon: "home", label: "首页", href: "/" },
  { icon: "analytics", label: "分析中心", href: "/analytics" },
  { icon: "history", label: "历史记录", href: "/history" },
  { icon: "inventory_2", label: "资源中心", href: "/resources" },
];

export default function Sidebar({ activeHref = "/" }: { activeHref?: string }) {
  return (
    <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-full p-4 gap-2 bg-surface border-r border-divider w-64 z-50">
      {/* Logo */}
      <Link href="/" className="mb-6 px-4 pt-1 block">
        <Logo />
      </Link>

      {/* 导航 */}
      <nav aria-label="主导航" className="flex flex-col gap-1 grow">
        {navItems.map((item) => {
          const isActive = item.href === activeHref;
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-3 rounded-full px-4 py-3 font-semibold transition-transform active:scale-95 ${
                isActive
                  ? "bg-brand/[0.07] text-brand"
                  : "text-on-surface-variant hover:bg-surface-container hover:text-brand"
              }`}
            >
              <span
                aria-hidden="true"
                className="material-symbols-outlined"
                style={
                  isActive ? { fontVariationSettings: "'FILL' 1" } : undefined
                }
              >
                {item.icon}
              </span>
              <span className="text-sm font-semibold">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
