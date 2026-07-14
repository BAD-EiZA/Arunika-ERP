"use client";

import type { ReactNode } from "react";
import { Toast } from "@heroui/react";
import { QueryProvider } from "@/components/providers/query-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <Toast.Provider placement="bottom end" maxVisibleToasts={3}>
        {children}
      </Toast.Provider>
    </QueryProvider>
  );
}
