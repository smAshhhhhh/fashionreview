"use client";

import Link from "next/link";
import type { NavItem } from "../types";

const navItems: NavItem[] = [
  { icon: "home", label: "首页", href: "/" },
  { icon: "analytics", label: "分析", href: "/analytics" },
  { icon: "history", label: "历史", href: "/history" },
  { icon: "inventory_2", label: "资源", href: "/resources" },
];

export default function MobileBottomNav({
  activeHref = "/",
}: {
  activeHref?: string;
}) {
  return (
    <nav
      aria-label="主导航"
      className="lg:hidden fixed bottom-0 left-0 w-full min-h-16 pb-[env(safe-area-inset-bottom)] bg-surface-container-lowest border-t border-divider flex items-stretch justify-around z-50"
    >
      {navItems.map((item) => {
        const isActive = item.href === activeHref;
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-16 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 ${
              isActive ? "text-brand" : "text-on-surface-variant"
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
            <span className="text-xs font-bold">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
