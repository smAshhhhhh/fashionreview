"use client";

import { useState } from "react";

export default function HistoryHeader({
  onSearch,
}: {
  onSearch?: (query: string) => void;
}) {
  const [query, setQuery] = useState("");

  const handleChange = (value: string) => {
    setQuery(value);
    onSearch?.(value);
  };

  return (
    <div className="flex items-center justify-center gap-3">
      {/* Search */}
      <div className="relative group flex-1 max-w-xl">
        <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">
          search
        </span>
        <input
          className="w-full bg-outline-variant/30 border-none rounded-full h-12 pl-14 pr-4 text-lg text-on-surface placeholder:text-on-surface-variant focus:ring-1 focus:ring-primary focus:bg-white transition-all"
          placeholder="搜索街道或趋势..."
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
        />
      </div>

      {/* Filter buttons */}
      <div className="flex gap-2 shrink-0">
        <button className="flex items-center gap-1 bg-outline-variant/30 hover:bg-surface-variant px-4 py-2 rounded-full text-sm font-medium transition-colors">
          <span>筛选</span>
          <span className="material-symbols-outlined text-[18px]">tune</span>
        </button>
        <button className="flex items-center gap-1 bg-primary text-white px-4 py-2 rounded-full text-sm font-medium transition-colors">
          <span>高分优先</span>
        </button>
      </div>
    </div>
  );
}
