"use client";

import type { ReactNode } from "react";
import { Button, Card, EmptyState } from "@/components/ui";
import { Spinner } from "@heroui/react";

export function QueryLoading({ label = "Memuat data..." }: { label?: string }) {
  return (
    <Card>
      <div className="flex items-center gap-3 py-8 text-sm text-muted">
        <Spinner size="sm" />
        <span>{label}</span>
      </div>
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
      <div className="space-y-3 py-4">
        <EmptyState message={message || "Gagal memuat data"} />
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
    <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
      {message}
    </p>
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
