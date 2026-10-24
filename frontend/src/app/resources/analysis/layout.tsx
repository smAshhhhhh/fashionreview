import type { Metadata } from "next";

export const metadata: Metadata = { title: "Fashion Street AI - 展示与流程配置" };

export default function ResourceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
