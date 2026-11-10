"use client";

import { useEffect, useState } from "react";
import { hashKey } from "@tanstack/react-query";
import { makeKey } from "@/lib/query-keys";

export function createTenantQueryClient(companyId: string) {
  return new QueryClient({ defaultOptions: { queries: {
    queryKeyHashFn: key => hashKey(makeKey(companyId, ...key)),
    staleTime: 30_000, gcTime: 300_000, refetchOnWindowFocus: false, retry: 1,
  }, mutations: { retry: 0 } } });
}

export function TenantQueryProvider({ companyId, children }: { companyId: string; children: React.ReactNode }) {
  const [client] = useState(() => createTenantQueryClient(companyId));
  useEffect(() => () => { client.clear(); }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
import {
  QueryClient,
  QueryClientProvider,
  isServer,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (isServer) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(getQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      ) : null}
    </QueryClientProvider>
  );
}
