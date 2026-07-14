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
import {
  usePurchaseRequestMutation,
  usePurchaseRequestsQuery,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formToObject } from "@/lib/api-client";

export function PurchaseRequestsClient() {
  const query = usePurchaseRequestsQuery();
  const mutation = usePurchaseRequestMutation();
  const data = query.data as
    | {
        requests: Array<{
          id: string;
          number: string;
          status: string;
          items: Array<{ sku: string; quantity: string }>;
        }>;
        products: Array<{ id: string; sku: string; name: string }>;
        branches: Array<{ id: string; code: string; name: string }>;
      }
    | undefined;
  const requestsPage = useClientPage(data?.requests ?? [], 20);

  return (
    <div className="space-y-6">
      <PageHeader title="Purchase Request" description="TanStack Query" />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <Card title="Buat PR">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const body = formToObject(e.currentTarget);
                  mutation.mutate(
                    {
                      action: "create",
                      branchId: body.branchId || undefined,
                      notes: body.notes || undefined,
                      items: [
                        {
                          productId: body.productId,
                          quantity: body.quantity,
                        },
                      ],
                    },
                    { onSuccess: () => e.currentTarget.reset() },
                  );
                }}
              >
                <FormGrid>
                  <Field label="Cabang">
                    <Select name="branchId" defaultValue={data.branches[0]?.id}>
                      {data.branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.code}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Produk">
                    <Select name="productId" required>
                      <option value="">Pilih</option>
                      {data.products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Qty">
                    <Input name="quantity" type="number" step="0.0001" required />
                  </Field>
                  <Field label="Catatan">
                    <Input name="notes" />
                  </Field>
                </FormGrid>
                <MutationError error={mutation.error} />
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Menyimpan..." : "Simpan PR"}
                </Button>
              </form>
            </Card>
            <Card title={`Daftar (${requestsPage.total})`}>
              {requestsPage.total === 0 ? (
                <EmptyState message="Belum ada PR" />
              ) : (
                <>
                  <Table headers={["Nomor", "Status", "Item", "Aksi"]}>
                    {requestsPage.items.map((pr) => (
                      <tr key={pr.id}>
                        <td className="px-3 py-2">{pr.number}</td>
                        <td className="px-3 py-2">
                          <Badge>{pr.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {pr.items.map((i) => `${i.sku}×${i.quantity}`).join(", ")}
                        </td>
                        <td className="px-3 py-2">
                          {pr.status === "DRAFT" ? (
                            <Button
                              type="button"
                              disabled={mutation.isPending}
                              onClick={() =>
                                mutation.mutate({ action: "approve", id: pr.id })
                              }
                            >
                              Approve
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={requestsPage.page}
                    totalPages={requestsPage.totalPages}
                    total={requestsPage.total}
                    limit={requestsPage.limit}
                    onPageChange={requestsPage.setPage}
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
