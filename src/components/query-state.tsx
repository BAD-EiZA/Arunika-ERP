"use client";

import type { ReactNode } from "react";
import {
  AppAlert,
  Button,
  Card,
  EmptyState,
  LoadingBlock,
} from "@/components/ui";

export function QueryLoading({ label = "Memuat data..." }: { label?: string }) {
  return (
    <Card>
      <LoadingBlock label={label} />
    </Card>
  );
}

export function QueryError({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <Card>
      <div className="space-y-3 py-2">
        <AppAlert
          status="danger"
          title="Gagal memuat data"
          description={message || "Terjadi kesalahan. Coba lagi."}
        />
        {onRetry ? (
          <Button type="button" variant="secondary" onClick={onRetry}>
            Coba lagi
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

export function MutationError({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof Error ? error.message : "Terjadi kesalahan";
  return (
    <AppAlert status="danger" title="Gagal" description={message} />
  );
}

export function QueryBoundary({
  isLoading,
  isError,
  error,
  onRetry,
  isEmpty,
  emptyMessage,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
}) {
  if (isLoading) return <QueryLoading />;
  if (isError) {
    return (
      <QueryError
        message={error instanceof Error ? error.message : undefined}
        onRetry={onRetry}
      />
    );
  }
  if (isEmpty) return <EmptyState message={emptyMessage || "Tidak ada data"} />;
  return <>{children}</>;
}
