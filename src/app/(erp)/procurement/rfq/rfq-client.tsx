"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  Input,
  ListPageShell,
  PageHeader,
  PaginationBar,
  Select,
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useRfqMutation, useRfqQuery } from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formToObject } from "@/lib/api-client";
import { formatIdr } from "@/lib/money";
import { cn } from "@/lib/cn";
import {
  FileText,
  Gavel,
  Plus,
  Send,
  Trophy,
} from "lucide-react";

type RfqData = {
  rfqs: Array<{
    id: string;
    number: string;
    status: string;
    vendors: Array<{ supplierName: string }>;
    quotationCount: number;
  }>;
  suppliers: Array<{ id: string; name: string }>;
  products: Array<{
    id: string;
    sku: string;
    name: string;
    purchasePrice: string;
  }>;
  purchaseRequests: Array<{ id: string; number: string }>;
  warehouses: Array<{ id: string; code: string }>;
  branches: Array<{ id: string; code: string }>;
  quotations: Array<{
    id: string;
    rfqId: string;
    rfqNumber: string;
    supplierId: string;
    supplierName: string;
    total: string;
    isAwarded: boolean;
  }>;
};

type FormMode = "none" | "create" | "quotation" | "award";

function rfqTone(
  status: string,
): "default" | "success" | "warning" | "danger" {
  const s = status.toUpperCase();
  if (s === "AWARDED" || s === "CLOSED" || s === "COMPLETED") return "success";
  if (s === "OPEN" || s === "SENT" || s === "DRAFT") return "warning";
  if (s === "CANCELLED") return "danger";
  return "default";
}

