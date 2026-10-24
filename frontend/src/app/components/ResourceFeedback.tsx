"use client";

/** 资源页的行内文字提示：不用卡片底色，样式同首页输入框提醒。 */
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
      <p className="resource-feedback-message">
        {error ?? message}
      </p>
      {error && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="resource-button resource-button--quiet"
        >
          重新加载
        </button>
      )}
    </div>
  );
}
