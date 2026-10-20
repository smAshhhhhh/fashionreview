"use client";

import { useEffect, useState } from "react";
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

      {open && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-us-title"
            onClick={(e) => e.stopPropagation()}
            className="relative flex w-full max-w-xl items-center gap-6 rounded-3xl bg-surface-container-lowest p-6 shadow-xl sm:p-8"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="关闭"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>

            <Image
              src="/images/杉达LOGO.png"
              alt="杉达学院 LOGO"
              width={160}
              height={160}
              className="h-28 w-28 shrink-0 object-contain sm:h-40 sm:w-40"
            />

            <div className="min-w-0 flex-1">
              <h3 id="contact-us-title" className="text-lg font-bold text-on-surface">
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
                    className="hover:text-primary hover:underline"
                  >
                    {CONTACT.email}
                  </a>
                </ContactRow>
              </dl>
            </div>
          </div>
        </div>
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
    <div className="flex items-start gap-3">
      <span className="material-symbols-outlined mt-0.5 text-[20px] text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] font-bold tracking-wider text-on-surface-variant">
          {label}
        </dt>
        <dd className="break-all text-sm font-medium text-on-surface">{children}</dd>
      </div>
    </div>
  );
}