export function RfqClient() {
  const query = useRfqQuery();
  const mutation = useRfqMutation();
  const data = query.data as RfqData | undefined;
  const [formMode, setFormMode] = useState<FormMode>("none");

  const rfqs = data?.rfqs ?? [];
  const quotations = data?.quotations ?? [];

  const stats = useMemo(() => {
    const awarded = quotations.filter((q) => q.isAwarded).length;
    return {
      rfqCount: rfqs.length,
      quoteCount: quotations.length,
      awarded,
      openQuotes: quotations.length - awarded,
    };
  }, [rfqs, quotations]);

  const rfqsPage = useClientPage(rfqs, 20);

  function toggle(mode: FormMode) {
    setFormMode((m) => (m === mode ? "none" : mode));
  }

  return (
    <ListPageShell>
      <PageHeader
        title="RFQ & Quotation"
        description="Kirim RFQ · terima penawaran · award ke PO"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={formMode === "award" ? "primary" : "secondary"}
              onClick={() => toggle("award")}
            >
              <Trophy className="mr-1.5 size-4" />
              Award
            </Button>
            <Button
              type="button"
              variant={formMode === "quotation" ? "primary" : "secondary"}
              onClick={() => toggle("quotation")}
            >
              <FileText className="mr-1.5 size-4" />
              Quotation
            </Button>
            <Button
              type="button"
              variant={formMode === "create" ? "secondary" : "primary"}
              onClick={() => toggle("create")}
            >
              <Plus className="mr-1.5 size-4" />
              {formMode === "create" ? "Tutup" : "Buat RFQ"}
            </Button>
          </div>
        }
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat RFQ..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="RFQ" value={stats.rfqCount} icon={Send} />
              <StatCard
                label="Quotations"
                value={stats.quoteCount}
                icon={FileText}
              />
              <StatCard
                label="Belum award"
                value={stats.openQuotes}
                icon={Gavel}
              />
              <StatCard
                label="Awarded"
                value={stats.awarded}
                icon={Trophy}
              />
            </div>

            {formMode === "create" ? (
              <Card title="Buat RFQ">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const supplierIds = fd.getAll("supplierIds").map(String);
                    mutation.mutate(
                      {
                        action: "create",
                        purchaseRequestId:
                          String(fd.get("purchaseRequestId") || "") ||
                          undefined,
                        supplierIds,
                        notes: String(fd.get("notes") || "") || undefined,
                      },
                      { onSuccess: () => setFormMode("none") },
                    );
                  }}
                >
                  <Field label="PR (opsional)">
                    <Select name="purchaseRequestId" defaultValue="">
                      <option value="">—</option>
                      {data.purchaseRequests.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {pr.number}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Pemasok (Ctrl multi)">
                    <select
                      name="supplierIds"
                      multiple
                      required
                      className="h-28 w-full rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      {data.suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Catatan">
                    <Input name="notes" />
                  </Field>
                  <MutationError error={mutation.error} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Kirim RFQ
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setFormMode("none")}
                    >
                      Batal
                    </Button>
                  </div>
                </form>
              </Card>
            ) : null}

            {formMode === "quotation" ? (
              <Card title="Input quotation">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    mutation.mutate(
                      {
                        action: "quotation",
                        rfqId: body.rfqId,
                        supplierId: body.supplierId,
                        items: [
                          {
                            productId: body.productId || undefined,
                            description: body.description || "Penawaran",
                            quantity: body.quantity,
                            unitPrice: body.unitPrice,
                          },
                        ],
                      },
                      { onSuccess: () => setFormMode("none") },
                    );
                  }}
                >
                  <FormGrid>
                    <Field label="RFQ">
                      <Select name="rfqId" required>
                        {data.rfqs.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.number}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Pemasok">
                      <Select name="supplierId" required>
                        {data.suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Produk">
                      <Select name="productId" defaultValue="">
                        <option value="">—</option>
                        {data.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Deskripsi">
                      <Input name="description" defaultValue="Penawaran" />
                    </Field>
                    <Field label="Qty">
                      <Input
                        name="quantity"
                        type="number"
                        step="0.0001"
                        required
                      />
                    </Field>
                    <Field label="Harga">
                      <Input
                        name="unitPrice"
                        type="number"
                        step="0.01"
                        required
                      />
                    </Field>
                  </FormGrid>
                  <MutationError error={mutation.error} />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={mutation.isPending}
                    >
                      Simpan quotation
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setFormMode("none")}
                    >
                      Batal
                    </Button>
                  </div>
                </form>
              </Card>
            ) : null}

            {formMode === "award" ? (
              <Card title="Award → PO">
                {quotations.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Trophy}
                    title="Belum ada quotation"
                    message="Input penawaran dulu sebelum award."
                  />
                ) : (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const body = formToObject(e.currentTarget);
                      mutation.mutate(
                        {
                          action: "award",
                          quotationId: body.quotationId,
                          rfqId: body.rfqId,
                          warehouseId: body.warehouseId || undefined,
                          branchId: body.branchId || undefined,
                        },
                        { onSuccess: () => setFormMode("none") },
                      );
                    }}
                  >
                    <FormGrid>
                      <Field label="Quotation">
                        <Select name="quotationId" required>
                          {data.quotations.map((q) => (
                            <option key={q.id} value={q.id}>
                              {q.rfqNumber} / {q.supplierName} /{" "}
                              {formatIdr(q.total)}
                              {q.isAwarded ? " ★" : ""}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="RFQ">
                        <Select name="rfqId" required>
                          {data.rfqs.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.number}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Gudang">
                        <Select
                          name="warehouseId"
                          defaultValue={data.warehouses[0]?.id}
                        >
                          {data.warehouses.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.code}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Cabang">
                        <Select
                          name="branchId"
                          defaultValue={data.branches[0]?.id}
                        >
                          {data.branches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.code}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </FormGrid>
                    <MutationError error={mutation.error} />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={mutation.isPending}>
                        Award & buat PO
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setFormMode("none")}
                      >
                        Batal
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-2">
              <Card title={`Daftar RFQ (${rfqsPage.total})`}>
                {rfqsPage.total === 0 ? (
                  <EmptyState
                    compact
                    icon={Send}
                    title="Belum ada RFQ"
                    message="Buat RFQ ke satu atau beberapa pemasok."
                    action={
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setFormMode("create")}
                      >
                        <Plus className="mr-1.5 size-4" />
                        Buat RFQ
                      </Button>
                    }
                  />
                ) : (
                  <>
                    <Table
                      headers={["Nomor", "Status", "Vendor", "Quotations"]}
                    >
                      {rfqsPage.items.map((r) => (
                        <tr key={r.id}>
                          <td className="px-3 py-2 font-medium text-[#0F4C75]">
                            {r.number}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={rfqTone(r.status)}>{r.status}</Badge>
                          </td>
                          <td className="max-w-[10rem] truncate px-3 py-2 text-xs">
                            {r.vendors.map((v) => v.supplierName).join(", ")}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {r.quotationCount}
                          </td>
                        </tr>
                      ))}
                    </Table>
                    <PaginationBar
                      page={rfqsPage.page}
                      totalPages={rfqsPage.totalPages}
                      total={rfqsPage.total}
                      limit={rfqsPage.limit}
                      onPageChange={rfqsPage.setPage}
                    />
                  </>
                )}
              </Card>

              <Card title={`Quotations (${quotations.length})`}>
                {quotations.length === 0 ? (
                  <EmptyState
                    compact
                    icon={FileText}
                    title="Belum ada penawaran"
                    message="Input quotation dari pemasok."
                    action={
                      rfqs.length > 0 ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setFormMode("quotation")}
                        >
                          Input quotation
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <Table
                    headers={["RFQ", "Pemasok", "Total", "Status"]}
                  >
                    {quotations.map((q) => (
                      <tr
                        key={q.id}
                        className={cn(q.isAwarded && "bg-emerald-50/50")}
                      >
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {q.rfqNumber}
                        </td>
                        <td className="px-3 py-2">{q.supplierName}</td>
                        <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                          {formatIdr(q.total)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={q.isAwarded ? "success" : "default"}>
                            {q.isAwarded ? "Awarded" : "Open"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Card>
            </div>
          </>
        ) : null}
      </QueryBoundary>
    </ListPageShell>
  );
}
