import type { Metadata } from "next";
import "./resources.css";
import "./resource-subpages.css";

export const metadata: Metadata = { title: "Fashion Street AI - 资源中心" };

export default function ResourceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
