"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ponyoApi, PONYO_API_BASE_URL, type CustomerProfile } from "@/services/ponyo-api.client";
import { CartSync } from "@/components/layout/cart-sync";

type CustomerSessionValue = {
  customer: CustomerProfile | null;
  isLoading: boolean;
  setCustomer: (customer: CustomerProfile | null) => void;
};

const CustomerSessionContext = createContext<CustomerSessionValue | null>(null);

export function CustomerSessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const supplierHost = (process.env.NEXT_PUBLIC_SUPPLIER_PORTAL_HOST ?? "supplier.byponyo.com").toLowerCase();
  const adminHost = (process.env.NEXT_PUBLIC_ADMIN_PORTAL_HOST ?? "admin.byponyo.com").toLowerCase();
  const isOperationsPortal = pathname.startsWith("/supplier-portal") || pathname.startsWith("/admin-portal")
    || (typeof window !== "undefined" && [supplierHost, adminHost].includes(window.location.hostname.toLowerCase()));
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(PONYO_API_BASE_URL) && !isOperationsPortal);
  useEffect(() => {
    if (!PONYO_API_BASE_URL || isOperationsPortal) return;
    let active = true;
    void ponyoApi.getMe().then((profile) => {
      if (active) setCustomer(profile);
    }).catch(() => {
      if (active) setCustomer(null);
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [isOperationsPortal]);

  const value = useMemo(() => ({ customer, setCustomer, isLoading }), [customer, isLoading]);
  return <CustomerSessionContext.Provider value={value}>{!isOperationsPortal && <CartSync />}{children}</CustomerSessionContext.Provider>;
}

export function useCustomerSession() {
  const value = useContext(CustomerSessionContext);
  if (!value) throw new Error("useCustomerSession must be used inside CustomerSessionProvider");
  return value;
}
