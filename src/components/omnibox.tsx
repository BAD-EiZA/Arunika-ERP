"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";

type Hit = { id: string; label: string; href: string };

const GROUP_LABEL: Record<string, string> = {
  products: "Produk",
  customers: "Pelanggan",
  suppliers: "Pemasok",
  purchaseOrders: "PO",
  salesOrders: "SO",
  invoices: "Invoice",
  bills: "Tagihan",
  goodsReceipts: "Penerimaan",
  deliveries: "Pengiriman",
  returns: "Return",
};

export function Omnibox({
  companyId,
  className,
}: {
  companyId: string;
  className?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setOpen(false);
        setQ("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const trimmed = q.trim();
  const query = useQuery({
    queryKey: [companyId, "search", trimmed],
    queryFn: () =>
      apiGet<{ results: Record<string, Hit[]> }>(
        `/api/erp/search?q=${encodeURIComponent(trimmed)}`,
      ),
    enabled: open && trimmed.length >= 3,
    staleTime: 30_000,
  });

  const groups = Object.entries(query.data?.results ?? {}).filter(
    ([, hits]) => hits.length > 0,
  );

  return (
    <div
      className={className}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <div className="relative">
        <input
          ref={inputRef}
          data-testid="omnibox-input"
          aria-label="Pencarian global"
          className="w-40 rounded-md border border-border/80 bg-surface px-3 py-1.5 text-sm outline-none transition-[width] focus:w-64 md:w-56"
          placeholder="Cari… (Ctrl/Cmd+K)"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {open && trimmed.length >= 3 ? (
          <div className="absolute right-0 top-full z-50 mt-1 max-h-80 w-80 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-xl">
            {query.isLoading ? (
              <p className="px-2 py-1.5 text-xs text-muted">Mencari…</p>
            ) : query.isError ? (
              <p className="px-2 py-1.5 text-xs text-danger">Pencarian gagal</p>
            ) : groups.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted">Tidak ada hasil</p>
            ) : (
              groups.map(([group, hits]) => (
                <div key={group} className="mb-1">
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {GROUP_LABEL[group] ?? group}
                  </p>
                  {hits.slice(0, 5).map((hit) => (
                    <button
                      key={`${group}-${hit.id}`}
                      type="button"
                      className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-accent/10"
                      onClick={() => {
                        setOpen(false);
                        setQ("");
                        router.push(hit.href);
                      }}
                    >
                      {hit.label}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
