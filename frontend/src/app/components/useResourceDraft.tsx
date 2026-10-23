"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ResourceDialog from "./ResourceDialog";

/** 切换模板或站内跳转前保护本地编辑；浏览器刷新使用原生离页保护。 */
export default function useResourceDraft(dirty: boolean) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const confirmDiscard = (action: () => void) => {
    if (!dirty) action();
    else setPendingAction(() => action);
  };

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const beforeNavigate = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download") || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingAction(() => () => {
        if (destination.origin === window.location.origin) router.push(destination.href);
        else window.location.assign(destination.href);
      });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigate, true);
    };
  }, [dirty, router]);

  const dialog = pendingAction && (
    <ResourceDialog title="放弃未保存的修改？" onClose={() => setPendingAction(null)}>
      <p className="text-sm leading-relaxed text-on-surface-variant">当前修改还未保存。继续操作将丢弃这些修改。</p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" className="rounded-full border border-divider px-4 py-2 font-semibold" onClick={() => setPendingAction(null)}>继续编辑</button>
        <button type="button" className="rounded-full bg-primary px-4 py-2 font-semibold text-white" onClick={() => { setPendingAction(null); pendingAction(); }}>放弃修改并继续</button>
      </div>
    </ResourceDialog>
  );
  return { confirmDiscard, dialog };
}
