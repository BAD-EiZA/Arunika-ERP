"use client";

import { useEffect, useState } from "react";
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
import {
  createInitialLines,
  LineItemsEditor,
  linesToPayload,
  type LineItemDraft,
} from "@/components/line-items-editor";
import {
  useSalesOrderMutation,
  useSalesOrdersQuery,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";

export function SalesOrdersClient() {
  const query = useSalesOrdersQuery();
  const mutation = useSalesOrderMutation();
  const data = query.data;
  const [lines, setLines] = useState<LineItemDraft[]>([]);
  const ordersPage = useClientPage(data?.orders ?? [], 20);

  useEffect(() => {
    if (data?.products?.length && lines.length === 0) {
      setLines(createInitialLines(data.products, "sell"));
    }
  }, [data?.products, lines.length]);

  return (
    <div className="space-y-6">
      <PageHeader title="Sales Order" description="Multi-item · TanStack Query" />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <Card title="Buat SO">
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const items = linesToPayload(lines);
                  if (!items.length) return;
                  mutation.mutate(
                    {
                      action: "create",
                      customerId: String(fd.get("customerId") ?? ""),
                      warehouseId: String(fd.get("warehouseId") ?? "") || undefined,
                      branchId: String(fd.get("branchId") ?? "") || undefined,
                      notes: String(fd.get("notes") ?? "") || undefined,
                      items,
                    },
                    {
                      onSuccess: () => {
                        e.currentTarget.reset();
                        setLines(createInitialLines(data.products, "sell"));
                      },
                    },
                  );
                }}
              >
                <FormGrid>
                  <Field label="Pelanggan">
                    <Select name="customerId" required>
                      <option value="">Pilih</option>
                      {data.customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.name}
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
                  <Field label="Catatan">
                    <Input name="notes" />
                  </Field>
                </FormGrid>

                <LineItemsEditor
                  products={data.products}
                  mode="sell"
                  lines={lines}
                  onChange={setLines}
                />

                <MutationError error={mutation.error} />
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Menyimpan..." : "Buat draft SO"}
                </Button>
              </form>
            </Card>

            <Card title={`Daftar SO (${ordersPage.total})`}>
              {ordersPage.total === 0 ? (
                <EmptyState message="Belum ada SO" />
              ) : (
                <>
                <Table
                  headers={["Nomor", "Pelanggan", "Item", "Total", "Status", "Tanggal", "Aksi"]}
                >
                  {ordersPage.items.map((so) => (
                    <tr key={so.id}>
                      <td className="px-3 py-2">
                        <a
                          className="font-medium text-accent underline"
                          href={`/api/erp/pdf/so/${so.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {so.number}
                        </a>
                      </td>
                      <td className="px-3 py-2">{so.customer.name}</td>
                      <td className="px-3 py-2 text-xs">
                        {so.items.map((i) => `${i.sku}×${i.quantity}`).join(", ")}
                      </td>
                      <td className="px-3 py-2">{formatIdr(so.total)}</td>
                      <td className="px-3 py-2">
                        <Badge>{so.status}</Badge>
                      </td>
                      <td className="px-3 py-2">{formatDateId(so.orderDate)}</td>
                      <td className="px-3 py-2">
                        {["DRAFT", "PENDING_APPROVAL"].includes(so.status) ? (
                          <Button
                            type="button"
                            disabled={mutation.isPending}
                            onClick={() =>
                              mutation.mutate({ action: "approve", id: so.id })
                            }
                          >
                            Approve + reserve
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </Table>
                <PaginationBar
                  page={ordersPage.page}
                  totalPages={ordersPage.totalPages}
                  total={ordersPage.total}
                  limit={ordersPage.limit}
                  onPageChange={ordersPage.setPage}
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
