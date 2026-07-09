"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  // 街区卡片横向滚动容器：左右箭头按钮据此滚动
  const streetScrollRef = useRef<HTMLDivElement>(null);

  const scrollStreets = (dir: -1 | 1) => {
    streetScrollRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  };

  // 竖向滚轮转横向：React 的 onWheel 是被动监听，preventDefault 无效，
  // 故用原生非被动监听阻止默认竖滚，避免横滑时页面同时竖向滚动。
  useEffect(() => {
    const el = streetScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || e.deltaX !== 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const reloadStreets = async () => {
    try {
      return await listResourceStreets();
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载街区失败");
      return [];
    }
  };

  // 加载某街区某来源的首页明细（重置列表）
  const loadRows = async (streetId: number, source: string) => {
    setActiveStreetId(streetId);
    setSourceFilter(source);
    const data = await listPoiRows({
      streetId,
      source: source === "all" ? undefined : source,
      limit: PAGE_SIZE,
      offset: 0,
    });
    setRows(data.items);
    setRowsTotal(data.total);
  };

  useEffect(() => {
    (async () => {
      const list = await reloadStreets();
      setStreets(list);
      // 默认展示第一个已收录街区的事实层明细
      if (list.length > 0) {
        await loadRows(list[0].street_id, "all");
      }
    })();
  }, []);

  // 查看更多：按当前偏移追加下一页
  const loadMore = async () => {
    if (activeStreetId == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await listPoiRows({
        streetId: activeStreetId,
        source: sourceFilter === "all" ? undefined : sourceFilter,
        limit: PAGE_SIZE,
        offset: rows.length,
      });
      setRows((prev) => [...prev, ...data.items]);
      setRowsTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载更多失败");
    } finally {
      setLoadingMore(false);
    }
  };

  const onImport = async () => {
    if (!file || !streetName.trim() || importing) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const r = await importPoiFile(
        file,
        { street_name: streetName.trim(), city: city || undefined, district: district || undefined },
        clearExisting,
      );
      setResult(r);
      setStreets(await reloadStreets());
      await loadRows(r.street.id, "all");
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white text-[#0f1419]">
      <Sidebar activeHref="/resources" />
      <main className="flex-1 min-w-0 md:ml-64 pb-24 lg:pb-12">
        {/* 顶部栏 */}
        <header className="sticky top-0 z-40 flex items-center gap-4 px-6 h-14 bg-white/80 backdrop-blur-md border-b border-[#eff3f4]">
          <Link href="/resources" className="flex items-center text-primary-container">
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <h2 className="text-xl font-bold text-[#0f1419]">POI 数据导入</h2>
        </header>

        <div className="max-w-250 mx-auto p-4 lg:p-6 space-y-6">
          {/* 上传区（Dropzone 风格） */}
          <section className="border border-[#eff3f4] rounded-2xl p-6 bg-white">
            <div className="flex items-start gap-4 mb-6">
              <div className="bg-surface-container-low w-12 h-12 rounded-full flex items-center justify-center text-primary-container shrink-0">
                <span className="material-symbols-outlined">upload_file</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold mb-1">上传并导入</h3>
                <p className="text-[#536471] text-[15px] leading-relaxed">
                  支持高德 / 大众点评导出的 .sql 或 .csv。系统会自动识别格式，解析后写入事实层
                  street_poi。本页只负责事实层导入，画像生成请前往「街巷画像」页。
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="space-y-1">
                <label className="text-[13px] font-semibold px-1 text-[#536471]">城市</label>
                <input
                  className="w-full border border-[#eff3f4] rounded-xl px-3 py-2 text-[15px] focus:border-primary-container transition-colors outline-none"
                  placeholder="输入城市"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[13px] font-semibold px-1 text-[#536471]">
                  行政区 (可选)
                </label>
                <input
                  className="w-full border border-[#eff3f4] rounded-xl px-3 py-2 text-[15px] focus:border-primary-container transition-colors outline-none"
                  placeholder="输入行政区"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[13px] font-semibold px-1 text-[#536471]">
                  街区名称 (如 新天地)
                </label>
                <input
                  className="w-full border border-[#eff3f4] rounded-xl px-3 py-2 text-[15px] focus:border-primary-container transition-colors outline-none"
                  placeholder="输入街区名称"
                  value={streetName}
                  onChange={(e) => setStreetName(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t border-[#eff3f4]">
              <div className="flex items-center gap-3">
                <label className="cursor-pointer hover:bg-surface-variant transition-colors px-5 py-2 rounded-full flex items-center gap-2 border border-[#eff3f4]">
                  <span className="material-symbols-outlined text-[20px] text-primary-container">
                    attach_file
                  </span>
                  <span className="text-[15px] font-bold text-primary-container">选择文件</span>
                  <input
                    type="file"
                    accept=".sql,.csv"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <span className="text-[#536471] text-[13px] truncate max-w-50">
                  {file ? file.name : "未选择任何文件"}
                </span>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded text-primary-container h-4 w-4"
                    checked={clearExisting}
                    onChange={(e) => setClearExisting(e.target.checked)}
                  />
                  <span className="text-[15px] font-semibold text-[#536471]">
                    导入前清空该街区同源数据
                  </span>
                </label>
                <button
                  type="button"
                  onClick={onImport}
                  disabled={!file || !streetName.trim() || importing}
                  className="bg-primary-container text-on-primary-fixed px-6 py-2 rounded-full text-[15px] font-bold hover:opacity-90 shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
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
            <section className="border border-[#eff3f4] rounded-2xl p-6 bg-white space-y-4">
              <h3 className="text-xl font-bold">导入结果</h3>
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
                <h4 className="text-[13px] font-semibold mb-2 text-[#536471]">字段覆盖率</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(result.field_coverage).map(([k, v]) => (
                    <span
                      key={k}
                      className="text-[11px] bg-surface-container-low px-2 py-1 rounded-full text-[#536471]"
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
          <section className="sticky top-14 z-30 bg-white/95 backdrop-blur-md py-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">已收录街区 (事实层)</h3>
              {streets.length > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="向左滚动"
                    onClick={() => scrollStreets(-1)}
                    className="w-8 h-8 flex items-center justify-center rounded-full border border-[#eff3f4] text-[#536471] hover:bg-[#f7f9f9] transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                  </button>
                  <button
                    type="button"
                    aria-label="向右滚动"
                    onClick={() => scrollStreets(1)}
                    className="w-8 h-8 flex items-center justify-center rounded-full border border-[#eff3f4] text-[#536471] hover:bg-[#f7f9f9] transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                  </button>
                </div>
              )}
            </div>
            <div
              ref={streetScrollRef}
              className="flex gap-4 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0"
            >
              {streets.map((s) => {
                const active = activeStreetId === s.street_id;
                return (
                  <button
                    key={s.street_id}
                    type="button"
                    onClick={() => loadRows(s.street_id, "all")}
                    className={`shrink-0 w-64 text-left rounded-2xl p-4 border transition-all hover:bg-[#f7f9f9] cursor-pointer ${
                      active
                        ? "border-primary-container bg-surface-container-low"
                        : "border-[#eff3f4]"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="text-xl font-bold">{s.street_name}</h4>
                      <span className="text-[#536471] text-[13px]">
                        {[s.city, s.district].filter(Boolean).join(" ") || ""}
                      </span>
                    </div>
                    <div className="flex gap-4 text-[#536471] text-[13px]">
                      <span>共 {s.poi_total}</span>
                      <span>高德 {s.amap_count}</span>
                      <span>点评 {s.dianping_count}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {s.has_profile ? (
                        <>
                          <span className="material-symbols-outlined text-[16px] text-tertiary">
                            check_circle
                          </span>
                          <span className="text-[13px] text-tertiary">画像已生成</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[16px] text-[#536471]">
                            radio_button_unchecked
                          </span>
                          <span className="text-[13px] text-[#536471]">尚无画像</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
              {streets.length === 0 && (
                <p className="text-[15px] text-[#536471]">暂无数据，先上传导入。</p>
              )}
            </div>
          </section>

          {/* POI 明细表 */}
          {activeStreetId != null && (
            <section className="border border-[#eff3f4] rounded-2xl overflow-hidden bg-white">
              <div className="px-6 py-4 border-b border-[#eff3f4] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h3 className="text-xl font-bold">
                  POI 明细 (前 {rows.length} / 共 {rowsTotal})
                </h3>
                <div className="flex bg-surface-container rounded-full p-1">
                  {["all", "amap", "dianping"].map((s) => {
                    const active = sourceFilter === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => loadRows(activeStreetId, s)}
                        className={`px-5 py-1 rounded-full text-[15px] font-semibold transition-colors ${
                          active
                            ? "bg-white shadow-sm text-primary-container"
                            : "text-[#536471] hover:bg-white/50"
                        }`}
                      >
                        {SOURCE_CN[s]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-[#eff3f4] text-[15px] font-semibold text-[#536471]">
                      <th className="px-6 py-3">名称</th>
                      <th className="px-6 py-3">来源</th>
                      <th className="px-6 py-3">分类</th>
                      <th className="px-6 py-3">评分</th>
                      <th className="px-6 py-3">人均</th>
                      <th className="px-6 py-3">连锁</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eff3f4]">
                    {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-[#f7f9f9] transition-colors">
                        <td className="px-6 py-3 text-[15px]">{String(r.name ?? "")}</td>
                        <td className="px-6 py-3 text-[13px] text-[#536471]">
                          {SOURCE_CN[String(r.source)] ?? String(r.source ?? "")}
                        </td>
                        <td className="px-6 py-3 text-[13px] text-[#536471]">
                          {String(r.category_l2 ?? r.cuisine ?? r.category_l1 ?? "")}
                        </td>
                        <td className="px-6 py-3 text-[15px]">
                          {r.rating != null ? String(r.rating) : "—"}
                        </td>
                        <td className="px-6 py-3 text-[15px]">
                          {r.avg_price != null ? String(r.avg_price) : "—"}
                        </td>
                        <td className="px-6 py-3 text-[13px] text-[#536471]">
                          {Number(r.is_chain) === 1 ? "是" : "否"}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-[15px] text-[#536471]">
                          该来源暂无数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {rows.length < rowsTotal && (
                <div className="px-6 py-3 border-t border-[#eff3f4] bg-white flex justify-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="text-primary-container text-[15px] font-semibold hover:bg-[#f7f9f9] px-6 py-2 rounded-full transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? "加载中…" : "查看更多"}
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      </main>
      <MobileBottomNav activeHref="/resources" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface-container-low rounded-xl px-3 py-2">
      <div className="text-[10px] text-[#536471] uppercase">{label}</div>
      <div className="text-[15px] font-bold tabular-nums">{value}</div>
    </div>
  );
}
