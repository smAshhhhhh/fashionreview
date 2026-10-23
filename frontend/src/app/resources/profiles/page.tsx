"use client";

import { useEffect, useRef, useState } from "react";
import ResourceFeedback from "../../components/ResourceFeedback";
import ResourceShell from "../../components/ResourceShell";
import ResourceContentCard from "../../components/ResourceContentCard";
import ResourceSection from "../../components/ResourceSection";
import ResourceMasterList from "../../components/ResourceMasterList";
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
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [pollPaused, setPollPaused] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobRef = useRef<{ id: string; streetId: number } | null>(null);
  const requestRef = useRef(0);
  const alive = useRef(true);

  const selectStreet = async (id: number) => {
    const request = ++requestRef.current;
    setSelectedId(id);
    setDetail(null);
    setError(null);
    setLoadingDetail(true);
    try {
      const data = await getStreetProfile(id);
      if (alive.current && request === requestRef.current) setDetail(data);
    } catch (e) {
      if (alive.current && request === requestRef.current)
        setError(e instanceof Error ? e.message : "加载画像失败，请重试。");
    } finally {
      if (alive.current && request === requestRef.current)
        setLoadingDetail(false);
    }
  };

  const loadStreets = async () => {
    setLoading(true);
    setListError(null);
    try {
      const list = await listResourceStreets();
      if (!alive.current) return;
      setStreets(list);
      if (list.length > 0) await selectStreet(list[0].street_id);
    } catch (e) {
      if (alive.current)
        setListError(e instanceof Error ? e.message : "加载街区失败，请重试。");
    } finally {
      if (alive.current) setLoading(false);
    }
  };

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    const requests = requestRef;
    void (async () => {
      try {
        const list = await listResourceStreets();
        if (cancelled) return;
        setStreets(list);
        if (list.length > 0) await selectStreet(list[0].street_id);
      } catch (e) {
        if (!cancelled)
          setListError(
            e instanceof Error ? e.message : "加载街区失败，请重试。",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      alive.current = false;
      ++requests.current;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const pollJob = async () => {
    const current = jobRef.current;
    if (!current) return;
    setPollPaused(false);
    try {
      const result = await fetchProfileJob(current.id);
      if (!alive.current || jobRef.current !== current) return;
      if (result.status === "running") {
        pollRef.current = setTimeout(() => void pollJob(), 1200);
      } else {
        jobRef.current = null;
        setJobStatus(null);
        if (result.status === "failed")
          setError("画像生成失败，请核对 POI 数据后重试。");
        else await selectStreet(current.streetId);
      }
    } catch (e) {
      if (!alive.current) return;
      setPollPaused(true);
      setError(
        e instanceof Error ? e.message : "无法获取画像任务进度，请重新查询。",
      );
    }
  };

  const rebuild = async () => {
    if (selectedId == null || jobStatus != null) return;
    setError(null);
    setJobStatus("画像生成中…");
    try {
      const job = await startRebuildStreetProfile(selectedId);
      if (!alive.current) return;
      if (job.status === "completed") {
        setJobStatus(null);
        await selectStreet(selectedId);
      } else if (job.status === "failed") {
        setJobStatus(null);
        setError("画像生成失败，请核对 POI 数据后重试。");
      } else {
        jobRef.current = { id: job.job_id, streetId: selectedId };
        void pollJob();
      }
    } catch (e) {
      if (alive.current) {
        setJobStatus(null);
        setError(e instanceof Error ? e.message : "启动失败，请重试。");
      }
    }
  };

  const extra = (detail?.extra_stats ?? {}) as Dict;

  return (
    <ResourceShell title="街巷画像">
      <div className="resource-content">
        <div className="resource-workbench">
          {/* 街区列表 */}
          <ResourceMasterList
            label="街区"
            value={
              streets.find((item) => item.street_id === selectedId)?.street_name ??
              "未选择街区"
            }
          >
            {streets.map((s) => {
              const active = selectedId === s.street_id;
              return (
                <button
                  key={s.street_id}
                  type="button"
                  aria-pressed={active}
                  disabled={jobStatus != null}
                  onClick={() => void selectStreet(s.street_id)}
                  className={`resource-list-item w-full disabled:opacity-60 ${active
                      ? "resource-list-item--selected"
                      : ""
                    }`}
                >
                  <div className="resource-detail font-bold text-on-surface">
                    {s.street_name}
                  </div>
                  <div className="resource-caption text-on-surface-variant mt-0.5">
                    共 {s.poi_total} · 高德 {s.amap_count} · 点评{" "}
                    {s.dianping_count}
                    {s.has_profile ? " · 有画像" : ""}
                  </div>
                </button>
              );
            })}
            {loading && (
              <p role="status" className="text-on-surface-variant">
                正在加载街区…
              </p>
            )}
            {listError && (
              <ResourceFeedback
                error={listError}
                onRetry={() => void loadStreets()}
              />
            )}
            {!loading && !listError && streets.length === 0 && (
              <p className="resource-caption text-on-surface-variant">
                暂无街区，先在 POI 管理导入。
              </p>
            )}
          </ResourceMasterList>

          {/* 画像详情 */}
          <ResourceContentCard
            label="街巷画像详情"
            className="resource-profile-detail"
            variant="stack"
          >
            <ResourceFeedback
              error={error}
              onRetry={
                pollPaused
                  ? () => {
                    setError(null);
                    void pollJob();
                  }
                  : selectedId != null
                    ? () => void selectStreet(selectedId)
                    : undefined
              }
            />
            {loadingDetail ? (
              <p
                role="status"
                className="py-12 text-center text-on-surface-variant"
              >
                正在加载街巷画像…
              </p>
            ) : detail == null ? (
              <div className={`
                resource-panel resource-panel--padded min-h-60 grid place-items-center
                text-center text-on-surface-variant
              `}>
                <p className="resource-body">
                  选择街区后可查看画像；没有数据时，请先前往 POI 管理导入。
                </p>
              </div>
            ) : (
              <>
                <div className="resource-detail-header">
                  <div className="min-w-0 flex-1 basis-48">
                    <h2 className="resource-detail-title">
                      {detail.street.name}
                    </h2>
                    <p className="resource-caption text-on-surface-variant mt-1">
                      事实层 共 {detail.poi_total} · 高德 {detail.amap_count} ·
                      点评 {detail.dianping_count}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={rebuild}
                    disabled={jobStatus != null}
                    className="resource-button resource-button--primary"
                  >
                    {jobStatus != null && (
                      <span
                        aria-hidden="true"
                        className="material-symbols-outlined animate-spin resource-icon"
                      >
                        progress_activity
                      </span>
                    )}
                    {jobStatus ??
                      (detail.has_profile ? "刷新画像" : "生成画像")}
                  </button>
                </div>

                {!detail.has_profile ? (
                  <div className={`
                    grid place-items-center rounded-2xl border border-dashed border-divider
                    p-10 text-center text-on-surface-variant
                  `}>
                    <p className="resource-body">
                      该街区尚无画像，点击「生成画像」从事实层聚合。
                    </p>
                  </div>
                ) : (
                  <>
                    {/* 关键指标 */}
                    <div className="resource-panel resource-scroll-card resource-scroll-card--padded">
                      <div className="resource-profile-stats">
                        <Metric
                          label="POI 去重总数"
                          value={asNum(detail.profile?.poi_count)}
                        />
                        <Metric
                          label="连锁占比"
                          value={pctText(detail.profile?.chain_ratio)}
                        />
                        <Metric
                          label="平均评分"
                          value={asNum(detail.profile?.avg_rating)}
                        />
                        <Metric
                          label="人均(元)"
                          value={asNum(detail.profile?.avg_price)}
                        />
                      </div>
                    </div>

                    <div className="resource-profile-sections">
                      <BarBlock
                        title="业态分布(高德一级分类)"
                        data={distToBars(extra.category_distribution)}
                      />
                      <BarBlock
                        title="菜系 Top(大众点评)"
                        data={topToBars(extra.cuisine_top)}
                      />
                      <BarBlock
                        title="价格带分布"
                        data={bandToBars(extra.price_profile)}
                      />
                      <TagBlock
                        title="时尚标签"
                        tags={extra.fashion_tags}
                        density={extra.fashion_density}
                      />
                      <HighlightBlock highlights={extra.poi_highlights} />
                    </div>

                    {/* facts 预览 */}
                    <ResourceSection
                      title={
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="material-symbols-outlined text-primary resource-icon"
                          >
                            smart_toy
                          </span>
                          点评时进入 LLM 的 facts 预览
                        </span>
                      }
                    >
                      <pre className={`
                        resource-caption whitespace-pre-wrap text-on-surface-variant
                        overflow-x-auto
                      `}>
                        {detail.facts_preview || "(空)"}
                      </pre>
                    </ResourceSection>
                  </>
                )}
              </>
            )}
          </ResourceContentCard>
        </div>
      </div>

    </ResourceShell>
  );
}

function asNum(v: unknown): string {
  if (v == null || (typeof v === "number" && !Number.isFinite(v))) return "—";
  return typeof v === "number"
    ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(v)
    : String(v);
}
function pctText(v: unknown): string {
  if (v == null) return "—";
  const value = Number(v);
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "—";
}

type Bar = { label: string; count: number; pct: number };

function distToBars(d: unknown): Bar[] {
  if (!d || typeof d !== "object") return [];
  return Object.entries(d).flatMap(([label, value]) => {
    if (!value || typeof value !== "object") return [];
    const { count, pct } = value as Record<string, unknown>;
    return typeof count === "number" && Number.isFinite(count) && count >= 0
      ? [
        {
          label,
          count,
          pct: typeof pct === "number" && Number.isFinite(pct) ? pct : 0,
        },
      ]
      : [];
  });
}
function topToBars(d: unknown): Bar[] {
  if (!Array.isArray(d)) return [];
  return d.flatMap((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.name !== "string" ||
      typeof item.count !== "number" ||
      !Number.isFinite(item.count) ||
      item.count < 0
    )
      return [];
    return [
      {
        label: item.name,
        count: item.count,
        pct:
          typeof item.pct === "number" && Number.isFinite(item.pct)
            ? item.pct
            : 0,
      },
    ];
  });
}
function bandToBars(d: unknown): Bar[] {
  const bands = (d as Record<string, unknown>)?.price_band_counts;
  if (!bands || typeof bands !== "object") return [];
  const entries = Object.entries(bands as Record<string, number>).filter(
    ([, value]) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0,
  );
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return entries.map(([k, v]) => ({
    label: k,
    count: v,
    pct: Math.round((v / total) * 100),
  }));
}

function BarBlock({ title, data }: { title: string; data: Bar[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <ResourceSection title={title}>
      <div className="space-y-2">
        {data.slice(0, 12).map((d) => (
          <div key={d.label} className="resource-profile-bar-row resource-caption">
            <span className="text-on-surface-variant">
              {d.label}
            </span>
            <div className="min-w-0 flex-1 bg-surface-container-low rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full"
                style={{ width: `${(d.count / max) * 100}%` }}
              />
            </div>
            <span className="text-right tabular-nums text-on-surface">
              {asNum(d.count)} ({asNum(d.pct)}%)
            </span>
          </div>
        ))}
      </div>
    </ResourceSection>
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
  const entries = Object.entries(t).filter(
    ([, v]) => typeof v === "number" && Number.isFinite(v) && v > 0,
  );
  if (entries.length === 0) return null;
  return (
    <ResourceSection title={title}>
      <table aria-label={title} className="resource-profile-tag-table">
        <thead>
          <tr>
            <th scope="col">标签</th>
            <th scope="col">数量</th>
            <th scope="col">占比</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([k, v]) => {
            const base = k.replace(/_count$/, "");
            const pct = d[`${base}_pct`];
            return (
              <tr key={k}>
                <th scope="row">{TAG_CN[base] ?? base}</th>
                <td>{asNum(v)}</td>
                <td>
                  {pct != null && Number.isFinite(pct)
                    ? `${asNum(pct)}%`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ResourceSection>
  );
}

function HighlightBlock({ highlights }: { highlights: unknown }) {
  if (!highlights || typeof highlights !== "object") return null;
  const h = highlights as Record<string, string[]>;
  const entries = Object.entries(h).flatMap(([key, names]) => {
    if (!Array.isArray(names)) return [];
    const validNames = names.filter(
      (name) => typeof name === "string" && name.trim().length > 0,
    );
    return validNames.length > 0 ? [[key, validNames] as const] : [];
  });
  if (entries.length === 0) return null;
  return (
    <ResourceSection title="代表性店铺">
      <dl className="resource-profile-highlights">
        {entries.map(([k, names]) => (
          <div key={k} className="resource-caption">
            <dt className="font-semibold text-on-surface-variant">
              {TAG_CN[k] ?? k}
            </dt>
            <dd className="text-on-surface">{names.join("、")}</dd>
          </div>
        ))}
      </dl>
    </ResourceSection>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="resource-caption text-on-surface-variant">{label}</div>
      <div className="resource-item-title font-bold tabular-nums text-on-surface">
        {value}
      </div>
    </div>
  );
}
