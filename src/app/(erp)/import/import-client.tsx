"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Button,
  Card,
  EmptyState,
  Field,
  ListPageShell,
  PageHeader,
  Select,
  StatCard,
  Textarea,
} from "@/components/ui";
import { MutationError } from "@/components/query-state";
import { apiPost } from "@/lib/api-client";
import { FileUp, Upload } from "lucide-react";

const TEMPLATES: Record<string, string> = {
  products:
    "sku,name,unit,purchasePrice,salePrice\nSKU001,Produk Contoh,Pcs,10000,15000",
  customers: "code,name,email,phone\nC001,Pelanggan A,a@x.com,0812",
  suppliers: "code,name,email,phone\nS001,Pemasok A,s@x.com,0813",
  opening_stock: "sku,warehouse,quantity,unitCost\nSKU001,MAIN,100,10000",
};

export function ImportClient() {
  const [type, setType] = useState("products");
  const [csv, setCsv] = useState(TEMPLATES.products);
  const [result, setResult] = useState<{
    created: number;
    errors: string[];
  } | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<{ created: number; errors: string[] }>("/api/erp/import", {
        type,
        csv,
      }),
    onSuccess: (data) => setResult(data),
  });

  return (
    <ListPageShell>
      <PageHeader
        title="Import master CSV"
        description="Produk · pelanggan · pemasok · stok awal"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Tipe aktif" value={type} icon={FileUp} />
        <StatCard
          label="Hasil terakhir"
          value={
            result
              ? `${result.created} ok${result.errors.length ? ` · ${result.errors.length} err` : ""}`
              : "—"
          }
          icon={Upload}
        />
      </div>

      <Card title="Upload teks CSV">
        <div className="space-y-3">
          <Field label="Tipe">
            <Select
              value={type}
              onChange={(e) => {
                const v = e.target.value;
                setType(v);
                setCsv(TEMPLATES[v] ?? TEMPLATES.products);
                setResult(null);
              }}
            >
              <option value="products">Produk</option>
              <option value="customers">Pelanggan</option>
              <option value="suppliers">Pemasok</option>
              <option value="opening_stock">Stok awal</option>
            </Select>
          </Field>
          <Field label="CSV">
            <Textarea
              rows={10}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
            />
          </Field>
          <MutationError error={mutation.error} />
          <Button
            type="button"
            disabled={mutation.isPending || !csv.trim()}
            onClick={() => mutation.mutate()}
          >
            <Upload className="mr-1.5 size-4" />
            {mutation.isPending ? "Mengimpor..." : "Import"}
          </Button>
          {result ? (
            <div className="rounded-2xl border border-border/70 bg-[#f7fafc] p-4 text-sm">
              <p className="font-semibold text-[#0F4C75]">
                Berhasil: {result.created}
              </p>
              {result.errors.length ? (
                <ul className="mt-2 list-disc pl-5 text-danger">
                  {result.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-muted">Tanpa error</p>
              )}
            </div>
          ) : (
            <EmptyState
              compact
              icon={FileUp}
              title="Siap impor"
              message="Tempel CSV sesuai header template, lalu klik Import."
            />
          )}
        </div>
      </Card>
    </ListPageShell>
  );
}
