"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

/** 原生模态对话框负责焦点约束、Escape 和关闭后的焦点归还。 */
export default function ResourceDialog({
  title,
  children,
  busy = false,
  onClose,
  fallbackFocusRef,
  descriptionId,
}: {
  title: string;
  children: ReactNode;
  busy?: boolean;
  onClose: () => void;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  descriptionId?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    const fallback = fallbackFocusRef?.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("[data-dialog-initial-focus]")?.focus();
    return () => {
      dialog?.close();
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        !previous.matches(":disabled")
      )
        previous.focus();
      else fallback?.focus();
    };
  }, [fallbackFocusRef]);
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy}
      className="resource-dialog"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) {
          event.preventDefault();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === event.currentTarget)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || busy) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <h2 id={titleId} className="mb-3 text-xl font-bold">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
