"use client";

export default function ResourceFeedback({
  error,
  message,
  onRetry,
}: {
  error?: string | null;
  message?: string | null;
  onRetry?: () => void;
}) {
  if (!error && !message) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`flex min-w-0 flex-wrap items-start gap-3 rounded-xl border p-4 ${error ? "border-error/30 bg-error/5 text-error" : "border-primary/20 bg-primary/5 text-on-surface-variant"}`}
    >
      <span aria-hidden="true" className="material-symbols-outlined shrink-0">
        {error ? "error" : "check_circle"}
      </span>
      <p className="min-w-0 flex-1 basis-40 text-sm leading-relaxed [overflow-wrap:anywhere]">
        {error ?? message}
      </p>
      {error && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-current px-4 py-2 text-sm font-semibold"
        >
          重新加载
        </button>
      )}
    </div>
  );
}
