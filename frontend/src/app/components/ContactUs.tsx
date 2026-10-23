"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";

const CONTACT = {
  address: "上海市浦东新区金海路2727号",
  postcode: "201209",
  email: "yuechun.wang@sandau.edu.cn",
};

export default function ContactUs({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const backdropPointerDown = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={className}
      >
        联系我们
      </button>
      {open &&
        createPortal(
          <dialog
            ref={dialogRef}
            aria-modal="true"
            aria-labelledby="contact-us-title"
            onClose={(event) => {
              if (
                dialogRef.current === event.currentTarget &&
                !event.currentTarget.open
              )
                setOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const controls =
                event.currentTarget.querySelectorAll<HTMLElement>(
                  "button:not(:disabled), a[href]",
                );
              const first = controls[0];
              const last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
            onPointerDown={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              backdropPointerDown.current =
                event.clientX < rect.left ||
                event.clientX > rect.right ||
                event.clientY < rect.top ||
                event.clientY > rect.bottom;
            }}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const outside =
                event.clientX < rect.left ||
                event.clientX > rect.right ||
                event.clientY < rect.top ||
                event.clientY > rect.bottom;
              if (backdropPointerDown.current && outside) setOpen(false);
              backdropPointerDown.current = false;
            }}
            className="fx-pop-in fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-3xl border border-divider bg-surface-container-lowest p-0 text-on-surface shadow-[0_24px_60px_rgb(0,0,0,0.12)] backdrop:bg-scrim backdrop:backdrop-blur-sm"
          >
            <div className="sticky top-0 z-10 flex justify-end bg-surface-container-lowest px-4 pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭"
                className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[20px]"
                >
                  close
                </span>
              </button>
            </div>
            <div className="px-6 pb-8 pt-2 sm:px-8 sm:pb-10">
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-8">
                <div className="relative h-32 w-32 shrink-0 sm:h-36 sm:w-36">
                  <Image
                    src="/images/杉达LOGO.png"
                    alt="杉达学院 LOGO"
                    fill
                    sizes="204px"
                    className="scale-[1.41] object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <h2
                    id="contact-us-title"
                    className="text-xl font-bold tracking-tight text-brand"
                  >
                    联系我们
                  </h2>
                  <dl className="mt-4 space-y-3">
                    <ContactRow icon="location_on" label="地址">
                      {CONTACT.address}
                    </ContactRow>
                    <ContactRow icon="markunread_mailbox" label="邮编">
                      {CONTACT.postcode}
                    </ContactRow>
                    <ContactRow icon="mail" label="邮箱">
                      <a
                        href={`mailto:${CONTACT.email}`}
                        className="transition-colors hover:text-primary hover:underline"
                      >
                        {CONTACT.email}
                      </a>
                    </ContactRow>
                  </dl>
                </div>
              </div>
            </div>
          </dialog>,
          document.body,
        )}
    </>
  );
}

function ContactRow({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
      >
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] font-medium tracking-wider text-on-surface-variant">
          {label}
        </dt>
        <dd className="break-all text-sm font-medium text-on-surface">
          {children}
        </dd>
      </div>
    </div>
  );
}
