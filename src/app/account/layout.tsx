import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { storefrontFeatures } from "@/lib/storefront-features";

export default function AccountLayout({ children }: { children: ReactNode }) {
  if (!storefrontFeatures.customerAccounts) notFound();
  return children;
}
