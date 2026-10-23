"use client";

import { useEffect, useRef, useState } from "react";
import ResourceDialog from "../../components/ResourceDialog";
import ResourceFeedback from "../../components/ResourceFeedback";
import ResourceShell from "../../components/ResourceShell";
import ResourceContentCard from "../../components/ResourceContentCard";
import {
  API_BASE,
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
  const [pendingAction, setPendingAction] = useState<"import" | "clear" | null>(
    null,
  );
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
    setLoading(true);
    setListError(null);
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
      if (alive.current)
        setListError(
          e instanceof Error ? e.message : "加载标注库失败，请重试。",
        );
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
    if (!file || importing || busy || loading || loadingMore || listError)
      return;
    if (!confirmed && clearExisting && counts.image_count > 0) {
      setPendingAction("import");
      return;
    }
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
      if (status.status === "running")
        pollRef.current = setTimeout(() => void pollJob(), POLL_MS);
      else {
        setBusy(false);
        jobId.current = null;
        await reload();
      }
    } catch (e) {
      if (!alive.current) return;
      setPollPaused(true);
      setError(
        e instanceof Error ? e.message : "无法查询向量生成进度，请重新查询。",
      );
    }
  };

  const onBuildEmbeddings = async (force: boolean) => {
    if (busy || importing || loading || loadingMore || listError) return;
    setBusy(true);
    setError(null);
    try {
      const started = await startAnnotationEmbedding(force);
      if (!alive.current) return;
      setJob(started);
      if (pollRef.current) clearTimeout(pollRef.current);
      if (started.status === "running") {
        jobId.current = started.job_id;
        void pollJob();
      } else {
        setBusy(false);
        await reload();
      }
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : "启动向量生成失败");
        setBusy(false);
      }
    }
  };

  const selectFile = (selected: File | null) => {
    setError(null);
    setResult(null);
    if (
      selected &&
      (!/\.xlsx$/i.test(selected.name) ||
        selected.size === 0 ||
        selected.size > 300 * 1024 * 1024)
    ) {
      setFile(null);
      setError(
        selected.size === 0
          ? "文件为空，请选择包含标注数据的表格。"
          : selected.size > 300 * 1024 * 1024
            ? "文件不得超过 300 MB，请缩小后重试。"
            : "请选择 .xlsx 格式的 WPS 标注表格。",
      );
      return;
    }
    setFile(selected);
  };

  const loadMore = async () => {
    if (loadingMore || loading || busy || importing) return;
    setLoadingMore(true);
    setListError(null);
    try {
      const data = await listAnnotations({ limit: 200, offset: items.length });
      if (alive.current) {
        setItems((previous) => [...previous, ...data.items]);
        setTotal(data.total);
      }
    } catch (e) {
      if (alive.current)
        setListError(
          e instanceof Error ? e.message : "加载更多标注失败，请重试。",
        );
    } finally {
      if (alive.current) setLoadingMore(false);
    }
  };

  const onClear = async (confirmed = false) => {
    if (busy || importing || loading || loadingMore || listError) return;
    if (!confirmed) {
      setPendingAction("clear");
      return;
    }
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
    <ResourceShell title="人工标注库">
      <div className="resource-content resource-data-layout">
        <div className="resource-annotation-heading">
          <div className="resource-section-icon">
            <span aria-hidden="true" className="material-symbols-outlined">
              upload_file
            </span>
          </div>
          <h2 className="resource-section-title">
            导入与向量管理
          </h2>
          <p className="resource-import-description">
            支持 WPS 导出的 .xlsx（图片以 DISPIMG 内嵌在单元格内）。系统解析
            「图片」与「图片属性1~7」两部分：图片落盘并生成向量，属性按
            「指标名：等级成语」拆解入库。照片发起点评时据此匹配最相似的标注图，
            把它的属性赋给本次点评，显示在对应三级指标得分后。
          </p>
        </div>
        <aside
          className={[
            "resource-tool-rail resource-annotation-tools",
            "resource-tools-separated resource-sticky-tools",
          ].join(" ")}
          aria-label="标注库管理"
        >
          <div className="resource-panel resource-annotation-controls">
            <div className="resource-import-actions resource-annotation-import">
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
                    accept=".xlsx"
                    className="sr-only"
                    aria-label="选择导入文件"
                    disabled={importing || busy}
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
                    disabled={busy || importing}
                    checked={clearExisting}
                    onChange={(e) => setClearExisting(e.target.checked)}
                  />
                  <span className="resource-body font-semibold text-on-surface-variant">
                    导入前清空标注库
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => void onImport()}
                  disabled={
                    !file ||
                    importing ||
                    busy ||
                    loading ||
                    loadingMore ||
                    !!listError
                  }
                  className="resource-button resource-button--primary"
                >
                  {importing ? "解析中…" : "上传并导入"}
                </button>
              </div>
            </div>

            <ResourceFeedback
              error={error}
              onRetry={
                pollPaused
                  ? () => {
                    setError(null);
                    void pollJob();
                  }
                  : undefined
              }
            />

            {/* 导入摘要 */}
            {result && (
              <div
                role="status"
                className="resource-annotation-result"
              >
                <p className="resource-detail font-semibold">
                  导入摘要
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Stat label="解析行数" value={result.total_rows} />
                  <Stat label="新增" value={result.inserted} />
                  <Stat label="更新" value={result.updated} />
                  <Stat label="属性条数" value={result.attr_total} />
                </div>

                {result.unknown_metrics.length === 0 &&
                  result.unknown_grade_words.length === 0 ? (
                  <p className="resource-caption text-success bg-success-container rounded-xl px-4 py-3">
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
              </div>
            )}

            {/* 向量状态 */}
            <div className="resource-annotation-vector">
              <div className="resource-annotation-status">
                <div className="resource-stat-grid">
                  <Stat
                    label="标注图"
                    value={loading ? "—" : counts.image_count}
                  />
                  <Stat
                    label="属性"
                    value={loading ? "—" : counts.attr_count}
                  />
                  <Stat
                    label="已生成向量"
                    value={loading ? "—" : counts.embedded_count}
                  />
                  <Stat label="待生成" value={loading ? "—" : pending} />
                </div>
                <div className="resource-annotation-actions">
                  <button
                    type="button"
                    onClick={() => onBuildEmbeddings(false)}
                    disabled={
                      busy ||
                      importing ||
                      loading ||
                      loadingMore ||
                      !!listError ||
                      counts.image_count === 0
                    }
                    className="resource-button resource-button--primary"
                  >
                    {busy ? "生成中…" : "生成向量"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onBuildEmbeddings(true)}
                    disabled={
                      busy ||
                      importing ||
                      loading ||
                      loadingMore ||
                      !!listError ||
                      counts.image_count === 0
                    }
                    className="resource-button resource-button--secondary"
                  >
                    全部重算
                  </button>
                  <button
                    type="button"
                    onClick={() => void onClear()}
                    disabled={
                      busy ||
                      importing ||
                      loading ||
                      loadingMore ||
                      !!listError ||
                      counts.image_count === 0
                    }
                    className="resource-button resource-button--danger"
                  >
                    清空标注库
                  </button>
                </div>
              </div>

              {job && (
                <div
                  role="status"
                  className="pt-4 border-t border-divider space-y-2"
                >
                  <div className="flex items-center justify-between resource-caption font-bold">
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
                  <div
                    role="progressbar"
                    aria-label="向量生成进度"
                    aria-valuemin={0}
                    aria-valuemax={job.total || 1}
                    aria-valuenow={Math.min(job.done, job.total)}
                    className="w-full bg-surface-container-low rounded-full h-1"
                  >
                    <div
                      className="bg-primary h-1 rounded-full transition-all"
                      style={{
                        width: `${job.total > 0 ? (job.done / job.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  {job.error && (
                    <p className="resource-caption text-error">
                      最近一次错误：{"请重新查询任务状态，或核对标注图片后重试。"}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>
        <ResourceContentCard
          label="标注图片与属性"
          className="resource-library"
          variant="stack"
        >
          {counts.image_count > 0 && pending === 0 && (
            <p className="resource-caption text-on-surface-variant">
              向量已就绪。建议执行一次标定检查匹配质量：
              <code className="mx-1 px-1.5 py-0.5 bg-surface-container-low rounded resource-caption">
                python -m app.services.annotation.calibrate
              </code>
              输出两两相似度矩阵与分布报告。
            </p>
          )}

          {/* 标注图网格 */}
          <section className="resource-section">
            <h2 className="resource-section-title">
              标注图 {total > 0 && `（已显示 ${items.length} / 共 ${total}）`}
            </h2>
            {listError && (
              <ResourceFeedback
                error={listError}
                onRetry={() => void (items.length > 0 ? loadMore() : reload())}
              />
            )}
            {loading ? (
              <p
                role="status"
                className="py-10 text-center text-on-surface-variant"
              >
                正在加载标注库…
              </p>
            ) : !listError && items.length === 0 ? (
              <div className={`
                border border-dashed border-divider rounded-2xl p-10 text-center
                resource-body text-on-surface-variant
              `}>
                标注库为空。上传标注表格后在此查看图片与属性。
              </div>
            ) : (
              <div className="resource-annotation-grid">
                {items.map((it) => (
                  <AnnotationCard key={it.id} item={it} />
                ))}
              </div>
            )}
            {!loading && items.length < total && (
              <button
                type="button"
                disabled={loadingMore || busy || importing}
                onClick={() => void loadMore()}
                className="resource-button resource-button--secondary mx-auto"
              >
                {loadingMore ? "正在加载…" : "加载更多标注"}
              </button>
            )}
          </section>
        </ResourceContentCard>
      </div>

      {pendingAction && (
        <ResourceDialog
          title={
            pendingAction === "clear" ? "确认清空标注库？" : "确认替换标注库？"
          }
          onClose={() => setPendingAction(null)}
        >
          <p className="text-sm leading-relaxed text-on-surface-variant">
            将删除标注库现有图片与属性，且无法恢复。
            {pendingAction === "import" ? "随后会导入所选表格。" : ""}
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setPendingAction(null)}
              className="resource-button resource-button--secondary"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                const action = pendingAction;
                setPendingAction(null);
                void (action === "clear" ? onClear(true) : onImport(true));
              }}
              className="resource-button resource-button--destructive"
            >
              {pendingAction === "clear" ? "确认清空" : "确认替换并导入"}
            </button>
          </div>
        </ResourceDialog>
      )}
    </ResourceShell>
  );
}

/* ──────────────── 局部子组件 ──────────────── */

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-2xl font-black tabular-nums tracking-tight">
        {value}
      </div>
      <div className="resource-caption text-on-surface-variant font-bold uppercase">
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
      <p className="resource-caption font-bold text-warning">{title}</p>
      <p className="resource-caption text-warning mt-1 break-words">{detail}</p>
      <p className="resource-caption text-warning mt-1">{hint}</p>
    </div>
  );
}

function AnnotationCard({ item }: { item: AnnotationItem }) {
  const attrs = item.attributes ?? [];
  const originalUrl = assetUrl(item.image_url);
  const fileName = item.image_url.match(
    /^\/static\/annotations\/([0-9a-f]{32}\.(?:jpg|jpeg|png|webp))$/,
  )?.[1];
  const thumbnailUrl = fileName
    ? `${API_BASE}/resource/annotations/${fileName}/thumbnail`
    : null;
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const useThumbnail = thumbnailUrl && !thumbnailFailed;
  return (
    <div className="resource-panel resource-scroll-card">
      {imageFailed ? (
        <div
          role="img"
          aria-label={`${item.file_name}，图片暂不可用`}
          className={`
            resource-annotation-placeholder grid place-items-center
            bg-surface-container-low p-4 text-center text-sm text-on-surface-variant
          `}
        >
          图片暂不可用
        </div>
      ) : (
        <a
          href={originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`查看 ${item.file_name} 原图（新标签页）`}
          className="resource-annotation-image"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 后端提供响应式缩略图 */}
          <img
            src={useThumbnail ? `${thumbnailUrl}?width=384` : originalUrl}
            srcSet={
              useThumbnail
                ? [384, 768, 1152]
                  .map((width) => `${thumbnailUrl}?width=${width} ${width}w`)
                  .join(", ")
                : undefined
            }
            sizes="auto, (min-width: 64rem) 33vw, (min-width: 35rem) 50vw, 100vw"
            alt={item.file_name}
            className="w-full object-cover bg-surface-container-low"
            loading="lazy"
            decoding="async"
            onError={() => {
              if (useThumbnail) setThumbnailFailed(true);
              else setImageFailed(true);
            }}
          />
        </a>
      )}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span
            title={item.file_name}
            className="min-w-0 resource-caption font-bold break-all"
          >
            {item.file_name}
          </span>
          {item.has_embedding ? (
            <span className={`
              shrink-0 resource-caption font-bold text-success bg-success-container
              rounded-md px-2 py-0.5
            `}>
              向量就绪
            </span>
          ) : (
            <span className={`
              shrink-0 resource-caption font-bold text-warning bg-warning-container
              rounded-md px-2 py-0.5
            `}>
              待生成
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {attrs.map((a) => (
            <span
              key={a.attr_index}
              className={`
                max-w-full rounded-md bg-success-container px-2 py-0.5 resource-caption
                font-medium text-success
              `}
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
