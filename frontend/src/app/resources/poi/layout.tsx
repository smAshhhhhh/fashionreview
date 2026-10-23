import type { Metadata } from "next";

export const metadata: Metadata = { title: "Fashion Street AI - POI 数据导入" };

export default function ResourceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
