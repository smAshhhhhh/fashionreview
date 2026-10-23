import type { Metadata } from "next";

export const metadata: Metadata = { title: "Fashion Street AI - 人工标注库" };

export default function ResourceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
