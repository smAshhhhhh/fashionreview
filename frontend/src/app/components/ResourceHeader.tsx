import Link from "next/link";
import type { ReactNode } from "react";

/** 管理子页共用标题栏：窄屏操作自动换行，返回入口保留完整触控区域。 */
export default function ResourceHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-divider bg-surface/80 px-3 py-1.5 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 flex-1 basis-48 items-center gap-2 sm:basis-auto sm:gap-3">
        <Link
          href="/resources"
          aria-label="返回资源中心"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-surface-container"
        >
          <span aria-hidden="true" className="material-symbols-outlined">
            arrow_back
          </span>
        </Link>
        <h1 className="min-w-0 break-words text-lg font-bold text-brand sm:text-xl">
          {title}
        </h1>
      </div>
      {children && (
        <div className="ml-auto flex max-w-full flex-wrap items-center gap-2">
          {children}
        </div>
      )}
    </header>
  );
}
