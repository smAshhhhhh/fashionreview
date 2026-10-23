import type { ReactNode } from "react";

/** 区块标题放在卡片外，正文共享滚动圆角样式。 */
export default function ResourceSection({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="resource-section">
      <h3 className="resource-item-title text-on-surface">{title}</h3>
      <div className="resource-panel resource-scroll-card resource-scroll-card--padded">
        {children}
      </div>
    </section>
  );
}
