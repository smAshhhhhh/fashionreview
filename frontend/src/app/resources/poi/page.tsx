"use client";

import { useEffect, useRef, useState } from "react";
import ResourceDialog from "../../components/ResourceDialog";
import ResourceFeedback from "../../components/ResourceFeedback";
import ResourceShell from "../../components/ResourceShell";
import ResourceContentCard from "../../components/ResourceContentCard";
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
    const list = streetScrollRef.current;
    if (!list) return;

    list.scrollBy({
      left: dir * list.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };

  // 竖向滚轮转横向：React 的 onWheel 是被动监听，preventDefault 无效，
  // 故用原生非被动监听阻止默认竖滚，避免横滑时页面同时竖向滚动。
  useEffect(() => {
    const el = streetScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || e.deltaX !== 0) return;
      const canScroll =
        e.deltaY > 0
          ? el.scrollLeft < el.scrollWidth - el.clientWidth - 1
          : el.scrollLeft > 0;
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
      const data = await listPoiRows({
        streetId,
        source: source === "all" ? undefined : source,
        limit: PAGE_SIZE,
        offset: 0,
      });
      if (alive.current && request === rowsRequest.current) {
        setRows(data.items);
        setRowsTotal(data.total);
      }
    } catch (e) {
      if (alive.current && request === rowsRequest.current)
        setRowsError(e instanceof Error ? e.message : "加载明细失败，请重试。");
    } finally {
      if (alive.current && request === rowsRequest.current)
        setLoadingRows(false);
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
      if (alive.current)
        setStreetsError(
          e instanceof Error ? e.message : "加载街区失败，请重试。",
        );
      return [];
    } finally {
      if (alive.current) setLoadingStreets(false);
    }
  };

  const loadInitial = async () => {
    const list = await reloadStreets();
    if (alive.current && list.length > 0)
      await loadRows(list[0].street_id, "all");
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
      } catch (e) {
        if (!cancelled)
          setStreetsError(
            e instanceof Error ? e.message : "加载街区失败，请重试。",
          );
      } finally {
        if (!cancelled) setLoadingStreets(false);
      }
    })();
    return () => {
      cancelled = true;
      alive.current = false;
      ++requests.current;
    };
    // 初始查询，后续切换由事件触发。
  }, []);

  const loadMore = async () => {
    if (activeStreetId == null || loadingRows || moreLock.current) return;
    moreLock.current = true;
    const request = rowsRequest.current;
    setLoadingMore(true);
    setRowsError(null);
    try {
      const data = await listPoiRows({
        streetId: activeStreetId,
        source: sourceFilter === "all" ? undefined : sourceFilter,
        limit: PAGE_SIZE,
        offset: rows.length,
      });
      if (alive.current && request === rowsRequest.current) {
        setRows((prev) => [...prev, ...data.items]);
        setRowsTotal(data.total);
      }
    } catch (e) {
      if (alive.current && request === rowsRequest.current)
        setRowsError(e instanceof Error ? e.message : "加载更多失败，请重试。");
    } finally {
      if (alive.current && request === rowsRequest.current) {
        setLoadingMore(false);
        moreLock.current = false;
      }
    }
  };

  const selectFile = (selected: File | null) => {
    setError(null);
    setResult(null);
    if (
      selected &&
      (!/\.(sql|csv)$/i.test(selected.name) || selected.size === 0)
    ) {
      setFile(null);
      setError(
        selected.size === 0
          ? "文件为空，请选择包含数据的 SQL 或 CSV 文件。"
          : "请选择 .sql 或 .csv 格式的文件。",
      );
      return;
    }
    setFile(selected);
  };

  const onImport = async (confirmed = false) => {
    if (!file || !streetName.trim() || importing) return;
    if (clearExisting && !confirmed) {
      setConfirmImport(true);
      return;
    }
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const r = await importPoiFile(
        file,
        {
          street_name: streetName.trim(),
          city: city.trim() || undefined,
          district: district.trim() || undefined,
        },
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
    <ResourceShell title="POI 数据导入">
      <div className="resource-content resource-data-layout resource-poi-page">
        <div className="resource-upload-heading">
          <div className="resource-section-icon">
            <span aria-hidden="true" className="material-symbols-outlined">
              upload_file
            </span>
          </div>
          <h2 className="resource-section-title">
            上传并导入
          </h2>
          <p className="resource-import-description">
            支持高德、大众点评的 .sql / .csv 文件。
            填写所属街区后导入，即可查看已收录数据。
          </p>
        </div>
        <aside
          className="resource-tool-rail resource-poi-tools"
          aria-label="数据导入"
        >
          <div className="resource-panel resource-panel--padded">
            <div className="resource-import-fields">
              <div className="space-y-1">
                <label
                  htmlFor="poi-city"
                  className="resource-caption font-semibold px-1 text-on-surface-variant"
                >
                  城市
                </label>
                <input
                  id="poi-city"
                  disabled={importing}
                  className="resource-field w-full"
                  placeholder="输入城市"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="poi-district"
                  className="resource-caption font-semibold px-1 text-on-surface-variant"
                >
                  行政区 (可选)
                </label>
                <input
                  id="poi-district"
                  disabled={importing}
                  className="resource-field w-full"
                  placeholder="输入行政区"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="poi-streetName"
                  className="resource-caption font-semibold px-1 text-on-surface-variant"
                >
                  街区名称 (如 新天地)
                </label>
                <input
                  id="poi-streetName"
                  disabled={importing}
                  className="resource-field w-full"
                  placeholder="输入街区名称"
                  value={streetName}
                  onChange={(e) => setStreetName(e.target.value)}
                />
              </div>
            </div>

            <div className="resource-import-actions">
              <div className="resource-file-picker">
                <label className="resource-upload resource-button">
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined resource-icon text-primary"
                  >
                    attach_file
                  </span>
                  <span className="resource-body font-bold text-primary">
                    选择文件
                  </span>
                  <input
                    type="file"
                    accept=".sql,.csv"
                    className="sr-only"
                    aria-label="选择导入文件"
                    disabled={importing}
                    onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <span
                  className="min-w-0 text-on-surface-variant resource-caption truncate"
                  title={file?.name}
                >
                  {file ? file.name : "未选择任何文件"}
                </span>
              </div>
              <div className="resource-import-submit">
                <label className="flex min-h-11 items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded text-primary h-4 w-4"
                    disabled={importing}
                    checked={clearExisting}
                    onChange={(e) => setClearExisting(e.target.checked)}
                  />
                  <span className="resource-body font-semibold text-on-surface-variant">
                    导入前清空该街区同源数据
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => void onImport()}
                  disabled={!file || !streetName.trim() || importing}
                  className="resource-button resource-button--primary"
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
          </div>
        </aside>
        {result && (
          <section className="resource-poi-group">
            <h2 className="resource-section-title">导入结果</h2>
            <div className="resource-panel resource-panel--padded">
              <div className="flex flex-wrap gap-3 resource-caption">
                <Stat label="街区" value={result.street.name} />
                <Stat label="识别格式" value={result.detected_format} />
                <Stat
                  label="来源"
                  value={SOURCE_CN[result.source] ?? result.source}
                />
                <Stat label="总行数" value={result.total_rows} />
                <Stat label="新增" value={result.inserted} />
                <Stat label="更新" value={result.updated} />
                <Stat label="跳过" value={result.skipped} />
              </div>
              {result.warnings.length > 0 && (
                <ul className="mt-4 resource-caption text-warning list-disc pl-5">
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
            <h3 className="font-semibold text-on-surface-variant resource-item-title">
              字段覆盖率
            </h3>
            <div className="resource-panel resource-panel--padded">
              <div className="flex flex-wrap gap-2">
                {Object.entries(result.field_coverage).map(([k, v]) => (
                  <span
                    key={k}
                    className={`
                      resource-caption bg-surface-container-low px-2 py-1 rounded-full
                      text-on-surface-variant
                    `}
                  >
                    {k}: {(v * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 已收录街区标题：随页面滚走，不参与吸顶 */}
        <div className="resource-carousel-heading">
          <h2 id="poi-streets-heading" className="resource-section-title">
            已收录街区 (事实层)
          </h2>
          {streets.length > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="向左滚动"
                onClick={() => scrollStreets(-1)}
                className="resource-button resource-button--secondary resource-button--icon"
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined resource-icon"
                >
                  chevron_left
                </span>
              </button>
              <button
                type="button"
                aria-label="向右滚动"
                onClick={() => scrollStreets(1)}
                className="resource-button resource-button--secondary resource-button--icon"
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined resource-icon"
                >
                  chevron_right
                </span>
              </button>
            </div>
          )}
        </div>
        {/* 街区卡片单独吸顶：须是页面布局的直接子元素，sticky 才能贯穿整页滚动 */}
        <div
          ref={streetScrollRef}
          role="region"
          tabIndex={0}
          aria-labelledby="poi-streets-heading"
          className="resource-street-items resource-poi-streets resource-sticky-tools"
        >
          {streets.map((s) => {
            const active = activeStreetId === s.street_id;
            return (
              <button
                key={s.street_id}
                type="button"
                aria-pressed={active}
                onClick={() => void loadRows(s.street_id, "all")}
                className={`resource-list-item resource-street-card ${active
                    ? "resource-list-item--selected"
                    : ""
                  }`}
              >
                <div className="flex min-w-0 flex-wrap justify-between items-start gap-2 mb-3">
                  <h3 className="resource-item-title">{s.street_name}</h3>
                  <span className="text-on-surface-variant resource-caption">
                    {[s.city, s.district].filter(Boolean).join(" ") || ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-on-surface-variant resource-caption">
                  <span>共 {s.poi_total}</span>
                  <span>高德 {s.amap_count}</span>
                  <span>点评 {s.dianping_count}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {s.has_profile ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="material-symbols-outlined resource-icon text-success"
                      >
                        check_circle
                      </span>
                      <span className="resource-caption text-success">
                        画像已生成
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        aria-hidden="true"
                        className="material-symbols-outlined resource-icon text-on-surface-variant"
                      >
                        radio_button_unchecked
                      </span>
                      <span className="resource-caption text-on-surface-variant">
                        尚无画像
                      </span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
          {loadingStreets && (
            <p role="status" className="text-on-surface-variant">
              正在加载街区…
            </p>
          )}
          {streetsError && (
            <ResourceFeedback
              error={streetsError}
              onRetry={() => void loadInitial()}
            />
          )}
          {!loadingStreets && !streetsError && streets.length === 0 && (
            <p className="resource-body text-on-surface-variant">
              暂无数据，先上传导入。
            </p>
          )}
        </div>

        <ResourceContentCard
          label="POI 明细"
          className="resource-library resource-poi-library"
          variant="stack"
        >
          {/* POI 明细表 */}
          {activeStreetId != null && (
            <section
              className="resource-poi-group"
              aria-labelledby="poi-table-heading"
            >
              <div className="resource-poi-heading">
                <h2 id="poi-table-heading" className="resource-section-title">
                  POI 明细 (前 {rows.length} / 共 {rowsTotal})
                </h2>
                <div
                  aria-label="POI 来源"
                  className="resource-segmented"
                >
                  {["all", "amap", "dianping"].map((s) => {
                    const active = sourceFilter === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={active}
                        onClick={() => void loadRows(activeStreetId, s)}
                      >
                        {SOURCE_CN[s]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="resource-panel resource-scroll-card resource-poi-table-card">
                {rowsError && (
                  <div className="p-4">
                    <ResourceFeedback
                      error={rowsError}
                      onRetry={() =>
                        void (rows.length > 0
                          ? loadMore()
                          : loadRows(activeStreetId, sourceFilter))
                      }
                    />
                  </div>
                )}
                <div
                  tabIndex={0}
                  role="region"
                  aria-label="POI 明细表，可横向滚动"
                  aria-busy={loadingRows}
                  className="overflow-x-auto"
                >
                  <table className="resource-poi-table w-full min-w-170 table-fixed text-left border-collapse">
                    <caption className="sr-only">
                      所选街区的 POI 来源、分类、评分、人均消费与连锁状态
                    </caption>
                    <thead>
                      <tr className={`
                        bg-surface-container-low border-b border-divider resource-body
                        font-semibold text-on-surface-variant
                      `}>
                        <th
                          scope="col"
                          className="whitespace-nowrap px-3 sm:px-4 py-3"
                        >
                          名称
                        </th>
                        <th
                          scope="col"
                          className="whitespace-nowrap px-3 sm:px-4 py-3"
                        >
                          来源
                        </th>
                        <th
                          scope="col"
                          className="whitespace-nowrap px-3 sm:px-4 py-3"
                        >
                          分类
                        </th>
                        <th
                          scope="col"
                          className="whitespace-nowrap px-3 sm:px-4 py-3"
                        >
                          评分
                        </th>
                        <th
                          scope="col"
                          className="whitespace-nowrap px-3 sm:px-4 py-3"
                        >
                          人均
                        </th>
                        <th
                          scope="col"
                          className="whitespace-nowrap px-3 sm:px-4 py-3"
                        >
                          连锁
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-divider">
                      {rows.map((r, i) => (
                        <tr
                          key={i}
                          className="hover:bg-surface-container-low transition-colors"
                        >
                          <td className="px-3 sm:px-4 py-3 resource-body tabular-nums">
                            {String(r.name ?? "")}
                          </td>
                          <td className={`
                            px-3 sm:px-4 py-3 resource-caption text-on-surface-variant
                            whitespace-nowrap
                          `}>
                            {SOURCE_CN[String(r.source)] ??
                              String(r.source ?? "")}
                          </td>
                          <td className="px-3 sm:px-4 py-3 resource-caption text-on-surface-variant">
                            {String(
                              r.category_l2 ?? r.cuisine ?? r.category_l1 ?? "",
                            )}
                          </td>
                          <td className="px-3 sm:px-4 py-3 resource-body tabular-nums">
                            {r.rating != null ? String(r.rating) : "—"}
                          </td>
                          <td className="px-3 sm:px-4 py-3 resource-body tabular-nums">
                            {r.avg_price != null ? String(r.avg_price) : "—"}
                          </td>
                          <td className={`
                            px-3 sm:px-4 py-3 resource-caption text-on-surface-variant
                            whitespace-nowrap
                          `}>
                            {Number(r.is_chain) === 1 ? "是" : "否"}
                          </td>
                        </tr>
                      ))}
                      {loadingRows && (
                        <tr>
                          <td
                            colSpan={6}
                            className="p-8 text-center"
                            role="status"
                          >
                            正在加载 POI 明细…
                          </td>
                        </tr>
                      )}
                      {!loadingRows && !rowsError && rows.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-3 sm:px-4 py-8 text-center resource-body text-on-surface-variant"
                          >
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
                      className="resource-button resource-button--quiet"
                    >
                      {loadingMore ? "加载中…" : "查看更多"}
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}
        </ResourceContentCard>
      </div>

      {confirmImport && (
        <ResourceDialog
          title="确认替换街区数据？"
          onClose={() => setConfirmImport(false)}
        >
          <p className="text-sm leading-relaxed text-on-surface-variant">
            将清空「{streetName.trim()}」已有的同源 POI
            数据，再导入所选文件。此操作无法撤销。
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirmImport(false)}
              className="resource-button resource-button--secondary"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmImport(false);
                void onImport(true);
              }}
              className="resource-button resource-button--destructive"
            >
              确认替换并导入
            </button>
          </div>
        </ResourceDialog>
      )}
    </ResourceShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="resource-import-stat">
      <div className="resource-caption text-on-surface-variant uppercase">
        {label}
      </div>
      <div className="resource-body font-bold tabular-nums">{value}</div>
    </div>
  );
}
