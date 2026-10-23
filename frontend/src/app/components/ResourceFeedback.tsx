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
      className="resource-feedback"
      data-tone={error ? "error" : "success"}
    >
      <span aria-hidden="true" className="material-symbols-outlined shrink-0">
        {error ? "error" : "check_circle"}
      </span>
      <p className="resource-feedback-message">
        {error ?? message}
      </p>
      {error && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="resource-button resource-button--danger"
        >
          重新加载
        </button>
      )}
    </div>
  );
}
