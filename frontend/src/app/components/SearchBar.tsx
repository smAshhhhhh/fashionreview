"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { submitImageAnalysis, submitTextAnalysis } from "../../lib/api";
import { ACTIVE_TASK_KEY } from "./ActiveTaskGuard";

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // 推荐搜索：点击即对该街道发起点评
  const suggestions = ["安福路", "武康路", "愚园路", "巨鹿路"];

  // 在提交点建任务，拿到 task_id 再跳转。
  // 进度页改用 task_id 寻址，刷新不会再触发新任务（见 docs/analyze_process_optimization.md）。
  // 可选 text：推荐标签点击时直接传入街道名，不依赖输入框 state 的异步更新。
  const submit = async (text?: string) => {
    const q = (text ?? query).trim();
    if (!q || submitting) return; // submitting 兜底防连点重复提交
    setQuery(q); // 同步到输入框，便于用户看到正在分析的内容
    setSubmitting(true);
    setError(null);
    try {
      const { task_id } = await submitTextAnalysis(q);
      // 记录活跃任务。不清除 LAST_EVAL_KEY：新任务分析期间，分析中心继续展示上一次结果，
      // 直到新任务完成跳转过去自然覆盖；避免浏览历史时发起新点评导致分析中心瞬间空窗。
      try {
        localStorage.setItem(ACTIVE_TASK_KEY, String(task_id));
      } catch {
        /* storage 不可用不阻断提交 */
      }
      // q 仅用于进度页标题文案，不再用于发请求
      router.push(`/progress?taskId=${task_id}&q=${encodeURIComponent(q)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败，请重试");
      setSubmitting(false);
    }
  };

  // 图片发起点评：与文字提交对称，复用 submitting / error / 跳转逻辑。
  // 后端识别照片所在街道后，走与文字完全相同的评分链。
  const submitImage = async (file: File) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { task_id } = await submitImageAnalysis(file);
      try {
        localStorage.setItem(ACTIVE_TASK_KEY, String(task_id));
      } catch {
        /* storage 不可用不阻断提交 */
      }
      router.push(`/progress?taskId=${task_id}&q=${encodeURIComponent("照片点评")}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "图片提交失败，请重试");
      setSubmitting(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 清空，允许重选同一文件再次触发 change
    if (file) submitImage(file);
  };

  return (
    <section className="flex flex-col items-center gap-4 text-center py-6">
      <h2 className="text-3xl font-extrabold tracking-tight text-on-surface">
        为每个角落注入潮流洞察
      </h2>
      <p className="text-base text-on-surface-variant max-w-md leading-relaxed">
        利用先进的计算机视觉和本地趋势图谱分析实时街头风格数据
      </p>

      <div className="w-full mt-4">
        <div className="flex items-center gap-3">
          {/* 文本搜索框 */}
          <div className="relative flex items-center group grow">
            <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">
              search
            </span>
            <input
              className="w-full bg-outline-variant/30 border-none rounded-full h-12 pl-14 pr-16 text-lg text-on-surface placeholder:text-on-surface-variant focus:ring-1 focus:ring-primary focus:bg-white transition-all disabled:opacity-60"
              placeholder="搜索街道（如：安福路）..."
              type="text"
              value={query}
              disabled={submitting}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
            <button
              type="button"
              onClick={() => submit()}
              disabled={submitting}
              aria-label="开始分析"
              aria-busy={submitting}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center text-primary hover:bg-primary-fixed-dim p-2 rounded-full transition-colors disabled:opacity-60 disabled:hover:bg-transparent"
            >
              <span className="material-symbols-outlined text-[28px]">
                {submitting ? "progress_activity" : "arrow_forward"}
              </span>
            </button>
          </div>

          {/* 图片识别入口：点击触发隐藏 file input，选完直接上传识别街道 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={submitting}
            aria-label="上传图片识别街道"
            className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-primary text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[26px]">photo_camera</span>
          </button>
        </div>

        {/* 推荐搜索：点击直接发起点评 */}
        <div className="flex flex-wrap gap-2 justify-center mt-4">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => submit(name)}
              disabled={submitting}
              className="px-3 py-1 bg-surface-container-high rounded-full text-xs text-on-surface-variant border border-outline-variant hover:border-primary hover:text-primary transition-colors disabled:opacity-60 disabled:hover:border-outline-variant disabled:hover:text-on-surface-variant"
            >
              {name}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-3 text-sm text-error text-left" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

