"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  useReturnsMutation,
  useReturnsQuery,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { apiGet, apiPost, formToObject } from "@/lib/api-client";
import { formatIdr } from "@/lib/money";
import {
  FileText,
  PackageMinus,
  Plus,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";

type ReturnsData = {
  salesReturns: Array<{
    id: string;
    number: string;
    status: string;
    total: string;
    reason: string | null;
  }>;
  purchaseReturns: Array<{
    id: string;
    number: string;
    status: string;
    total: string;
  }>;
  claims: Array<{
    id: string;
    number: string;
    claimType: string;
    status: string;
    amount: string;
    partnerName: string | null;
  }>;
  customers: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  products: Array<{
    id: string;
    sku: string;
    name: string;
    salePrice: string;
    purchasePrice: string;
  }>;
  warehouses: Array<{ id: string; code: string }>;
};

type FormMode = "none" | "sr" | "pr" | "claim";

function retTone(
  status: string,
): "default" | "success" | "warning" | "danger" {
  const s = status.toUpperCase();
  if (s === "POSTED" || s === "CLOSED") return "success";
  if (s === "DRAFT" || s === "PENDING") return "warning";
  if (s === "CANCELLED" || s === "VOID") return "danger";
  return "default";
}

export function ReturnsClient() {
  const qc = useQueryClient();
  const query = useReturnsQuery();
  const mutation = useReturnsMutation();
  const cnQuery = useQuery({
    queryKey: ["credit-notes"],
    queryFn: () =>
      apiGet<{
        creditNotes: Array<{
          id: string;
          number: string;
          total: string;
          status: string;
        }>;
        debitNotes: Array<{
          id: string;
          number: string;
          total: string;
          status: string;
        }>;
        salesReturns: Array<{ id: string; number: string; total: string }>;
        purchaseReturns: Array<{ id: string; number: string; total: string }>;
      }>("/api/erp/credit-notes"),
  });
  const cnMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost("/api/erp/credit-notes", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["credit-notes"] });
    },
  });
  const data = query.data as ReturnsData | undefined;
  const [formMode, setFormMode] = useState<FormMode>("none");

  const salesReturnsPage = useClientPage(data?.salesReturns ?? [], 20);
  const purchaseReturnsPage = useClientPage(data?.purchaseReturns ?? [], 20);
  const claimsPage = useClientPage(data?.claims ?? [], 20);
  const notesPage = useClientPage(
    [
      ...(cnQuery.data?.creditNotes ?? []).map((n) => ({
        ...n,
        noteType: "CN" as const,
      })),
      ...(cnQuery.data?.debitNotes ?? []).map((n) => ({
        ...n,
        noteType: "DN" as const,
      })),
    ],
    20,
  );

  const stats = useMemo(() => {
    return {
      sr: data?.salesReturns.length ?? 0,
      pr: data?.purchaseReturns.length ?? 0,
      claims: data?.claims.length ?? 0,
      notes:
        (cnQuery.data?.creditNotes.length ?? 0) +
        (cnQuery.data?.debitNotes.length ?? 0),
    };
  }, [data, cnQuery.data]);

  function toggle(mode: FormMode) {
    setFormMode((m) => (m === mode ? "none" : mode));
  }

  return (
    <ListPageShell>
      <PageHeader
        title="Return & Claim"
        description="Sales/purchase return · credit/debit note · claim"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={formMode === "claim" ? "primary" : "secondary"}
              onClick={() => toggle("claim")}
            >
              <ShieldAlert className="mr-1.5 size-4" />
              Claim
            </Button>
            <Button
              type="button"
              variant={formMode === "pr" ? "primary" : "secondary"}
              onClick={() => toggle("pr")}
            >
              <PackageMinus className="mr-1.5 size-4" />
              PR return
            </Button>
            <Button
              type="button"
              variant={formMode === "sr" ? "secondary" : "primary"}
              onClick={() => toggle("sr")}
            >
              <Plus className="mr-1.5 size-4" />
              {formMode === "sr" ? "Tutup" : "Sales return"}
            </Button>
          </div>
        }
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat return & claim..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Sales return"
                value={stats.sr}
                icon={RotateCcw}
              />
              <StatCard
                label="Purchase return"
                value={stats.pr}
                icon={PackageMinus}
              />
              <StatCard
                label="Claims"
                value={stats.claims}
                icon={ShieldAlert}
              />
              <StatCard
                label="CN / DN"
                value={stats.notes}
                icon={FileText}
              />
            </div>

            <MutationError error={mutation.error} />

            {formMode === "sr" ? (
              <Card title="Sales return">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    mutation.mutate(
                      {
                        action: "sales_return",
                        customerId: body.customerId,
                        warehouseId: body.warehouseId,
                        reason: body.reason,
                        items: [
                          {
                            productId: body.productId,
                            quantity: body.quantity,
                            unitPrice: body.unitPrice,
                          },
                        ],
                      },
                      {
                        onSuccess: () => {
                          e.currentTarget.reset();
                          setFormMode("none");
                        },
                      },
                    );
                  }}
                >
                  <FormGrid>
                    <Field label="Pelanggan">
                      <Select name="customerId" required>
                        {data.customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
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
                    <Field label="Produk">
                      <Select name="productId" required>
                        {data.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku}
                          </option>
                        ))}
                      </Select>
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
                    <Field label="Alasan">
                      <Input name="reason" />
                    </Field>
                  </FormGrid>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Buat sales return
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

            {formMode === "pr" ? (
              <Card title="Purchase return">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    mutation.mutate(
                      {
                        action: "purchase_return",
                        supplierId: body.supplierId,
                        warehouseId: body.warehouseId,
                        reason: body.reason,
                        items: [
                          {
                            productId: body.productId,
                            quantity: body.quantity,
                            unitCost: body.unitCost,
                          },
                        ],
                      },
                      {
                        onSuccess: () => {
                          e.currentTarget.reset();
                          setFormMode("none");
                        },
                      },
                    );
                  }}
                >
                  <FormGrid>
                    <Field label="Pemasok">
                      <Select name="supplierId" required>
                        {data.suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
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
                    <Field label="Produk">
                      <Select name="productId" required>
                        {data.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Qty">
                      <Input
                        name="quantity"
                        type="number"
                        step="0.0001"
                        required
                      />
                    </Field>
                    <Field label="Cost">
                      <Input
                        name="unitCost"
                        type="number"
                        step="0.01"
                        required
                      />
                    </Field>
                  </FormGrid>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={mutation.isPending}
                    >
                      Buat purchase return
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

            {formMode === "claim" ? (
              <Card title="Claim">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate(
                      {
                        action: "claim",
                        ...formToObject(e.currentTarget),
                      },
                      {
                        onSuccess: () => {
                          e.currentTarget.reset();
                          setFormMode("none");
                        },
                      },
                    );
                  }}
                >
                  <FormGrid>
                    <Field label="Tipe">
                      <Select name="claimType" defaultValue="CUSTOMER">
                        <option value="CUSTOMER">Customer</option>
                        <option value="SUPPLIER">Supplier</option>
                        <option value="WARRANTY">Warranty</option>
                      </Select>
                    </Field>
                    <Field label="Partner">
                      <Input name="partnerName" />
                    </Field>
                    <Field label="Jumlah">
                      <Input
                        name="amount"
                        type="number"
                        step="0.01"
                        required
                      />
                    </Field>
                    <Field label="Alasan">
                      <Input name="reason" />
                    </Field>
                  </FormGrid>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Buat claim
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

            <div className="grid gap-4 xl:grid-cols-2">
              <Card title={`Sales returns (${salesReturnsPage.total})`}>
                {salesReturnsPage.total === 0 ? (
                  <EmptyState
                    compact
                    icon={RotateCcw}
                    title="Belum ada sales return"
                    message="Buat return dari pelanggan."
                    action={
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setFormMode("sr")}
                      >
                        Sales return
                      </Button>
                    }
                  />
                ) : (
                  <>
                    <Table
                      headers={[
                        "Nomor",
                        "Total",
                        "Status",
                        "Alasan",
                        "Aksi",
                      ]}
                    >
                      {salesReturnsPage.items.map((r) => (
                        <tr key={r.id}>
                          <td className="px-3 py-2 font-medium text-[#0F4C75]">
                            {r.number}
                          </td>
                          <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                            {formatIdr(r.total)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={retTone(r.status)}>{r.status}</Badge>
                          </td>
                          <td className="max-w-[8rem] truncate px-3 py-2 text-xs">
                            {r.reason || "—"}
                          </td>
                          <td className="px-3 py-2">
                            {r.status !== "POSTED" ? (
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() =>
                                  mutation.mutate({
                                    action: "post_sales_return",
                                    id: r.id,
                                    warehouseId: data.warehouses[0]?.id,
                                  })
                                }
                              >
                                Post
                              </Button>
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Table>
                    <PaginationBar
                      page={salesReturnsPage.page}
                      totalPages={salesReturnsPage.totalPages}
                      total={salesReturnsPage.total}
                      limit={salesReturnsPage.limit}
                      onPageChange={salesReturnsPage.setPage}
                    />
                  </>
                )}
              </Card>

              <Card title={`Purchase returns (${purchaseReturnsPage.total})`}>
                {purchaseReturnsPage.total === 0 ? (
                  <EmptyState
                    compact
                    icon={PackageMinus}
                    title="Belum ada purchase return"
                    message="Buat return ke pemasok."
                    action={
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setFormMode("pr")}
                      >
                        PR return
                      </Button>
                    }
                  />
                ) : (
                  <>
                    <Table headers={["Nomor", "Total", "Status", "Aksi"]}>
                      {purchaseReturnsPage.items.map((r) => (
                        <tr key={r.id}>
                          <td className="px-3 py-2 font-medium text-[#0F4C75]">
                            {r.number}
                          </td>
                          <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                            {formatIdr(r.total)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={retTone(r.status)}>{r.status}</Badge>
                          </td>
                          <td className="px-3 py-2">
                            {r.status !== "POSTED" ? (
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() =>
                                  mutation.mutate({
                                    action: "post_purchase_return",
                                    id: r.id,
                                    warehouseId: data.warehouses[0]?.id,
                                  })
                                }
                              >
                                Post
                              </Button>
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Table>
                    <PaginationBar
                      page={purchaseReturnsPage.page}
                      totalPages={purchaseReturnsPage.totalPages}
                      total={purchaseReturnsPage.total}
                      limit={purchaseReturnsPage.limit}
                      onPageChange={purchaseReturnsPage.setPage}
                    />
                  </>
                )}
              </Card>
            </div>

            <Card title="Credit / Debit note (accounting)">
              <div className="mb-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={cnMutation.isPending}
                  onClick={() => {
                    const id = cnQuery.data?.salesReturns[0]?.id;
                    if (!id) return;
                    cnMutation.mutate({
                      action: "from_sales_return",
                      salesReturnId: id,
                    });
                  }}
                >
                  CN dari sales return terbaru
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={cnMutation.isPending}
                  onClick={() => {
                    const id = cnQuery.data?.purchaseReturns[0]?.id;
                    if (!id) return;
                    cnMutation.mutate({
                      action: "from_purchase_return",
                      purchaseReturnId: id,
                    });
                  }}
                >
                  DN dari purchase return terbaru
                </Button>
              </div>
              <MutationError error={cnMutation.error} />
              {notesPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={FileText}
                  title="Belum ada credit/debit note"
                  message="Generate CN/DN dari return yang sudah ada."
                />
              ) : (
                <>
                  <Table headers={["Tipe", "Nomor", "Total", "Status"]}>
                    {notesPage.items.map((n) => (
                      <tr key={n.id}>
                        <td className="px-3 py-2">{n.noteType}</td>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {n.number}
                        </td>
                        <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                          {formatIdr(n.total)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={retTone(n.status)}>{n.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={notesPage.page}
                    totalPages={notesPage.totalPages}
                    total={notesPage.total}
                    limit={notesPage.limit}
                    onPageChange={notesPage.setPage}
                  />
                </>
              )}
            </Card>

            <Card title={`Claims (${claimsPage.total})`}>
              {claimsPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={ShieldAlert}
                  title="Belum ada claim"
                  message="Catat claim customer/supplier/warranty."
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setFormMode("claim")}
                    >
                      Claim
                    </Button>
                  }
                />
              ) : (
                <>
                  <Table
                    headers={[
                      "Nomor",
                      "Tipe",
                      "Partner",
                      "Jumlah",
                      "Status",
                    ]}
                  >
                    {claimsPage.items.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {c.number}
                        </td>
                        <td className="px-3 py-2">{c.claimType}</td>
                        <td className="px-3 py-2">{c.partnerName || "—"}</td>
                        <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                          {formatIdr(c.amount)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={retTone(c.status)}>{c.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={claimsPage.page}
                    totalPages={claimsPage.totalPages}
                    total={claimsPage.total}
                    limit={claimsPage.limit}
                    onPageChange={claimsPage.setPage}
                  />
                </>
              )}
            </Card>
          </>
        ) : null}
      </QueryBoundary>
    </ListPageShell>
  );
}
