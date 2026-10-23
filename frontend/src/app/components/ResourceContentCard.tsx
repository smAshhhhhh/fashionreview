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
    const measureTools = () => {
      const currentTools = parent.querySelector<HTMLElement>(
        ":scope > .resource-sticky-tools, :scope > .resource-selector-loading",
      );
      if (currentTools !== tools) {
        if (tools) observer.unobserve(tools);
        tools = currentTools;
        if (tools) observer.observe(tools);
      }
      card.dataset.sticky = String(Boolean(tools));
      card.style.setProperty(
        "--resource-sticky-tools-height",
        `${tools?.getBoundingClientRect().height ?? 0}px`,
      );
    };

    // 仅测量功能区高度，滚动时的圆角位置由 CSS sticky 管理。
    const observer = new ResizeObserver(measureTools);
    const mutations = new MutationObserver(measureTools);
    mutations.observe(parent, { childList: true });
    measureTools();

    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);

  return (
    <section
      ref={cardRef}
      role="region"
      aria-label={label}
      tabIndex={0}
      data-sticky="false"
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
