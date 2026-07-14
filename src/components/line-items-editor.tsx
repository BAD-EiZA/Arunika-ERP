"use client";

import { Button, Field, Input, Select } from "@/components/ui";

export type LineItemDraft = {
  key: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  taxAmount: string;
  description: string;
};

export type ProductOption = {
  id: string;
  sku: string;
  name: string;
  purchasePrice?: string;
  salePrice?: string;
};

function newLine(products: ProductOption[], mode: "buy" | "sell"): LineItemDraft {
  const first = products[0];
  const price =
    mode === "buy"
      ? first?.purchasePrice ?? "0"
      : first?.salePrice ?? "0";
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productId: first?.id ?? "",
    quantity: "1",
    unitPrice: price,
    taxAmount: "0",
    description: "",
  };
}

export function createInitialLines(
  products: ProductOption[],
  mode: "buy" | "sell",
  count = 1,
): LineItemDraft[] {
  return Array.from({ length: Math.max(1, count) }, () => newLine(products, mode));
}

export function LineItemsEditor({
  products,
  mode,
  lines,
  onChange,
}: {
  products: ProductOption[];
  mode: "buy" | "sell";
  lines: LineItemDraft[];
  onChange: (lines: LineItemDraft[]) => void;
}) {
  const update = (key: string, patch: Partial<LineItemDraft>) => {
    onChange(
      lines.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.productId) {
          const p = products.find((x) => x.id === patch.productId);
          if (p) {
            next.unitPrice =
              mode === "buy" ? p.purchasePrice ?? next.unitPrice : p.salePrice ?? next.unitPrice;
          }
        }
        return next;
      }),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Item baris</p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...lines, newLine(products, mode)])}
        >
          + Tambah baris
        </Button>
      </div>

      {lines.map((line, idx) => (
        <div
          key={line.key}
          className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-12"
        >
          <div className="sm:col-span-4">
            <Field label={`Produk #${idx + 1}`}>
              <Select
                value={line.productId}
                onChange={(e) => update(line.key, { productId: e.target.value })}
                required
              >
                <option value="">Pilih</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Qty">
              <Input
                type="number"
                step="0.0001"
                min="0.0001"
                value={line.quantity}
                onChange={(e) => update(line.key, { quantity: e.target.value })}
                required
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Harga">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={line.unitPrice}
                onChange={(e) => update(line.key, { unitPrice: e.target.value })}
                required
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Pajak">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={line.taxAmount}
                onChange={(e) => update(line.key, { taxAmount: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex items-end sm:col-span-2">
            <Button
              type="button"
              variant="ghost"
              disabled={lines.length <= 1}
              onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
            >
              Hapus
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function linesToPayload(lines: LineItemDraft[]) {
  return lines
    .filter((l) => l.productId && Number(l.quantity) > 0)
    .map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxAmount: l.taxAmount || "0",
      description: l.description || undefined,
    }));
}
