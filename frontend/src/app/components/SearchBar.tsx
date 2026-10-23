"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { submitImageAnalysis, submitTextAnalysis } from "../../lib/api";
import { ApiRequestError } from "../../lib/request";
import { ACTIVE_TASK_KEY } from "./ActiveTaskGuard";

const PENDING_SUBMISSION_KEY = "pendingAnalysisSubmission";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
type Phase = "restoring" | "idle" | "submitting" | "unknown";
type InputError = { message: string; field?: "text" | "image" };

function clearPendingSubmission() {
  try { sessionStorage.removeItem(PENDING_SUBMISSION_KEY); } catch { /* storage is optional */ }
}

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>("restoring");
  const [error, setError] = useState<InputError | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryInputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const inFlight = useRef(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const router = useRouter();
  const busy = phase === "submitting" || phase === "restoring";
  const blocked = phase !== "idle";

  useEffect(() => {
    mounted.current = true;
    let pending: string | null = null;
    try { pending = sessionStorage.getItem(PENDING_SUBMISSION_KEY); } catch { /* storage is optional */ }
    // Restore interrupted submissions instead of silently allowing another POST.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase(pending ? "unknown" : "idle");
    if (pending) {
      inFlight.current = true;
      setQuery(pending);
      setError({ message: "上次提交的受理结果尚未确认，请先核对历史记录，避免重复提交。" });
    }
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  const submit = async (text?: string, file?: File) => {
    if (blocked || inFlight.current) return;
    const q = file ? "照片点评" : (text ?? query).trim();
    if (!q) {
      setError({ message: "请输入街巷名称后再开始分析。", field: "text" });
      queryInputRef.current?.focus();
      return;
    }
    if (file && (!IMAGE_TYPES.includes(file.type) || !file.size || file.size > 10 * 1024 * 1024)) {
      setError({
        message: !IMAGE_TYPES.includes(file.type)
          ? "请选择 JPEG、PNG 或 WebP 图片。"
          : !file.size ? "这张图片为空，请重新选择。" : "图片超过 10 MB，请压缩后重新选择。",
        field: "image",
      });
      return;
    }
    // The ref also prevents duplicates before React commits the disabled state.
    inFlight.current = true;
    if (!file) setQuery(q);
    setPhase("submitting");
    setError(null);
    const controller = new AbortController();
    request.current = controller;
    try { sessionStorage.setItem(PENDING_SUBMISSION_KEY, q); } catch { /* storage is optional */ }
    try {
      const { task_id } = file
        ? await submitImageAnalysis(file, undefined, { signal: controller.signal })
        : await submitTextAnalysis(q, undefined, { signal: controller.signal });
      if (!mounted.current) return;
      try { localStorage.setItem(ACTIVE_TASK_KEY, String(task_id)); } catch { /* storage is optional */ }
      clearPendingSubmission();
      router.push(`/progress?taskId=${task_id}&q=${encodeURIComponent(q)}`);
    } catch (cause) {
      if (!mounted.current) return;
      const unknown = cause instanceof ApiRequestError && cause.outcomeUnknown;
      if (!unknown) {
        clearPendingSubmission();
        inFlight.current = false;
      }
      setPhase(unknown ? "unknown" : "idle");
      setError({
        message: unknown
          ? "暂未确认是否已创建评价。请先核对历史记录，避免重复提交。"
          : cause instanceof Error ? cause.message : "提交失败，请稍后重试。",
      });
    } finally {
      if (request.current === controller) request.current = null;
    }
  };

  return (
    <section aria-labelledby="home-title" className="flex flex-col items-center gap-4 text-center py-6">
      <h1 id="home-title" className="text-2xl sm:text-3xl text-balance font-extrabold tracking-tight text-brand">为每个角落注入潮流洞察</h1>
      <p className="text-base text-on-surface-variant max-w-md leading-relaxed text-pretty">利用先进的计算机视觉和本地趋势图谱分析实时街头风格数据</p>
      <form className="w-full mt-4" noValidate onSubmit={(event) => {
        event.preventDefault();
        if (!composing.current) void submit();
      }}>
        <label htmlFor="street-query" className="sr-only">街巷名称</label>
        <p id="street-help" className="sr-only">输入街巷名称，按 Enter 或选择开始分析。</p>
        <p id="image-help" className="sr-only">支持 JPEG、PNG、WebP 图片，大小不超过 10 MB。</p>
        <div className="flex items-center gap-3">
          <div className="relative flex min-w-0 items-center grow">
            <input
              ref={queryInputRef} id="street-query" name="street"
              className="neu-input w-full h-12 rounded-full border-none pl-4 sm:pl-5 pr-14 text-base sm:text-lg text-on-surface placeholder:text-on-surface-variant disabled:opacity-60"
              placeholder="搜索街道（如：安福路）..." type="text" required
              aria-invalid={error?.field === "text" || undefined}
              aria-describedby={`street-help${error ? " search-error" : ""}`}
              value={query} disabled={busy} readOnly={phase === "unknown"}
              onChange={(event) => {
                setQuery(event.target.value);
                if (error?.field === "text") setError(null);
              }}
              onCompositionStart={() => { composing.current = true; }}
              onCompositionEnd={() => { composing.current = false; }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
              }}
            />
            <button type="submit" disabled={blocked} aria-label="开始分析" aria-busy={phase === "submitting"}
              className="absolute right-0.5 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center text-primary hover:bg-primary/10 rounded-full transition-colors disabled:opacity-60 disabled:hover:bg-transparent">
              <span aria-hidden="true" className={`material-symbols-outlined text-[28px] ${phase === "submitting" ? "motion-safe:animate-spin" : ""}`}>
                {phase === "submitting" ? "progress_activity" : "arrow_forward"}
              </span>
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" tabIndex={-1} aria-label="选择街景图片"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void submit(undefined, file);
            }} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={blocked} aria-label="上传图片识别街道"
            aria-describedby={`image-help${error?.field === "image" ? " search-error" : ""}`}
            className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-primary text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60">
            <span aria-hidden="true" className="material-symbols-outlined text-[26px]">photo_camera</span>
          </button>
        </div>
        <p role="status" className="sr-only">{phase === "submitting" ? "正在提交评价，请稍候。" : ""}</p>
        <p id="search-error" className="mt-3 min-h-5 pl-4 sm:pl-5 break-words text-sm leading-5 text-error text-left" role="alert">{error?.message}</p>
        {phase === "unknown" && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm">
            <Link href="/history" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">查看历史记录</Link>
            <button type="button" className="min-h-11 rounded-full border border-outline-variant px-4 text-on-surface" onClick={() => {
              clearPendingSubmission();
              inFlight.current = false;
              setPhase("idle");
              setError(null);
              queryInputRef.current?.focus();
            }}>已确认未创建，重新填写</button>
          </div>
        )}
      </form>
    </section>
  );
}
