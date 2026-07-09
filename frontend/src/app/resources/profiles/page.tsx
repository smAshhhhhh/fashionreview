"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Sidebar from "../../components/Sidebar";
import MobileBottomNav from "../../components/MobileBottomNav";
import {
  listResourceStreets,
  getStreetProfile,
  startRebuildStreetProfile,
  fetchProfileJob,
  type ResourceStreet,
  type StreetProfileDetail,
} from "../../../lib/api";

/* ──────────────────────────────────────────────
 * 街巷画像页 /resources/profiles
 * 选街区 → 异步生成/刷新画像(显示「画像生成中」轮询) → 可视化 extra_stats + facts 预览。
 * 不解析文件;事实层导入在 POI 管理页。视觉对齐扁平 Twitter/X 风格。
 * ────────────────────────────────────────────── */

const TAG_CN: Record<string, string> = {
  boutique_cafe: "精品咖啡",
  designer_store: "设计师/买手店",
  luxury_store: "奢侈品/旗舰",
  gallery_culture: "画廊/文化",
  nightlife: "酒吧夜生活",
  western_dining: "西式餐饮",
  internet_famous: "网红/打卡",
};

type Dict = Record<string, unknown>;

export default function ProfilesPage() {
  const [streets, setStreets] = useState<ResourceStreet[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StreetProfileDetail | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectStreet = async (id: number) => {
    setSelectedId(id);
    setError(null);
    try {
      setDetail(await getStreetProfile(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载画像失败");
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const list = await listResourceStreets();
        setStreets(list);
        // 默认选中并展示第一个街区的画像
        if (list.length > 0) {
          await selectStreet(list[0].street_id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载街区失败");
      }
    })();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const rebuild = async () => {
    if (selectedId == null) return;
    setError(null);
    setJobStatus("画像生成中…");
    try {
      const job = await startRebuildStreetProfile(selectedId);
      pollRef.current = setInterval(async () => {
        const s = await fetchProfileJob(job.job_id);
        if (s.status === "completed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setJobStatus(null);
          await selectStreet(selectedId);
        } else if (s.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setJobStatus(null);
          setError(s.error ?? "画像生成失败");
        }
      }, 1200);
    } catch (e) {
      setJobStatus(null);
      setError(e instanceof Error ? e.message : "启动失败");
    }
  };

  const extra = (detail?.extra_stats ?? {}) as Dict;

  return (
    <div className="flex min-h-screen bg-white text-[#0f1419]">
      <Sidebar activeHref="/resources" />
      <main className="flex-1 min-w-0 md:ml-64 pb-24 lg:pb-12">
        {/* 顶部栏 */}
        <header className="sticky top-0 z-40 flex items-center gap-4 px-6 h-14 bg-white/80 backdrop-blur-md border-b border-[#eff3f4]">
          <Link href="/resources" className="flex items-center text-primary-container">
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <h1 className="text-xl font-bold text-[#0f1419]">街巷画像</h1>
        </header>

        <div className="px-4 lg:px-6 py-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* 街区列表 */}
          <aside className="space-y-2 lg:sticky lg:top-20 self-start">
            <h2 className="text-[13px] font-bold text-[#536471] uppercase mb-1">街区</h2>
            {streets.map((s) => {
              const active = selectedId === s.street_id;
              return (
                <button
                  key={s.street_id}
                  type="button"
                  onClick={() => selectStreet(s.street_id)}
                  className={`w-full text-left rounded-2xl p-3 border transition-colors ${
                    active
                      ? "border-primary-container bg-surface-container-low"
                      : "border-[#eff3f4] hover:bg-[#f7f9f9]"
                  }`}
                >
                  <div className="text-[14px] font-bold text-[#0f1419]">{s.street_name}</div>
                  <div className="text-[11px] text-[#536471] mt-0.5">
                    共 {s.poi_total} · 高德 {s.amap_count} · 点评 {s.dianping_count}
                    {s.has_profile ? " · 有画像" : ""}
                  </div>
                </button>
              );
            })}
            {streets.length === 0 && (
              <p className="text-[13px] text-[#536471]">暂无街区，先在 POI 管理导入。</p>
            )}
          </aside>

          {/* 画像详情 */}
          <section className="space-y-6 min-w-0">
            {error && (
              <p className="text-sm text-error" role="alert">
                {error}
              </p>
            )}
            {detail == null ? (
              <div className="grid place-items-center rounded-2xl border border-[#eff3f4] min-h-100 text-[#536471]">
                <p className="text-[15px]">请选择左侧街区查看画像。</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between flex-wrap gap-3 pb-6 border-b border-[#eff3f4]">
                  <div>
                    <h2 className="text-[28px] leading-8 font-black tracking-tight text-[#0f1419]">
                      {detail.street.name}
                    </h2>
                    <p className="text-[13px] text-[#536471] mt-1">
                      事实层 共 {detail.poi_total} · 高德 {detail.amap_count} · 点评 {detail.dianping_count}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={rebuild}
                    disabled={jobStatus != null}
                    className="flex items-center gap-2 bg-primary-container text-on-primary-fixed font-bold text-[15px] px-5 py-2 rounded-full shadow-sm hover:opacity-90 transition-all active:scale-95 disabled:opacity-60 disabled:active:scale-100"
                  >
                    {jobStatus != null && (
                      <span className="material-symbols-outlined animate-spin text-[18px]">
                        progress_activity
                      </span>
                    )}
                    {jobStatus ?? (detail.has_profile ? "刷新画像" : "生成画像")}
                  </button>
                </div>

                {!detail.has_profile ? (
                  <div className="grid place-items-center rounded-2xl border border-dashed border-[#eff3f4] p-10 text-center text-[#536471]">
                    <p className="text-[15px]">该街区尚无画像，点击「生成画像」从事实层聚合。</p>
                  </div>
                ) : (
                  <>
                    {/* 关键指标 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Metric label="POI 去重总数" value={asNum(detail.profile?.poi_count)} />
                      <Metric label="连锁占比" value={pctText(detail.profile?.chain_ratio)} />
                      <Metric label="平均评分" value={asNum(detail.profile?.avg_rating)} />
                      <Metric label="人均(元)" value={asNum(detail.profile?.avg_price)} />
                    </div>

                    <BarBlock title="业态分布(高德一级分类)" data={distToBars(extra.category_distribution)} />
                    <BarBlock title="菜系 Top(大众点评)" data={topToBars(extra.cuisine_top)} />
                    <BarBlock title="价格带分布" data={bandToBars(extra.price_profile)} />
                    <TagBlock title="时尚标签" tags={extra.fashion_tags} density={extra.fashion_density} />
                    <HighlightBlock highlights={extra.poi_highlights} />

                    {/* facts 预览 */}
                    <div className="bg-white rounded-2xl border border-[#eff3f4] p-4">
                      <h3 className="text-[14px] font-bold mb-2 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary-container text-[18px]">
                          smart_toy
                        </span>
                        点评时进入 LLM 的 facts 预览
                      </h3>
                      <pre className="text-[12px] whitespace-pre-wrap text-[#536471] bg-surface-container-low rounded-xl p-3 overflow-x-auto">
                        {detail.facts_preview || "(空)"}
                      </pre>
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      </main>
      <MobileBottomNav activeHref="/resources" />
    </div>
  );
}

function asNum(v: unknown): string {
  return v == null ? "—" : String(v);
}
function pctText(v: unknown): string {
  if (v == null) return "—";
  return `${Math.round(Number(v) * 100)}%`;
}

type Bar = { label: string; count: number; pct: number };

function distToBars(d: unknown): Bar[] {
  if (!d || typeof d !== "object") return [];
  return Object.entries(d as Record<string, { count: number; pct: number }>).map(
    ([k, v]) => ({ label: k, count: v.count, pct: v.pct }),
  );
}
function topToBars(d: unknown): Bar[] {
  if (!Array.isArray(d)) return [];
  return (d as { name: string; count: number; pct: number }[]).map((x) => ({
    label: x.name,
    count: x.count,
    pct: x.pct,
  }));
}
function bandToBars(d: unknown): Bar[] {
  const bands = (d as Record<string, unknown>)?.price_band_counts;
  if (!bands || typeof bands !== "object") return [];
  const entries = Object.entries(bands as Record<string, number>);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return entries.map(([k, v]) => ({ label: k, count: v, pct: Math.round((v / total) * 100) }));
}

function BarBlock({ title, data }: { title: string; data: Bar[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="bg-white rounded-2xl border border-[#eff3f4] p-4">
      <h3 className="text-[14px] font-bold mb-3 text-[#0f1419]">{title}</h3>
      <div className="space-y-2">
        {data.slice(0, 12).map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-[12px]">
            <span className="w-28 shrink-0 truncate text-[#536471]">{d.label}</span>
            <div className="flex-1 bg-surface-container-low rounded-full h-2">
              <div
                className="bg-primary-container h-2 rounded-full"
                style={{ width: `${(d.count / max) * 100}%` }}
              />
            </div>
            <span className="w-16 text-right tabular-nums text-[#0f1419]">
              {d.count} ({d.pct}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TagBlock({
  title,
  tags,
  density,
}: {
  title: string;
  tags: unknown;
  density: unknown;
}) {
  if (!tags || typeof tags !== "object") return null;
  const t = tags as Record<string, number>;
  const d = (density ?? {}) as Record<string, number>;
  const entries = Object.entries(t).filter(([, v]) => v > 0);
  if (entries.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl border border-[#eff3f4] p-4">
      <h3 className="text-[14px] font-bold mb-3 text-[#0f1419]">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {entries.map(([k, v]) => {
          const base = k.replace(/_count$/, "");
          const pct = d[`${base}_pct`];
          return (
            <span
              key={k}
              className="text-[12px] bg-primary-container/10 text-primary-container px-3 py-1 rounded-full"
            >
              {TAG_CN[base] ?? base}: {v}
              {pct != null ? ` (${pct}%)` : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function HighlightBlock({ highlights }: { highlights: unknown }) {
  if (!highlights || typeof highlights !== "object") return null;
  const h = highlights as Record<string, string[]>;
  const entries = Object.entries(h);
  if (entries.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl border border-[#eff3f4] p-4">
      <h3 className="text-[14px] font-bold mb-3 text-[#0f1419]">代表性店铺</h3>
      <div className="space-y-2">
        {entries.map(([k, names]) => (
          <div key={k} className="text-[12px]">
            <span className="font-semibold text-[#536471]">{TAG_CN[k] ?? k}: </span>
            <span className="text-[#0f1419]">{names.join("、")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-container-low border border-[#eff3f4] rounded-2xl p-3">
      <div className="text-[11px] text-[#536471]">{label}</div>
      <div className="text-[18px] font-bold tabular-nums text-[#0f1419]">{value}</div>
    </div>
  );
}
