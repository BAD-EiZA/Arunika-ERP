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
  Select,
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, formToObject } from "@/lib/api-client";
import { formatIdr } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Plus, ShieldCheck, Users } from "lucide-react";

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
  const [showCreate, setShowCreate] = useState(false);
  const matrix = query.data?.matrix ?? [];

  const stats = useMemo(() => {
    const active = matrix.filter((r) => r.isActive).length;
    const docTypes = new Set(matrix.map((r) => r.docType)).size;
    return { total: matrix.length, active, docTypes };
  }, [matrix]);

  return (
    <ListPageShell>
      <PageHeader
        title="Approval Matrix"
        description="Role per doc type & rentang nilai"
        crumbs={[
          { label: "ERP", href: "/dashboard" },
          { label: "Keuangan" },
          { label: "Approval" },
        ]}
        actions={
          <Button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            variant={showCreate ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showCreate ? "Tutup form" : "Tambah rule"}
          </Button>
        }
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat approval matrix..."
      >
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Rules"
              value={stats.total}
              icon={ShieldCheck}
            />
            <StatCard label="Aktif" value={stats.active} />
            <StatCard
              label="Doc types"
              value={stats.docTypes}
              icon={Users}
            />
          </div>

          {showCreate ? (
            <Card title="Tambah rule">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate(
                    {
                      action: "upsert",
                      ...formToObject(e.currentTarget),
                    },
                    {
                      onSuccess: () => {
                        e.currentTarget.reset();
                        setShowCreate(false);
                      },
                    },
                  );
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
                    <Input
                      name="maxAmount"
                      type="number"
                      placeholder="kosong = ∞"
                    />
                  </Field>
                  <Field label="Step">
                    <Input name="stepOrder" type="number" defaultValue="1" />
                  </Field>
                </FormGrid>
                <MutationError error={mutation.error} />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={mutation.isPending}>
                    Simpan rule
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowCreate(false)}
                  >
                    Batal
                  </Button>
                </div>
              </form>
            </Card>
          ) : null}

          <Card title={`Rules (${matrix.length})`}>
            {matrix.length === 0 ? (
              <EmptyState
                compact
                icon={ShieldCheck}
                title="Belum ada matrix"
                message="Tanpa rule, approve berjalan bebas. Tambah rule untuk batasi role per nilai."
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowCreate(true)}
                  >
                    <Plus className="mr-1.5 size-4" />
                    Tambah rule
                  </Button>
                }
              />
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
                {matrix.map((r) => (
                  <tr
                    key={r.id}
                    className={cn(!r.isActive && "opacity-60")}
                  >
                    <td className="px-3 py-2 font-medium text-[#0F4C75]">
                      {r.docType}
                    </td>
                    <td className="px-3 py-2">{r.roleCode}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatIdr(r.minAmount)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.maxAmount ? formatIdr(r.maxAmount) : "∞"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.stepOrder}</td>
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
        </>
      </QueryBoundary>
    </ListPageShell>
  );
}
