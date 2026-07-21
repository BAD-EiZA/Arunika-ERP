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
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  usePayrollMutation,
  usePayrollQuery,
} from "@/hooks/use-erp-queries";
import { formToObject } from "@/lib/api-client";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";
import { Banknote, FileEdit, Plus, Wallet } from "lucide-react";

type PayrollData = {
  runs: Array<{
    id: string;
    number: string;
    status: string;
    periodStart: string;
    periodEnd: string;
    totalGross: string;
    totalDeduction: string;
    totalNet: string;
    lines: Array<{
      employeeName: string;
      baseSalary: string;
      grossPay: string;
      netPay: string;
      taxAmount: string;
      bpjsAmount: string;
    }>;
  }>;
};

function payTone(
  status: string,
): "default" | "success" | "warning" | "danger" {
  const s = status.toUpperCase();
  if (s === "POSTED" || s === "PAID") return "success";
  if (s === "APPROVED") return "success";
  if (s === "DRAFT") return "warning";
  return "default";
}

export function PayrollClient() {
  const query = usePayrollQuery();
  const mutation = usePayrollMutation();
  const data = query.data as PayrollData | undefined;
  const [showPrepare, setShowPrepare] = useState(false);
  const runs = data?.runs ?? [];

  const stats = useMemo(() => {
    let draft = 0;
    let net = 0;
    for (const r of runs) {
      if (r.status === "DRAFT") draft += 1;
      net += Number(r.totalNet) || 0;
    }
    return { count: runs.length, draft, net };
  }, [runs]);

  return (
    <ListPageShell>
      <PageHeader
        title="Payroll"
        description="Siapkan run · approve · post · BPJS/PPh sederhana"
        actions={
          <Button
            type="button"
            onClick={() => setShowPrepare((v) => !v)}
            variant={showPrepare ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showPrepare ? "Tutup form" : "Siapkan payroll"}
          </Button>
        }
      />

      {showPrepare ? (
        <Card title="Siapkan payroll">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate(
                {
                  action: "prepare",
                  ...formToObject(e.currentTarget),
                },
                {
                  onSuccess: () => {
                    e.currentTarget.reset();
                    setShowPrepare(false);
                  },
                },
              );
            }}
          >
            <FormGrid>
              <Field label="Periode mulai">
                <Input name="periodStart" type="date" required />
              </Field>
              <Field label="Periode selesai">
                <Input name="periodEnd" type="date" required />
              </Field>
            </FormGrid>
            <MutationError error={mutation.error} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={mutation.isPending}>
                Prepare payroll
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowPrepare(false)}
              >
                Batal
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat payroll..."
      >
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Runs" value={stats.count} icon={Banknote} />
            <StatCard label="Draft" value={stats.draft} icon={FileEdit} />
            <StatCard
              label="Total net"
              value={formatIdr(stats.net)}
              icon={Wallet}
            />
          </div>

          <Card title="Payroll runs">
            {runs.length === 0 ? (
              <EmptyState
                compact
                icon={Banknote}
                title="Belum ada payroll run"
                message="Siapkan payroll untuk periode gaji karyawan."
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowPrepare(true)}
                  >
                    <Plus className="mr-1.5 size-4" />
                    Siapkan payroll
                  </Button>
                }
              />
            ) : (
              <div className="space-y-4">
                {runs.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-2xl border border-border/70 bg-white p-4 shadow-[0_2px_8px_rgba(15,76,117,0.04)]"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-[#0F4C75]">
                          {r.number}
                        </div>
                        <div className="text-xs text-muted">
                          {formatDateId(r.periodStart)} —{" "}
                          {formatDateId(r.periodEnd)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={payTone(r.status)}>{r.status}</Badge>
                        {r.status === "DRAFT" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={mutation.isPending}
                            onClick={() =>
                              mutation.mutate({
                                action: "approve",
                                id: r.id,
                              })
                            }
                          >
                            Approve
                          </Button>
                        ) : null}
                        {r.status === "APPROVED" ? (
                          <Button
                            type="button"
                            disabled={mutation.isPending}
                            onClick={() =>
                              mutation.mutate({ action: "post", id: r.id })
                            }
                          >
                            Post
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="mb-3 grid gap-2 text-sm sm:grid-cols-3">
                      <div>
                        Gross:{" "}
                        <span className="font-semibold tabular-nums text-[#0F4C75]">
                          {formatIdr(r.totalGross)}
                        </span>
                      </div>
                      <div>
                        Potongan:{" "}
                        <span className="tabular-nums">
                          {formatIdr(r.totalDeduction)}
                        </span>
                      </div>
                      <div>
                        Net:{" "}
                        <span className="font-semibold tabular-nums text-[#0F4C75]">
                          {formatIdr(r.totalNet)}
                        </span>
                      </div>
                    </div>
                    <Table
                      headers={[
                        "Karyawan",
                        "Gaji",
                        "Gross",
                        "PPh",
                        "BPJS",
                        "Net",
                      ]}
                    >
                      {r.lines.map((l, idx) => (
                        <tr key={`${r.id}-${idx}`}>
                          <td className="px-3 py-2">{l.employeeName}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatIdr(l.baseSalary)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatIdr(l.grossPay)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatIdr(l.taxAmount)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatIdr(l.bpjsAmount)}
                          </td>
                          <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                            {formatIdr(l.netPay)}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      </QueryBoundary>
    </ListPageShell>
  );
}
