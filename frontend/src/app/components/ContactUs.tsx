"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";

const CONTACT = {
  address: "上海市浦东新区金海路2727号",
  postcode: "201209",
  email: "yuechun.wang@sandau.edu.cn",
};

/** 页脚「联系我们」入口：点击弹出横版联系卡片，左侧 LOGO、右侧信息。 */
export default function ContactUs({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        联系我们
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-brand/30 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-us-title"
            onClick={(e) => e.stopPropagation()}
            className="fx-pop-in relative w-full max-w-lg rounded-3xl border border-divider bg-surface-container-lowest px-8 py-10 shadow-[0_24px_60px_rgb(0,0,0,0.12)]"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="关闭"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>

            {/* LOGO 与信息作为一个整体在卡片内居中 */}
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-8">
              <div className="relative h-32 w-32 shrink-0 sm:h-36 sm:w-36">
                {/* 原图四周各有 15% 透明边；放大使可见校徽正好等于盒子尺寸，排版间距才与视觉一致 */}
                <Image
                  src="/images/杉达LOGO.png"
                  alt="杉达学院 LOGO"
                  fill
                  sizes="204px"
                  className="scale-[1.41] object-contain"
                />
              </div>

              <div className="min-w-0">
                <h3
                  id="contact-us-title"
                  className="text-xl font-bold tracking-tight text-brand"
                >
                  联系我们
                </h3>
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
        </div>,
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
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] font-medium tracking-wider text-on-surface-variant">
          {label}
        </dt>
        <dd className="break-all text-sm font-medium text-on-surface">{children}</dd>
      </div>
    </div>
  );
}
