"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Button,
  Card,
  Field,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { MutationError } from "@/components/query-state";
import { apiPost } from "@/lib/api-client";

export function ImportClient() {
  const [type, setType] = useState("products");
  const [csv, setCsv] = useState(
    "sku,name,unit,purchasePrice,salePrice\nSKU001,Produk Contoh,Pcs,10000,15000",
  );
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
    <div className="space-y-6">
      <PageHeader
        title="Import master CSV"
        description="Produk · pelanggan · pemasok · stok awal"
      />
      <Card title="Upload teks CSV">
        <div className="space-y-3">
          <Field label="Tipe">
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                if (e.target.value === "customers") {
                  setCsv("code,name,email,phone\nC001,Pelanggan A,a@x.com,0812");
                } else if (e.target.value === "suppliers") {
                  setCsv("code,name,email,phone\nS001,Pemasok A,s@x.com,0813");
                } else if (e.target.value === "opening_stock") {
                  setCsv("sku,warehouse,quantity,unitCost\nSKU001,MAIN,100,10000");
                } else {
                  setCsv(
                    "sku,name,unit,purchasePrice,salePrice\nSKU001,Produk Contoh,Pcs,10000,15000",
                  );
                }
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
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Mengimpor..." : "Import"}
          </Button>
          {result ? (
            <div className="rounded-lg border border-border p-3 text-sm">
              <p>Berhasil: {result.created}</p>
              {result.errors.length ? (
                <ul className="mt-2 list-disc pl-5 text-danger">
                  {result.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">Tanpa error</p>
              )}
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
