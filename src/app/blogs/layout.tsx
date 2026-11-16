import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { storefrontFeatures } from "@/lib/storefront-features";

export default function BlogsLayout({ children }: { children: ReactNode }) {
  if (!storefrontFeatures.plushJournal) notFound();
  return children;
}
