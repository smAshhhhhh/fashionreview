"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  const [file, setFile] = useState<File | null>(null);
  const [clearExisting, setClearExisting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<AnnotationImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<AnnotationItem[]>([]);
  const [counts, setCounts] = useState({
    image_count: 0,
    attr_count: 0,
    embedded_count: 0,
  });
  const [job, setJob] = useState<AnnotationJobStatus | null>(null);
  const [busy, setBusy] = useState(false);
  // 轮询定时器：组件卸载或任务结束时清掉，避免离开页面后仍在请求
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reload = async () => {
    try {
      const data = await listAnnotations({ limit: 200 });
      setItems(data.items);
      setCounts({
        image_count: data.image_count,
        attr_count: data.attr_count,
        embedded_count: data.embedded_count,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载标注库失败");
    }
  };

  useEffect(() => {
    // 包一层 async IIFE：setState 落在 await 之后，避免在 effect 体内同步置状态
    (async () => {
      await reload();
    })();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const onImport = async () => {
    if (!file || importing) return;
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

  const onBuildEmbeddings = async (force: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const started = await startAnnotationEmbedding(force);
      setJob(started);
      if (pollRef.current) clearInterval(pollRef.current);
      if (started.status === "running") {
        pollRef.current = setInterval(async () => {
          try {
            const s = await fetchAnnotationJob(started.job_id);
            setJob(s);
            if (s.status !== "running") {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              setBusy(false);
              await reload();
            }
          } catch {
            // 单次轮询失败不终止：下一次可能就恢复了
          }
        }, POLL_MS);
      } else {
        setBusy(false);
        await reload();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "启动向量生成失败");
      setBusy(false);
    }
  };

  const onClear = async () => {
    if (busy) return;
    if (
      !window.confirm(
        "将删除标注库全部图片与属性（含磁盘图片文件），且无法恢复。确定继续？",
      )
    ) {
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

  const pending = counts.image_count - counts.embedded_count;

  return (
    <div className="flex min-h-screen bg-white text-[#0f1419]">
      <Sidebar activeHref="/resources" />
      <main className="flex-1 min-w-0 md:ml-64 pb-24 lg:pb-12">
        <header className="sticky top-0 z-40 flex items-center gap-4 px-6 h-14 bg-white/80 backdrop-blur-md border-b border-[#eff3f4]">
          <Link
            href="/resources"
            className="flex items-center text-primary-container"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <h2 className="text-xl font-bold text-[#0f1419]">人工标注库</h2>
        </header>

        <div className="max-w-250 mx-auto p-4 lg:p-6 space-y-6">
          {/* ──── 上传区 ──── */}
          <section className="border border-[#eff3f4] rounded-2xl p-6 bg-white">
            <div className="flex items-start gap-4 mb-6">
              <div className="bg-surface-container-low w-12 h-12 rounded-full flex items-center justify-center text-primary-container shrink-0">
                <span className="material-symbols-outlined">upload_file</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold mb-1">上传标注表格</h3>
                <p className="text-[#536471] text-[15px] leading-relaxed">
                  支持 WPS 导出的 .xlsx（图片以 DISPIMG 内嵌在单元格内）。系统解析
                  「图片」与「图片属性1~7」两部分：图片落盘并生成向量，属性按
                  「指标名：等级成语」拆解入库。照片发起点评时据此匹配最相似的标注图，
                  把它的属性赋给本次点评，显示在对应三级指标得分后。
                </p>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t border-[#eff3f4]">
              <div className="flex items-center gap-3 min-w-0">
                <label className="cursor-pointer hover:bg-surface-variant transition-colors px-5 py-2 rounded-full flex items-center gap-2 border border-[#eff3f4] shrink-0">
                  <span className="material-symbols-outlined text-[20px] text-primary-container">
                    attach_file
                  </span>
                  <span className="text-[15px] font-bold text-primary-container">
                    选择文件
                  </span>
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <span className="text-[#536471] text-[13px] truncate">
                  {file ? file.name : "未选择任何文件"}
                </span>
              </div>
              <div className="flex items-center gap-6 shrink-0">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded text-primary-container h-4 w-4"
                    checked={clearExisting}
                    onChange={(e) => setClearExisting(e.target.checked)}
                  />
                  <span className="text-[15px] font-semibold text-[#536471]">
                    导入前清空标注库
                  </span>
                </label>
                <button
                  type="button"
                  onClick={onImport}
                  disabled={!file || importing}
                  className="bg-primary-container text-on-primary-fixed px-6 py-2 rounded-full text-[15px] font-bold hover:opacity-90 shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                >
                  {importing ? "解析中…" : "上传并导入"}
                </button>
              </div>
            </div>
          </section>

          {error && (
            <div className="border border-[#f4212e]/30 bg-[#f4212e]/5 rounded-2xl px-5 py-4 text-[15px] text-[#f4212e]">
              {error}
            </div>
          )}

          {/* ──── 导入摘要 ──── */}
          {result && (
            <section className="border border-[#eff3f4] rounded-2xl p-6 bg-white space-y-4">
              <h3 className="text-[15px] font-bold uppercase tracking-widest text-[#536471]">
                导入摘要
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="解析行数" value={result.total_rows} />
                <Stat label="新增" value={result.inserted} />
                <Stat label="更新" value={result.updated} />
                <Stat label="属性条数" value={result.attr_total} />
              </div>

              {result.unknown_metrics.length === 0 &&
              result.unknown_grade_words.length === 0 ? (
                <p className="text-[13px] text-[#1b5e20] bg-[#e8f5e9] rounded-xl px-4 py-3">
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
          <section className="border border-[#eff3f4] rounded-2xl p-6 bg-white space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-[15px] font-bold uppercase tracking-widest text-[#536471] mb-3">
                  向量状态
                </h3>
                <div className="flex items-center gap-8">
                  <Stat label="标注图" value={counts.image_count} />
                  <Stat label="属性" value={counts.attr_count} />
                  <Stat label="已生成向量" value={counts.embedded_count} />
                  <Stat label="待生成" value={pending} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onBuildEmbeddings(false)}
                  disabled={busy || counts.image_count === 0}
                  className="bg-primary-container text-on-primary-fixed px-5 py-2 rounded-full text-[15px] font-bold hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                >
                  {busy ? "生成中…" : "生成向量"}
                </button>
                <button
                  type="button"
                  onClick={() => onBuildEmbeddings(true)}
                  disabled={busy || counts.image_count === 0}
                  className="border border-[#eff3f4] px-5 py-2 rounded-full text-[15px] font-bold text-[#536471] hover:bg-surface-variant transition-colors disabled:opacity-50"
                >
                  全部重算
                </button>
                <button
                  type="button"
                  onClick={onClear}
                  disabled={busy || counts.image_count === 0}
                  className="border border-[#f4212e]/30 text-[#f4212e] px-5 py-2 rounded-full text-[15px] font-bold hover:bg-[#f4212e]/5 transition-colors disabled:opacity-50"
                >
                  清空标注库
                </button>
              </div>
            </div>

            {job && (
              <div className="pt-4 border-t border-[#eff3f4] space-y-2">
                <div className="flex items-center justify-between text-[13px] font-bold">
                  <span className="text-[#536471]">
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
                <div className="w-full bg-surface-container-low rounded-full h-1">
                  <div
                    className="bg-primary-container h-1 rounded-full transition-all"
                    style={{
                      width: `${job.total > 0 ? (job.done / job.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                {job.error && (
                  <p className="text-[13px] text-[#f4212e]">
                    最近一次错误：{job.error}
                  </p>
                )}
              </div>
            )}

            {counts.image_count > 0 && pending === 0 && (
              <p className="text-[13px] text-[#536471]">
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
            <h3 className="text-[15px] font-bold uppercase tracking-widest text-[#536471]">
              标注图 {items.length > 0 && `（${items.length}）`}
            </h3>
            {items.length === 0 ? (
              <div className="border border-dashed border-[#eff3f4] rounded-2xl p-10 text-center text-[15px] text-[#536471]">
                标注库为空。上传标注表格后在此查看图片与属性。
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {items.map((it) => (
                  <AnnotationCard key={it.id} item={it} />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
      <MobileBottomNav activeHref="/resources" />
    </div>
  );
}

/* ──────────────── 局部子组件 ──────────────── */

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-black tabular-nums tracking-tight">
        {value}
      </div>
      <div className="text-[11px] text-[#536471] font-bold uppercase">
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
    <div className="bg-[#fff8e1] border border-[#ffb300]/30 rounded-xl px-4 py-3">
      <p className="text-[13px] font-bold text-[#8d6e00]">{title}</p>
      <p className="text-[13px] text-[#8d6e00] mt-1 break-words">{detail}</p>
      <p className="text-[12px] text-[#8d6e00]/80 mt-1">{hint}</p>
    </div>
  );
}

function AnnotationCard({ item }: { item: AnnotationItem }) {
  const attrs = item.attributes ?? [];
  return (
    <div className="border border-[#eff3f4] rounded-2xl overflow-hidden bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- 后端静态图，无需 next/image 优化 */}
      <img
        src={assetUrl(item.image_url)}
        alt={item.file_name}
        className="w-full h-44 object-cover bg-surface-container-low"
        loading="lazy"
      />
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-bold truncate">
            {item.file_name}
          </span>
          {item.has_embedding ? (
            <span className="shrink-0 text-[11px] font-bold text-[#1b5e20] bg-[#e8f5e9] rounded-md px-2 py-0.5">
              向量就绪
            </span>
          ) : (
            <span className="shrink-0 text-[11px] font-bold text-[#8d6e00] bg-[#fff8e1] rounded-md px-2 py-0.5">
              待生成
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {attrs.map((a) => (
            <span
              key={a.attr_index}
              className="rounded-md bg-[#e8f5e9] px-2 py-0.5 text-[12px] font-medium text-[#1b5e20]"
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
