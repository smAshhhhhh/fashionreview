"use client";

/**
 * 资源页统一的编辑按钮组：阅读态显示「修改」，编辑态显示「取消」+「保存」。
 * 指标权重、类型定义、Prompt 模板共用，保证按钮文案、图标与样式一致。
 */
export default function ResourceEditActions({
  editing,
  saving = false,
  canSave = true,
  saveLabel = "保存",
  saveTitle,
  onEdit,
  onCancel,
  onSave,
}: {
  editing: boolean;
  saving?: boolean;
  /** 编辑态下保存按钮是否可点（如无改动、校验未通过时为 false） */
  canSave?: boolean;
  saveLabel?: string;
  /** 保存按钮不可点时的悬浮说明 */
  saveTitle?: string;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  if (!editing) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="resource-button resource-button--secondary"
      >
        <span aria-hidden="true" className="material-symbols-outlined resource-icon">
          edit
        </span>
        修改
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="resource-button resource-button--secondary"
      >
        取消
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !canSave}
        title={!canSave ? saveTitle : undefined}
        className="resource-button resource-button--primary"
      >
        <span
          aria-hidden="true"
          className={`material-symbols-outlined resource-icon ${saving ? "animate-spin" : ""}`}
        >
          {saving ? "progress_activity" : "save"}
        </span>
        {saveLabel}
      </button>
    </>
  );
}
