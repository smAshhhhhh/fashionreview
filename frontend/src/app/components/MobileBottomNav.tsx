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
    <nav className="lg:hidden fixed bottom-0 left-0 w-full h-16 bg-surface-container-lowest border-t border-outline-variant flex items-center justify-around z-50">
      {navItems.map((item) => {
        const isActive = item.href === activeHref;
        return (
          <Link
            key={item.label}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 ${
              isActive ? "text-primary" : "text-on-surface-variant"
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
            <span className="text-[10px] font-bold">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
