"use client";

import { useEffect, useRef, useState } from "react";
import ResourceDialog from "../../components/ResourceDialog";
import ResourceFeedback from "../../components/ResourceFeedback";
import ResourceHeader from "../../components/ResourceHeader";
import Sidebar from "../../components/Sidebar";
import MobileBottomNav from "../../components/MobileBottomNav";
import {
  assetUrl,
  clearAnnotations,
  fetchAnnotationJob,
  importAnnotationXlsx,
  listAnnotations,
  startAnnotationEmbedding,
  type AnnotationImportResult,
  type AnnotationItem,
  type AnnotationJobStatus,
} from "../../../lib/api";

/* ──────────────────────────────────────────────
 * 人工标注库 /resources/annotations
 * 上传 WPS 标注表格（含 DISPIMG 内嵌图）→ 解析 + 图片落盘 + 属性入库 →
 * 生成多模态向量 → 照片点评时据此匹配并赋予图片属性。
 *
 * 导入与生成向量刻意分两步：导入是秒级同步操作，30 次 embedding 调用走后台任务。
 * ────────────────────────────────────────────── */

const POLL_MS = 1500;

export default function AnnotationsPage() {
  const [pendingAction, setPendingAction] = useState<"import" | "clear" | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [clearExisting, setClearExisting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<AnnotationImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const alive = useRef(true);
  const jobId = useRef<string | null>(null);
  const [pollPaused, setPollPaused] = useState(false);
  const [items, setItems] = useState<AnnotationItem[]>([]);
  const [counts, setCounts] = useState({
    image_count: 0,
    attr_count: 0,
    embedded_count: 0,
  });
  const [job, setJob] = useState<AnnotationJobStatus | null>(null);
  const [busy, setBusy] = useState(false);
  // 轮询定时器：组件卸载或任务结束时清掉，避免离开页面后仍在请求
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = async () => {
    setLoading(true); setListError(null);
    try {
      const data = await listAnnotations({ limit: 200 });
      if (!alive.current) return;
      setTotal(data.total);
      setItems(data.items);
      setCounts({
        image_count: data.image_count,
        attr_count: data.attr_count,
        embedded_count: data.embedded_count,
      });
    } catch (e) {
      if (alive.current) setListError(e instanceof Error ? e.message : "加载标注库失败，请重试。");
    } finally {
      if (alive.current) setLoading(false);
    }
  };

  useEffect(() => {
    alive.current = true;
    // 初始读取，离开页面后忽略响应。
    (async () => {
      await reload();
    })();
    return () => {
      alive.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const onImport = async (confirmed = false) => {
    if (!file || importing || busy || loading || loadingMore || listError) return;
    if (!confirmed && clearExisting && counts.image_count > 0) { setPendingAction("import"); return; }
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const r = await importAnnotationXlsx(file, clearExisting);
      setResult(r);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setImporting(false);
    }
  };

  const pollJob = async () => {
    if (!jobId.current) return;
    setPollPaused(false);
    try {
      const status = await fetchAnnotationJob(jobId.current);
      if (!alive.current) return;
      setJob(status);
      if (status.status === "running") pollRef.current = setTimeout(() => void pollJob(), POLL_MS);
      else { setBusy(false); jobId.current = null; await reload(); }
    } catch (e) {
      if (!alive.current) return;
      setPollPaused(true);
      setError(e instanceof Error ? e.message : "无法查询向量生成进度，请重新查询。");
    }
  };

  const onBuildEmbeddings = async (force: boolean) => {
    if (busy || importing || loading || loadingMore || listError) return;
    setBusy(true); setError(null);
    try {
      const started = await startAnnotationEmbedding(force);
      if (!alive.current) return;
      setJob(started);
      if (pollRef.current) clearTimeout(pollRef.current);
      if (started.status === "running") { jobId.current = started.job_id; void pollJob(); }
      else { setBusy(false); await reload(); }
    } catch (e) {
      if (alive.current) { setError(e instanceof Error ? e.message : "启动向量生成失败"); setBusy(false); }
    }
  };

  const selectFile = (selected: File | null) => {
    setError(null); setResult(null);
    if (selected && (!/\.xlsx$/i.test(selected.name) || selected.size === 0 || selected.size > 300 * 1024 * 1024)) {
      setFile(null);
      setError(selected.size === 0 ? "文件为空，请选择包含标注数据的表格。" : selected.size > 300 * 1024 * 1024 ? "文件不得超过 300 MB，请缩小后重试。" : "请选择 .xlsx 格式的 WPS 标注表格。");
      return;
    }
    setFile(selected);
  };

  const loadMore = async () => {
    if (loadingMore || loading || busy || importing) return;
    setLoadingMore(true); setListError(null);
    try {
      const data = await listAnnotations({ limit: 200, offset: items.length });
      if (alive.current) { setItems((previous) => [...previous, ...data.items]); setTotal(data.total); }
    } catch (e) { if (alive.current) setListError(e instanceof Error ? e.message : "加载更多标注失败，请重试。"); }
    finally { if (alive.current) setLoadingMore(false); }
  };

  const onClear = async (confirmed = false) => {
    if (busy || importing || loading || loadingMore || listError) return;
    if (!confirmed) { setPendingAction("clear"); return; }
    setBusy(true);
    setError(null);
    try {
      await clearAnnotations();
      setResult(null);
      setJob(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "清空失败");
    } finally {
      setBusy(false);
    }
  };

  const pending = Math.max(0, counts.image_count - counts.embedded_count);

  return (
    <div className="flex min-h-screen bg-surface text-on-surface">
      <Sidebar activeHref="/resources" />
      <main className="resource-main flex-1 min-w-0 lg:ml-64">
        <ResourceHeader title="人工标注库" />

        <div className="max-w-250 mx-auto p-4 lg:p-6 space-y-6">
          {/* ──── 上传区 ──── */}
          <section className="border border-divider rounded-2xl p-4 sm:p-6 bg-surface-container-lowest">
            <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-4 gap-y-1 mb-6">
              <div className="sm:row-span-2 bg-surface-container-low w-12 h-12 rounded-full flex items-center justify-center text-primary shrink-0">
                <span aria-hidden="true" className="material-symbols-outlined">upload_file</span>
              </div>
              <h2 className="self-center sm:self-start text-xl font-bold">上传标注表格</h2>
              <p className="col-span-2 sm:col-span-1 sm:col-start-2 text-on-surface-variant text-[15px] leading-relaxed">
                支持 WPS 导出的 .xlsx（图片以 DISPIMG 内嵌在单元格内）。系统解析
                「图片」与「图片属性1~7」两部分：图片落盘并生成向量，属性按
                「指标名：等级成语」拆解入库。照片发起点评时据此匹配最相似的标注图，
                把它的属性赋给本次点评，显示在对应三级指标得分后。
              </p>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t border-divider">
              <div className="flex w-full min-w-0 items-center gap-3 md:flex-1">
                <label className="resource-upload cursor-pointer hover:bg-surface-variant transition-colors px-5 py-2 rounded-full flex items-center gap-2 border border-divider shrink-0">
                  <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">
                    attach_file
                  </span>
                  <span className="text-[15px] font-bold text-primary">
                    选择文件
                  </span>
                  <input
                    type="file"
                    accept=".xlsx"
                    className="sr-only"
                    aria-label="选择导入文件"
                    disabled={importing || busy}
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
                    disabled={busy || importing}
                    checked={clearExisting}
                    onChange={(e) => setClearExisting(e.target.checked)}
                  />
                  <span className="text-[15px] font-semibold text-on-surface-variant">
                    导入前清空标注库
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => void onImport()}
                  disabled={!file || importing || busy || loading || loadingMore || !!listError}
                  className="bg-primary text-white px-6 py-2 rounded-full text-[15px] font-bold hover:opacity-90 shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                >
                  {importing ? "解析中…" : "上传并导入"}
                </button>
              </div>
            </div>
          </section>

          <ResourceFeedback error={error} onRetry={pollPaused ? () => { setError(null); void pollJob(); } : undefined} />

          {/* ──── 导入摘要 ──── */}
          {result && (
            <section role="status" className="border border-divider rounded-2xl p-4 sm:p-6 bg-surface-container-lowest space-y-4">
              <h2 className="text-[15px] font-bold uppercase tracking-widest text-on-surface-variant">
                导入摘要
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="解析行数" value={result.total_rows} />
                <Stat label="新增" value={result.inserted} />
                <Stat label="更新" value={result.updated} />
                <Stat label="属性条数" value={result.attr_total} />
              </div>

              {result.unknown_metrics.length === 0 &&
              result.unknown_grade_words.length === 0 ? (
                <p className="text-[13px] text-success bg-success-container rounded-xl px-4 py-3">
                  全部属性的指标名与等级成语均已识别，无需人工核对。
                </p>
              ) : (
                <div className="space-y-2">
                  {result.unknown_metrics.length > 0 && (
                    <Warn
                      title={`${result.unknown_metrics.length} 个指标名未命中空间美学维度的三级指标`}
                      detail={result.unknown_metrics.join("、")}
                      hint="这些属性已入库，但无法与指标行对齐，前端不会渲染。"
                    />
                  )}
                  {result.unknown_grade_words.length > 0 && (
                    <Warn
                      title={`${result.unknown_grade_words.length} 个等级成语不在已知词表内`}
                      detail={result.unknown_grade_words.join("、")}
                      hint="属性仍会显示，但建议核对是否为错别字。"
                    />
                  )}
                </div>
              )}
            </section>
          )}

          {/* ──── 向量状态 ──── */}
          <section className="border border-divider rounded-2xl p-4 sm:p-6 bg-surface-container-lowest space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-[15px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">
                  向量状态
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
                  <Stat label="标注图" value={loading ? "—" : counts.image_count} />
                  <Stat label="属性" value={loading ? "—" : counts.attr_count} />
                  <Stat label="已生成向量" value={loading ? "—" : counts.embedded_count} />
                  <Stat label="待生成" value={loading ? "—" : pending} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onBuildEmbeddings(false)}
                  disabled={busy || importing || loading || loadingMore || !!listError || counts.image_count === 0}
                  className="bg-primary text-white px-5 py-2 rounded-full text-[15px] font-bold hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                >
                  {busy ? "生成中…" : "生成向量"}
                </button>
                <button
                  type="button"
                  onClick={() => onBuildEmbeddings(true)}
                  disabled={busy || importing || loading || loadingMore || !!listError || counts.image_count === 0}
                  className="border border-divider px-5 py-2 rounded-full text-[15px] font-bold text-on-surface-variant hover:bg-surface-variant transition-colors disabled:opacity-50"
                >
                  全部重算
                </button>
                <button
                  type="button"
                  onClick={() => void onClear()}
                  disabled={busy || importing || loading || loadingMore || !!listError || counts.image_count === 0}
                  className="border border-error/30 text-error px-5 py-2 rounded-full text-[15px] font-bold hover:bg-error/5 transition-colors disabled:opacity-50"
                >
                  清空标注库
                </button>
              </div>
            </div>

            {job && (
              <div role="status" className="pt-4 border-t border-divider space-y-2">
                <div className="flex items-center justify-between text-[13px] font-bold">
                  <span className="text-on-surface-variant">
                    {job.status === "running"
                      ? "正在生成向量…"
                      : job.status === "partial"
                        ? "生成完成（部分失败）"
                        : "生成完成"}
                  </span>
                  <span className="tabular-nums">
                    {job.done} / {job.total}
                    {job.failed > 0 && `（失败 ${job.failed}）`}
                  </span>
                </div>
                <div role="progressbar" aria-label="向量生成进度" aria-valuemin={0} aria-valuemax={job.total || 1} aria-valuenow={Math.min(job.done, job.total)} className="w-full bg-surface-container-low rounded-full h-1">
                  <div
                    className="bg-primary h-1 rounded-full transition-all"
                    style={{
                      width: `${job.total > 0 ? (job.done / job.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                {job.error && (
                  <p className="text-[13px] text-error">
                    最近一次错误：{"请重新查询任务状态，或核对标注图片后重试。"}
                  </p>
                )}
              </div>
            )}

            {counts.image_count > 0 && pending === 0 && (
              <p className="text-[13px] text-on-surface-variant">
                向量已就绪。建议执行一次标定检查匹配质量：
                <code className="mx-1 px-1.5 py-0.5 bg-surface-container-low rounded text-[12px]">
                  python -m app.services.annotation.calibrate
                </code>
                输出两两相似度矩阵与分布报告。
              </p>
            )}
          </section>

          {/* ──── 标注图网格 ──── */}
          <section className="space-y-4">
            <h2 className="text-[15px] font-bold uppercase tracking-widest text-on-surface-variant">
              标注图 {total > 0 && `（已显示 ${items.length} / 共 ${total}）`}
            </h2>
            {listError && <ResourceFeedback error={listError} onRetry={() => void (items.length > 0 ? loadMore() : reload())} />}
            {loading ? <p role="status" className="py-10 text-center text-on-surface-variant">正在加载标注库…</p> : !listError && items.length === 0 ? (
              <div className="border border-dashed border-divider rounded-2xl p-10 text-center text-[15px] text-on-surface-variant">
                标注库为空。上传标注表格后在此查看图片与属性。
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {items.map((it) => (
                  <AnnotationCard key={it.id} item={it} />
                ))}
              </div>
            )}
            {!loading && items.length < total && <button type="button" disabled={loadingMore || busy || importing} onClick={() => void loadMore()} className="mx-auto block rounded-full border border-divider px-6 py-2 font-semibold text-primary">{loadingMore ? "正在加载…" : "加载更多标注"}</button>}
          </section>
        </div>
      </main>
      {pendingAction && <ResourceDialog title={pendingAction === "clear" ? "确认清空标注库？" : "确认替换标注库？"} onClose={() => setPendingAction(null)}>
        <p className="text-sm leading-relaxed text-on-surface-variant">将删除标注库现有图片与属性，且无法恢复。{pendingAction === "import" ? "随后会导入所选表格。" : ""}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={() => setPendingAction(null)} className="rounded-full border border-divider px-4 py-2 font-semibold">取消</button>
          <button type="button" onClick={() => { const action = pendingAction; setPendingAction(null); void (action === "clear" ? onClear(true) : onImport(true)); }} className="rounded-full bg-error px-4 py-2 font-semibold text-white">{pendingAction === "clear" ? "确认清空" : "确认替换并导入"}</button>
        </div>
      </ResourceDialog>}
      <MobileBottomNav activeHref="/resources" />
    </div>
  );
}

/* ──────────────── 局部子组件 ──────────────── */

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-2xl font-black tabular-nums tracking-tight">
        {value}
      </div>
      <div className="text-[11px] text-on-surface-variant font-bold uppercase">
        {label}
      </div>
    </div>
  );
}

function Warn({
  title,
  detail,
  hint,
}: {
  title: string;
  detail: string;
  hint: string;
}) {
  return (
    <div className="bg-warning-container border border-warning-border/30 rounded-xl px-4 py-3">
      <p className="text-[13px] font-bold text-warning">{title}</p>
      <p className="text-[13px] text-warning mt-1 break-words">{detail}</p>
      <p className="text-[12px] text-warning mt-1">{hint}</p>
    </div>
  );
}

function AnnotationCard({ item }: { item: AnnotationItem }) {
  const attrs = item.attributes ?? [];
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <div className="border border-divider rounded-2xl overflow-hidden bg-surface-container-lowest">
      {imageFailed ? <div role="img" aria-label={`${item.file_name}，图片暂不可用`} className="grid h-44 place-items-center bg-surface-container-low p-4 text-center text-sm text-on-surface-variant">图片暂不可用</div> : (
      // eslint-disable-next-line @next/next/no-img-element -- 后端静态图
      <img
        src={assetUrl(item.image_url)}
        alt={item.file_name}
        className="w-full h-44 object-cover bg-surface-container-low"
        loading="lazy"
        onError={() => setImageFailed(true)}
      />)}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span title={item.file_name} className="min-w-0 text-[13px] font-bold break-all">
            {item.file_name}
          </span>
          {item.has_embedding ? (
            <span className="shrink-0 text-[11px] font-bold text-success bg-success-container rounded-md px-2 py-0.5">
              向量就绪
            </span>
          ) : (
            <span className="shrink-0 text-[11px] font-bold text-warning bg-warning-container rounded-md px-2 py-0.5">
              待生成
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {attrs.map((a) => (
            <span
              key={a.attr_index}
              className="max-w-full rounded-md bg-success-container px-2 py-0.5 text-[12px] font-medium text-success"
              title={a.raw_text}
            >
              {a.metric_name ? `${a.metric_name} · ` : ""}
              {a.grade_word ?? a.raw_text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
