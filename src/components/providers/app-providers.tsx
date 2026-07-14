"use client";

import type { ReactNode } from "react";
import { QueryProvider } from "@/components/providers/query-provider";
import { ToastProvider } from "@/components/heroui-kit";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <ToastProvider placement="bottom end">{children}</ToastProvider>
    </QueryProvider>
  );
}
