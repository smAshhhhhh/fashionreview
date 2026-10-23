"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { RESOURCE_ENTRIES } from "../resources/resource-navigation";

/** 子页只保留返回入口，标题与操作共享同一层级。 */
export default function ResourceHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  const pathname = usePathname();
  const current = RESOURCE_ENTRIES.find((entry) => entry.href === pathname);

  return (
    <header className="resource-header">
      <Link href="/resources" className="resource-back-link">
        <span aria-hidden="true" className="material-symbols-outlined resource-icon">
          arrow_back
        </span>
        资源中心
      </Link>
      <div className="resource-header-inner">
        <div className="resource-header-title">
          <div className="min-w-0">
            <h1 className="resource-page-title">{title}</h1>
            <p className="resource-page-description">{current?.description}</p>
          </div>
        </div>
        {children && (
          <div className="resource-actions">
            {children}
          </div>
        )}
      </div>
    </header>
  );
}
