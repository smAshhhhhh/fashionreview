"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** 内容卡片参与整页滚动，滚动行为由页面统一管理。 */
export default function ResourceContentCard({
  label,
  className = "",
  variant = "card",
  children,
}: {
  label: string;
  className?: string;
  variant?: "card" | "stack";
  children: ReactNode;
}) {
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    const parent = card?.parentElement;
    if (!card || !parent) return;

    let tools: HTMLElement | null = null;
    let stickyObserver: IntersectionObserver | null = null;
    const measureTools = () => {
      const currentTools = parent.querySelector<HTMLElement>(
        ":scope > .resource-sticky-tools, :scope > .resource-selector-loading",
      );
      if (currentTools !== tools) {
        if (tools) observer.unobserve(tools);
        tools = currentTools;
        if (tools) observer.observe(tools);
      }
      const toolsHeight = tools?.getBoundingClientRect().height ?? 0;
      card.dataset.sticky = String(toolsHeight > 0);
      card.style.setProperty(
        "--resource-sticky-tools-height",
        `${toolsHeight}px`,
      );

      stickyObserver?.disconnect();
      if (!tools || toolsHeight === 0) {
        card.dataset.stuck = "false";
        return;
      }

      const stickyTop = Number.parseFloat(getComputedStyle(tools).top) || 0;
      const boundary = stickyTop + 1;
      card.dataset.stuck = String(
        tools.getBoundingClientRect().top <= boundary,
      );

      // 在吸顶边界内侧观察，避免未吸顶时遮罩覆盖上方列表。
      stickyObserver = new IntersectionObserver(
        ([entry]) => {
          card.dataset.stuck = String(
            entry.boundingClientRect.top <= boundary &&
              entry.intersectionRatio < 1,
          );
        },
        { rootMargin: `-${boundary}px 0px 0px 0px`, threshold: 1 },
      );
      stickyObserver.observe(tools);
    };

    // 监听尺寸与吸顶状态，圆角位置仍由 CSS sticky 管理。
    const observer = new ResizeObserver(measureTools);
    const mutations = new MutationObserver(measureTools);
    mutations.observe(parent, { childList: true });
    measureTools();

    return () => {
      observer.disconnect();
      mutations.disconnect();
      stickyObserver?.disconnect();
    };
  }, []);

  return (
    <section
      ref={cardRef}
      role="region"
      aria-label={label}
      tabIndex={0}
      data-sticky="false"
      data-stuck="false"
      className={[
        "resource-content-card",
        variant === "stack" ? "resource-content-stack" : "",
        className,
      ].join(" ")}
    >
      {children}
    </section>
  );
}
