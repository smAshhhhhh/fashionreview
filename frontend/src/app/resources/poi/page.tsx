"use client";

import { useEffect, useRef, useState } from "react";
import ResourceDialog from "../../components/ResourceDialog";
import ResourceFeedback from "../../components/ResourceFeedback";
import ResourceHeader from "../../components/ResourceHeader";
import Sidebar from "../../components/Sidebar";
import MobileBottomNav from "../../components/MobileBottomNav";
import {
  importPoiFile,
  listResourceStreets,
  listPoiRows,
  type PoiImportResult,
  type ResourceStreet,
} from "../../../lib/api";

/* ──────────────────────────────────────────────
 * POI 管理页 /resources/poi
 * 上传高德/大众点评 SQL 或 CSV → 一步解析 + 入库 → 展示导入摘要、事实层数据。
 * POI 管理只负责事实层(street_poi);画像生成在「街巷画像」页。
 * ────────────────────────────────────────────── */

const PAGE_SIZE = 50;

const SOURCE_CN: Record<string, string> = {
  amap: "高德",
  dianping: "大众点评",
  mixed: "合并",
  all: "全部",
};

export default function PoiManagePage() {
  const [streets, setStreets] = useState<ResourceStreet[]>([]);
  const [confirmImport, setConfirmImport] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [streetName, setStreetName] = useState("");
  const [city, setCity] = useState("上海");
  const [district, setDistrict] = useState("");
  const [clearExisting, setClearExisting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<PoiImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeStreetId, setActiveStreetId] = useState<number | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [rowsTotal, setRowsTotal] = useState(0);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingStreets, setLoadingStreets] = useState(true);
  const [streetsError, setStreetsError] = useState<string | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const rowsRequest = useRef(0);
  const alive = useRef(true);
  const moreLock = useRef(false);
  // 街区卡片横向滚动容器：左右箭头按钮据此滚动
  const streetScrollRef = useRef<HTMLDivElement>(null);

  const scrollStreets = (dir: -1 | 1) => {
    streetScrollRef.current?.scrollBy({ left: dir * 320, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };

  // 竖向滚轮转横向：React 的 onWheel 是被动监听，preventDefault 无效，
  // 故用原生非被动监听阻止默认竖滚，避免横滑时页面同时竖向滚动。
  useEffect(() => {
    const el = streetScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || e.deltaX !== 0) return;
      const canScroll = e.deltaY > 0 ? el.scrollLeft < el.scrollWidth - el.clientWidth - 1 : el.scrollLeft > 0;
      if (!canScroll) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const loadRows = async (streetId: number, source: string) => {
    const request = ++rowsRequest.current;
    setActiveStreetId(streetId);
    setSourceFilter(source);
    setRows([]);
    setRowsTotal(0);
    setRowsError(null);
    setLoadingRows(true);
    setLoadingMore(false);
    moreLock.current = false;
    try {
      const data = await listPoiRows({ streetId, source: source === "all" ? undefined : source, limit: PAGE_SIZE, offset: 0 });
      if (alive.current && request === rowsRequest.current) { setRows(data.items); setRowsTotal(data.total); }
    } catch (e) {
      if (alive.current && request === rowsRequest.current) setRowsError(e instanceof Error ? e.message : "加载明细失败，请重试。");
    } finally {
      if (alive.current && request === rowsRequest.current) setLoadingRows(false);
    }
  };

  const reloadStreets = async () => {
    setLoadingStreets(true);
    setStreetsError(null);
    try {
      const list = await listResourceStreets();
      if (!alive.current) return [];
      setStreets(list);
      return list;
    } catch (e) {
      if (alive.current) setStreetsError(e instanceof Error ? e.message : "加载街区失败，请重试。");
      return [];
    } finally { if (alive.current) setLoadingStreets(false); }
  };

  const loadInitial = async () => {
    const list = await reloadStreets();
    if (alive.current && list.length > 0) await loadRows(list[0].street_id, "all");
  };
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    const requests = rowsRequest;
    void (async () => {
      try {
        const list = await listResourceStreets();
        if (cancelled) return;
        setStreets(list);
        if (list.length > 0) await loadRows(list[0].street_id, "all");
      } catch (e) { if (!cancelled) setStreetsError(e instanceof Error ? e.message : "加载街区失败，请重试。"); }
      finally { if (!cancelled) setLoadingStreets(false); }
    })();
    return () => { cancelled = true; alive.current = false; ++requests.current; };
    // 初始查询，后续切换由事件触发。
  }, []);

  const loadMore = async () => {
    if (activeStreetId == null || loadingRows || moreLock.current) return;
    moreLock.current = true;
    const request = rowsRequest.current;
    setLoadingMore(true);
    setRowsError(null);
    try {
      const data = await listPoiRows({ streetId: activeStreetId, source: sourceFilter === "all" ? undefined : sourceFilter, limit: PAGE_SIZE, offset: rows.length });
      if (alive.current && request === rowsRequest.current) {
        setRows((prev) => [...prev, ...data.items]); setRowsTotal(data.total);
      }
    } catch (e) {
      if (alive.current && request === rowsRequest.current) setRowsError(e instanceof Error ? e.message : "加载更多失败，请重试。");
    } finally {
      if (alive.current && request === rowsRequest.current) { setLoadingMore(false); moreLock.current = false; }
    }
  };

  const selectFile = (selected: File | null) => {
    setError(null);
    setResult(null);
    if (selected && (!/\.(sql|csv)$/i.test(selected.name) || selected.size === 0)) {
      setFile(null);
      setError(selected.size === 0 ? "文件为空，请选择包含数据的 SQL 或 CSV 文件。" : "请选择 .sql 或 .csv 格式的文件。");
      return;
    }
    setFile(selected);
  };

  const onImport = async (confirmed = false) => {
    if (!file || !streetName.trim() || importing) return;
    if (clearExisting && !confirmed) { setConfirmImport(true); return; }
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const r = await importPoiFile(
        file,
        { street_name: streetName.trim(), city: city.trim() || undefined, district: district.trim() || undefined },
        clearExisting,
      );
      setResult(r);
      await reloadStreets();
      await loadRows(r.street.id, "all");
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-surface text-on-surface">
      <Sidebar activeHref="/resources" />
      <main className="resource-main flex-1 min-w-0 lg:ml-64">
        {/* 顶部栏 */}
        <ResourceHeader title="POI 数据导入" />

        <div className="max-w-250 mx-auto p-4 lg:p-6 space-y-6">
          {/* 上传区（Dropzone 风格） */}
          <section className="border border-divider rounded-2xl p-4 sm:p-6 bg-surface-container-lowest">
            <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-4 gap-y-1 mb-6">
              <div className="sm:row-span-2 bg-surface-container-low w-12 h-12 rounded-full flex items-center justify-center text-primary shrink-0">
                <span aria-hidden="true" className="material-symbols-outlined">upload_file</span>
              </div>
              <h2 className="self-center sm:self-start text-xl font-bold">上传并导入</h2>
              <p className="col-span-2 sm:col-span-1 sm:col-start-2 text-on-surface-variant text-[15px] leading-relaxed">
                支持高德 / 大众点评导出的 .sql 或 .csv。系统会自动识别格式，解析后写入事实层
                street_poi。本页只负责事实层导入，画像生成请前往「街巷画像」页。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="space-y-1">
                <label htmlFor="poi-city" className="text-[13px] font-semibold px-1 text-on-surface-variant">城市</label>
                <input id="poi-city" disabled={importing}
                  className="w-full border border-divider rounded-xl px-3 py-2 text-[15px] focus:border-primary transition-colors outline-none"
                  placeholder="输入城市"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="poi-district" className="text-[13px] font-semibold px-1 text-on-surface-variant">
                  行政区 (可选)
                </label>
                <input id="poi-district" disabled={importing}
                  className="w-full border border-divider rounded-xl px-3 py-2 text-[15px] focus:border-primary transition-colors outline-none"
                  placeholder="输入行政区"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="poi-streetName" className="text-[13px] font-semibold px-1 text-on-surface-variant">
                  街区名称 (如 新天地)
                </label>
                <input id="poi-streetName" disabled={importing}
                  className="w-full border border-divider rounded-xl px-3 py-2 text-[15px] focus:border-primary transition-colors outline-none"
                  placeholder="输入街区名称"
                  value={streetName}
                  onChange={(e) => setStreetName(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t border-divider">
              <div className="flex w-full min-w-0 items-center gap-3 md:flex-1">
                <label className="resource-upload shrink-0 cursor-pointer hover:bg-surface-variant transition-colors px-5 py-2 rounded-full flex items-center gap-2 border border-divider">
                  <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">
                    attach_file
                  </span>
                  <span className="text-[15px] font-bold text-primary">选择文件</span>
                  <input
                    type="file"
                    accept=".sql,.csv"
                    className="sr-only"
                    aria-label="选择导入文件"
                    disabled={importing}
                    onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <span className="min-w-0 text-on-surface-variant text-[13px] truncate" title={file?.name}>
                  {file ? file.name : "未选择任何文件"}
                </span>
              </div>
              <div className="flex w-full flex-wrap items-center justify-end gap-3 md:w-auto">
                <label className="flex min-h-11 items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded text-primary h-4 w-4"
                    disabled={importing}
                    checked={clearExisting}
                    onChange={(e) => setClearExisting(e.target.checked)}
                  />
                  <span className="text-[15px] font-semibold text-on-surface-variant">
                    导入前清空该街区同源数据
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => void onImport()}
                  disabled={!file || !streetName.trim() || importing}
                  className="bg-primary text-white px-6 py-2 rounded-full text-[15px] font-bold hover:opacity-90 shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                >
                  {importing ? "解析导入中…" : "解析并导入"}
                </button>
              </div>
            </div>

            {error && (
              <p className="mt-4 text-sm text-error" role="alert">
                {error}
              </p>
            )}
          </section>

          {/* 导入结果 */}
          {result && (
            <section className="border border-divider rounded-2xl p-4 sm:p-6 bg-surface-container-lowest space-y-4">
              <h2 className="text-xl font-bold">导入结果</h2>
              <div className="flex flex-wrap gap-3 text-[13px]">
                <Stat label="街区" value={result.street.name} />
                <Stat label="识别格式" value={result.detected_format} />
                <Stat label="来源" value={SOURCE_CN[result.source] ?? result.source} />
                <Stat label="总行数" value={result.total_rows} />
                <Stat label="新增" value={result.inserted} />
                <Stat label="更新" value={result.updated} />
                <Stat label="跳过" value={result.skipped} />
              </div>
              <div>
                <h3 className="text-[13px] font-semibold mb-2 text-on-surface-variant">字段覆盖率</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(result.field_coverage).map(([k, v]) => (
                    <span
                      key={k}
                      className="text-[11px] bg-surface-container-low px-2 py-1 rounded-full text-on-surface-variant"
                    >
                      {k}: {(v * 100).toFixed(0)}%
                    </span>
                  ))}
                </div>
              </div>
              {result.warnings.length > 0 && (
                <ul className="text-[12px] text-tertiary list-disc pl-5">
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* 已收录街区（Bento 卡片，吸顶：滚动长表时始终可切换街区） */}
          <section className="py-2">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="text-xl font-bold">已收录街区 (事实层)</h2>
              {streets.length > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="向左滚动"
                    onClick={() => scrollStreets(-1)}
                    className="w-11 h-11 flex items-center justify-center rounded-full border border-divider text-on-surface-variant hover:bg-surface-container-low transition-colors"
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">chevron_left</span>
                  </button>
                  <button
                    type="button"
                    aria-label="向右滚动"
                    onClick={() => scrollStreets(1)}
                    className="w-11 h-11 flex items-center justify-center rounded-full border border-divider text-on-surface-variant hover:bg-surface-container-low transition-colors"
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">chevron_right</span>
                  </button>
                </div>
              )}
            </div>
            <div
              ref={streetScrollRef}
              aria-label="已收录街区" className="flex gap-4 overflow-x-auto py-1"
            >
              {streets.map((s) => {
                const active = activeStreetId === s.street_id;
                return (
                  <button
                    key={s.street_id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => void loadRows(s.street_id, "all")}
                    className={`shrink-0 w-64 text-left rounded-2xl p-4 border transition-all hover:bg-surface-container-low cursor-pointer ${
                      active
                        ? "border-primary bg-surface-container-low"
                        : "border-divider"
                    }`}
                  >
                    <div className="flex min-w-0 flex-wrap justify-between items-start gap-2 mb-3">
                      <h3 className="text-xl font-bold">{s.street_name}</h3>
                      <span className="text-on-surface-variant text-[13px]">
                        {[s.city, s.district].filter(Boolean).join(" ") || ""}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-on-surface-variant text-[13px]">
                      <span>共 {s.poi_total}</span>
                      <span>高德 {s.amap_count}</span>
                      <span>点评 {s.dianping_count}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {s.has_profile ? (
                        <>
                          <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-success">
                            check_circle
                          </span>
                          <span className="text-[13px] text-success">画像已生成</span>
                        </>
                      ) : (
                        <>
                          <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-on-surface-variant">
                            radio_button_unchecked
                          </span>
                          <span className="text-[13px] text-on-surface-variant">尚无画像</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
              {loadingStreets && <p role="status" className="text-on-surface-variant">正在加载街区…</p>}
              {streetsError && <ResourceFeedback error={streetsError} onRetry={() => void loadInitial()} />}
              {!loadingStreets && !streetsError && streets.length === 0 && (
                <p className="text-[15px] text-on-surface-variant">暂无数据，先上传导入。</p>
              )}
            </div>
          </section>

          {/* POI 明细表 */}
          {activeStreetId != null && (
            <section className="border border-divider rounded-2xl overflow-hidden bg-surface-container-lowest">
              <div className="px-6 py-4 border-b border-divider flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-xl font-bold">
                  POI 明细 (前 {rows.length} / 共 {rowsTotal})
                </h2>
                <div aria-label="POI 来源" className="flex max-w-full flex-wrap bg-surface-container rounded-full p-1">
                  {["all", "amap", "dianping"].map((s) => {
                    const active = sourceFilter === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={active}
                        onClick={() => void loadRows(activeStreetId, s)}
                        className={`px-5 py-1 rounded-full text-[15px] font-semibold transition-colors ${
                          active
                            ? "bg-white shadow-sm text-primary"
                            : "text-on-surface-variant hover:bg-white/50"
                        }`}
                      >
                        {SOURCE_CN[s]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {rowsError && <div className="p-4"><ResourceFeedback error={rowsError} onRetry={() => void (rows.length > 0 ? loadMore() : loadRows(activeStreetId, sourceFilter))} /></div>}
              <div tabIndex={0} role="region" aria-label="POI 明细表，可横向滚动" aria-busy={loadingRows} className="overflow-x-auto">
                <table className="w-full min-w-170 table-fixed text-left border-collapse">
                  <caption className="sr-only">所选街区的 POI 来源、分类、评分、人均消费与连锁状态</caption>
                  <thead>
                    <tr className="bg-surface-container-low border-b border-divider text-[15px] font-semibold text-on-surface-variant">
                      <th scope="col" className="w-[30%] whitespace-nowrap px-3 sm:px-4 py-3">名称</th>
                      <th scope="col" className="w-[16%] whitespace-nowrap px-3 sm:px-4 py-3">来源</th>
                      <th scope="col" className="w-[24%] whitespace-nowrap px-3 sm:px-4 py-3">分类</th>
                      <th scope="col" className="whitespace-nowrap px-3 sm:px-4 py-3">评分</th>
                      <th scope="col" className="whitespace-nowrap px-3 sm:px-4 py-3">人均</th>
                      <th scope="col" className="whitespace-nowrap px-3 sm:px-4 py-3">连锁</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider">
                    {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-surface-container-low transition-colors">
                        <td className="px-3 sm:px-4 py-3 text-[15px] tabular-nums">{String(r.name ?? "")}</td>
                        <td className="px-3 sm:px-4 py-3 text-[13px] text-on-surface-variant whitespace-nowrap">
                          {SOURCE_CN[String(r.source)] ?? String(r.source ?? "")}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-[13px] text-on-surface-variant">
                          {String(r.category_l2 ?? r.cuisine ?? r.category_l1 ?? "")}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-[15px] tabular-nums">
                          {r.rating != null ? String(r.rating) : "—"}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-[15px] tabular-nums">
                          {r.avg_price != null ? String(r.avg_price) : "—"}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-[13px] text-on-surface-variant whitespace-nowrap">
                          {Number(r.is_chain) === 1 ? "是" : "否"}
                        </td>
                      </tr>
                    ))}
                    {loadingRows && <tr><td colSpan={6} className="p-8 text-center" role="status">正在加载 POI 明细…</td></tr>}
                    {!loadingRows && !rowsError && rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 sm:px-4 py-8 text-center text-[15px] text-on-surface-variant">
                          该来源暂无数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {!loadingRows && rows.length < rowsTotal && (
                <div className="px-6 py-3 border-t border-divider bg-surface-container-lowest flex justify-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="text-primary text-[15px] font-semibold hover:bg-surface-container-low px-6 py-2 rounded-full transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? "加载中…" : "查看更多"}
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      </main>
      {confirmImport && <ResourceDialog title="确认替换街区数据？" onClose={() => setConfirmImport(false)}>
        <p className="text-sm leading-relaxed text-on-surface-variant">将清空「{streetName.trim()}」已有的同源 POI 数据，再导入所选文件。此操作无法撤销。</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={() => setConfirmImport(false)} className="rounded-full border border-divider px-4 py-2 font-semibold">取消</button>
          <button type="button" onClick={() => { setConfirmImport(false); void onImport(true); }} className="rounded-full bg-error px-4 py-2 font-semibold text-white">确认替换并导入</button>
        </div>
      </ResourceDialog>}
      <MobileBottomNav activeHref="/resources" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface-container-low rounded-xl px-3 py-2">
      <div className="text-[10px] text-on-surface-variant uppercase">{label}</div>
      <div className="text-[15px] font-bold tabular-nums">{value}</div>
    </div>
  );
}
