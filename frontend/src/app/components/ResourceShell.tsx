import type { ReactNode } from "react";
import MobileBottomNav from "./MobileBottomNav";
import ResourceHeader from "./ResourceHeader";
import Sidebar from "./Sidebar";

/** 资源页共用框架，功能状态仍由各页面管理。 */
export default function ResourceShell({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`resource-workspace${title ? " resource-subpage" : ""}`}>
      <Sidebar activeHref="/resources" />
      <main className="resource-main resource-workspace-main">
        {title ? (
          <div className="resource-document">
            <ResourceHeader title={title}>{actions}</ResourceHeader>
            {children}
          </div>
        ) : children}
      </main>
      <MobileBottomNav activeHref="/resources" />
    </div>
  );
}
