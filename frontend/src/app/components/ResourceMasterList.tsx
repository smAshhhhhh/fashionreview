"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** 顶部横向选择列表，所有尺寸下保持相同的操作方式。 */
export default function ResourceMasterList({
  label,
  value,
  description,
  action,
  children,
}: {
  label: string;
  value: string;
  description?: ReactNode;
  /** 标题右侧的操作按钮（如「新建模板」），浏览箭头随之移到它下方 */
  action?: ReactNode;
  children: ReactNode;
}) {
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const updateEdges = () => {
    const list = listRef.current;
    if (!list) return;

    setEdges({
      start: list.scrollLeft <= 1,
      end: list.scrollLeft + list.clientWidth >= list.scrollWidth - 1,
    });
  };

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const observer = new ResizeObserver(updateEdges);
    observer.observe(list);
    Array.from(list.children).forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [children]);

  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector('[aria-pressed="true"]');
    if (!list || !selected) return;

    // 仅移动横向列表，避免改变页面的滚动位置。
    const viewport = list.getBoundingClientRect();
    const item = selected.getBoundingClientRect();
    if (item.left < viewport.left) {
      list.scrollBy({ left: item.left - viewport.left, behavior: "instant" });
    } else if (item.right > viewport.right) {
      list.scrollBy({ left: item.right - viewport.right, behavior: "instant" });
    }
  }, [value]);

  const scrollList = (direction: number) => {
    const list = listRef.current;
    if (!list) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    list.scrollBy({
      left: direction * list.clientWidth,
      behavior: reducedMotion ? "instant" : "smooth",
    });
  };

  const controls = (!edges.start || !edges.end) && (
    <div className="resource-master-controls">
      {([-1, 1] as const).map((direction) => (
        <button
          key={direction}
          type="button"
          aria-label={`向${direction < 0 ? "左" : "右"}浏览${label}`}
          aria-controls={listId}
          disabled={direction < 0 ? edges.start : edges.end}
          onClick={() => scrollList(direction)}
          className="resource-button resource-button--icon resource-button--quiet"
        >
          <span
            aria-hidden="true"
            className="material-symbols-outlined resource-icon"
          >
            {direction < 0 ? "chevron_left" : "chevron_right"}
          </span>
        </button>
      ))}
    </div>
  );
  const title = (
    <div className="resource-master-title">
      <p className="resource-caption text-on-surface-variant">
        当前：{value}
      </p>
      {description && (
        <p className="resource-caption text-on-surface-variant">
          {description}
        </p>
      )}
    </div>
  );

  return (
    <>
      {action ? (
        /* 带操作按钮：右侧一列，操作按钮在上、浏览箭头在下 */
        <div className="resource-master-heading resource-master-heading--with-action">
          <div className="resource-master-text">
            <p className="resource-list-heading">{label}</p>
            {title}
          </div>
          <div className="resource-master-side">
            {action}
            {controls}
          </div>
        </div>
      ) : (
        <div className="resource-master-heading">
          <div className="resource-carousel-heading">
            <p className="resource-list-heading">{label}</p>
            {controls}
          </div>
          {title}
        </div>
      )}
      <div
        role="group"
        aria-label={label}
        className="resource-master-list resource-sticky-tools"
      >
        <div
          id={listId}
          ref={listRef}
          role="region"
          aria-label={`${label}列表，可横向滚动`}
          tabIndex={0}
          onScroll={updateEdges}
          className="resource-master-items"
        >
          {children}
        </div>
      </div>
    </>
  );
}
