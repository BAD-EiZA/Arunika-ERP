"use client";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  Input,
  PageHeader,
  PaginationBar,
  Select,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useRfqMutation, useRfqQuery } from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formToObject } from "@/lib/api-client";
import { formatIdr } from "@/lib/money";

type RfqData = {
  rfqs: Array<{
    id: string;
    number: string;
    status: string;
    vendors: Array<{ supplierName: string }>;
    quotationCount: number;
  }>;
  suppliers: Array<{ id: string; name: string }>;
  products: Array<{ id: string; sku: string; name: string; purchasePrice: string }>;
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

export function RfqClient() {
  const query = useRfqQuery();
  const mutation = useRfqMutation();
  const data = query.data as RfqData | undefined;
  const rfqsPage = useClientPage(data?.rfqs ?? [], 20);

  return (
    <div className="space-y-6">
      <PageHeader title="RFQ & Quotation" description="TanStack Query" />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card title="Buat RFQ">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const supplierIds = fd.getAll("supplierIds").map(String);
                    mutation.mutate({
                      action: "create",
                      purchaseRequestId: String(fd.get("purchaseRequestId") || "") || undefined,
                      supplierIds,
                      notes: String(fd.get("notes") || "") || undefined,
                    });
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
                  <Button type="submit" disabled={mutation.isPending}>
                    Kirim RFQ
                  </Button>
                </form>
              </Card>

              <Card title="Input quotation">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    mutation.mutate({
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
                    });
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
                      <Input name="quantity" type="number" step="0.0001" required />
                    </Field>
                    <Field label="Harga">
                      <Input name="unitPrice" type="number" step="0.01" required />
                    </Field>
                  </FormGrid>
                  <Button type="submit" variant="secondary" disabled={mutation.isPending}>
                    Simpan quotation
                  </Button>
                </form>
              </Card>
            </div>

            <Card title="Award → PO">
              {data.quotations.length === 0 ? (
                <EmptyState message="Belum ada quotation" />
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    mutation.mutate({
                      action: "award",
                      quotationId: body.quotationId,
                      rfqId: body.rfqId,
                      warehouseId: body.warehouseId || undefined,
                      branchId: body.branchId || undefined,
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="Quotation">
                      <Select name="quotationId" required>
                        {data.quotations.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.rfqNumber} / {q.supplierName} / {formatIdr(q.total)}
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
                      <Select name="warehouseId" defaultValue={data.warehouses[0]?.id}>
                        {data.warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.code}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Cabang">
                      <Select name="branchId" defaultValue={data.branches[0]?.id}>
                        {data.branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.code}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </FormGrid>
                  <Button type="submit" disabled={mutation.isPending}>
                    Award & buat PO
                  </Button>
                </form>
              )}
            </Card>

            <Card title={`Daftar RFQ (${rfqsPage.total})`}>
              {rfqsPage.total === 0 ? (
                <EmptyState message="Belum ada RFQ" />
              ) : (
                <>
                  <Table headers={["Nomor", "Status", "Vendor", "Quotations"]}>
                    {rfqsPage.items.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2">{r.number}</td>
                        <td className="px-3 py-2">
                          <Badge>{r.status}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          {r.vendors.map((v) => v.supplierName).join(", ")}
                        </td>
                        <td className="px-3 py-2">{r.quotationCount}</td>
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
          </>
        ) : null}
      </QueryBoundary>
    </div>
  );
}
