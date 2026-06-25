"use client";

import { useEffect, useState } from "react";
import HistoryCard from "./HistoryCard";
import { listHistory } from "../../lib/api";
import type { HistoryItem } from "../types";

/** 首页「最近洞察」：取历史记录最新 3 条，复用 HistoryCard 展示。 */
export default function RecentInsights() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listHistory(3);
        if (!cancelled) setItems(data.slice(0, 3));
      } catch (e: unknown) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "加载最近洞察失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin text-2xl">
          progress_activity
        </span>
        <span className="text-sm">加载中…</span>
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-10 text-center text-sm text-on-surface-variant">
        {error}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-on-surface-variant">
        还没有分析记录，搜索一条街道开始吧
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {items.map((item, i) => (
        <HistoryCard
          key={item.evaluation_id}
          record={item}
          priority={i === 0}
        />
      ))}
    </div>
  );
}
