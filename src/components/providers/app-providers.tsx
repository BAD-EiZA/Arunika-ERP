"use client";

import type { ReactNode } from "react";
import { Toast } from "@heroui/react";
import { QueryProvider } from "@/components/providers/query-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <Toast.Provider placement="top end" maxVisibleToasts={4}>
        {children}
      </Toast.Provider>
    </QueryProvider>
  );
}
