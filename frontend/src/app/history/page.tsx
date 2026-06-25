"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import MobileBottomNav from "../components/MobileBottomNav";
import HistoryHeader from "../components/HistoryHeader";
import HistoryCard from "../components/HistoryCard";
import { listHistory } from "../../lib/api";
import type { HistoryItem } from "../types";

/** 按创建日期把记录分到 今天 / 昨天 / 更早。 */
function sectionOf(createdAt: string | null): "今天" | "昨天" | "更早" {
  if (!createdAt) return "更早";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "更早";
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return "今天";
  if (t >= startOfToday - 86400000) return "昨天";
  return "更早";
}

const SECTIONS = ["今天", "昨天", "更早"] as const;

export default function HistoryPage() {
  const [records, setRecords] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listHistory();
        if (!cancelled) setRecords(data);
      } catch (e: unknown) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "加载历史记录失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!searchQuery) return records;
    const q = searchQuery.toLowerCase();
    return records.filter(
      (r) =>
        r.street.toLowerCase().includes(q) ||
        (r.city ?? "").toLowerCase().includes(q) ||
        (r.district ?? "").toLowerCase().includes(q) ||
        (r.summary ?? "").toLowerCase().includes(q),
    );
  }, [records, searchQuery]);

  const renderBody = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-4xl">
            progress_activity
          </span>
          <p className="text-sm">正在加载历史记录…</p>
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl text-error">
            error
          </span>
          <p className="text-sm">{error}</p>
        </div>
      );
    }
    if (filtered.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl">history</span>
          <p className="text-sm">
            {records.length === 0 ? "还没有分析记录" : "没有匹配的记录"}
          </p>
        </div>
      );
    }
    return SECTIONS.map((section) => {
      const items = filtered.filter((r) => sectionOf(r.created_at) === section);
      if (items.length === 0) return null;
      return (
        <section key={section}>
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-base font-bold text-on-surface">{section}</h3>
            <div className="h-px flex-1 bg-outline-variant/50" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 justify-items-center">
            {items.map((record, i) => (
              <HistoryCard
                key={record.evaluation_id}
                record={record}
                priority={section === "今天" && i === 0}
              />
            ))}
          </div>
        </section>
      );
    });
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar activeHref="/history" />

      <main className="flex-1 min-w-0 min-h-screen md:ml-64">
        <div className="max-w-474 mx-auto px-4 lg:px-8 py-6 flex flex-col gap-6">
          <HistoryHeader onSearch={setSearchQuery} />
          {renderBody()}
        </div>
      </main>

      <MobileBottomNav activeHref="/history" />
    </div>
  );
}
