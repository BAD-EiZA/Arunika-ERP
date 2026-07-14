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
  Select,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, formToObject } from "@/lib/api-client";
import { formatIdr } from "@/lib/money";

type MatrixData = {
  matrix: Array<{
    id: string;
    docType: string;
    minAmount: string;
    maxAmount: string | null;
    roleCode: string;
    stepOrder: number;
    isActive: boolean;
  }>;
};

export function ApprovalsClient() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["finance", "approvals"],
    queryFn: () => apiGet<MatrixData>("/api/erp/finance/approvals"),
  });
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost("/api/erp/finance/approvals", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["finance", "approvals"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval Matrix"
        description="Role per doc type & rentang nilai"
        crumbs={[
          { label: "ERP", href: "/dashboard" },
          { label: "Keuangan" },
          { label: "Approval" },
        ]}
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <Card title="Tambah rule">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate({
                action: "upsert",
                ...formToObject(e.currentTarget),
              });
              e.currentTarget.reset();
            }}
          >
            <FormGrid>
              <Field label="Doc type">
                <Select name="docType" defaultValue="SALES_ORDER">
                  <option value="SALES_ORDER">SALES_ORDER</option>
                  <option value="PURCHASE_ORDER">PURCHASE_ORDER</option>
                  <option value="EXPENSE">EXPENSE</option>
                  <option value="JOURNAL">JOURNAL</option>
                  <option value="BUDGET">BUDGET</option>
                </Select>
              </Field>
              <Field label="Role code">
                <Input name="roleCode" placeholder="MANAGER" required />
              </Field>
              <Field label="Min amount">
                <Input name="minAmount" type="number" defaultValue="0" />
              </Field>
              <Field label="Max amount">
                <Input name="maxAmount" type="number" placeholder="kosong = ∞" />
              </Field>
              <Field label="Step">
                <Input name="stepOrder" type="number" defaultValue="1" />
              </Field>
            </FormGrid>
            <MutationError error={mutation.error} />
            <Button type="submit" disabled={mutation.isPending}>
              Simpan rule
            </Button>
          </form>
        </Card>
        <Card title={`Rules (${query.data?.matrix.length ?? 0})`}>
          {!query.data?.matrix.length ? (
            <EmptyState message="Belum ada matrix — approve bebas" />
          ) : (
            <Table
              headers={[
                "Doc",
                "Role",
                "Min",
                "Max",
                "Step",
                "Status",
                "Aksi",
              ]}
            >
              {query.data.matrix.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium">{r.docType}</td>
                  <td className="px-3 py-2">{r.roleCode}</td>
                  <td className="px-3 py-2">{formatIdr(r.minAmount)}</td>
                  <td className="px-3 py-2">
                    {r.maxAmount ? formatIdr(r.maxAmount) : "∞"}
                  </td>
                  <td className="px-3 py-2">{r.stepOrder}</td>
                  <td className="px-3 py-2">
                    <Badge tone={r.isActive ? "success" : "danger"}>
                      {r.isActive ? "Aktif" : "Off"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({ action: "delete", id: r.id })
                      }
                    >
                      Nonaktifkan
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </QueryBoundary>
    </div>
  );
}
