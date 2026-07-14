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

export function PayrollClient() {
  const query = usePayrollQuery();
  const mutation = usePayrollMutation();
  const data = query.data as PayrollData | undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Payroll" description="Fase 11 · BPJS/PPh sederhana" />
      <Card title="Siapkan payroll">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({
              action: "prepare",
              ...formToObject(e.currentTarget),
            });
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
          <Button type="submit" disabled={mutation.isPending}>
            Prepare payroll
          </Button>
        </form>
      </Card>

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <Card title="Payroll runs">
          {!data || data.runs.length === 0 ? (
            <EmptyState message="Belum ada payroll run" />
          ) : (
            <div className="space-y-6">
              {data.runs.map((r) => (
                <div key={r.id} className="rounded-lg border border-border p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{r.number}</div>
                      <div className="text-xs text-muted">
                        {formatDateId(r.periodStart)} — {formatDateId(r.periodEnd)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge>{r.status}</Badge>
                      {r.status === "DRAFT" ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            mutation.mutate({ action: "approve", id: r.id })
                          }
                        >
                          Approve
                        </Button>
                      ) : null}
                      {r.status === "APPROVED" ? (
                        <Button
                          type="button"
                          onClick={() =>
                            mutation.mutate({ action: "post", id: r.id })
                          }
                        >
                          Post
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mb-2 grid gap-2 text-sm sm:grid-cols-3">
                    <div>Gross: {formatIdr(r.totalGross)}</div>
                    <div>Potongan: {formatIdr(r.totalDeduction)}</div>
                    <div>Net: {formatIdr(r.totalNet)}</div>
                  </div>
                  <Table headers={["Karyawan", "Gaji", "Gross", "PPh", "BPJS", "Net"]}>
                    {r.lines.map((l, idx) => (
                      <tr key={`${r.id}-${idx}`}>
                        <td className="px-3 py-2">{l.employeeName}</td>
                        <td className="px-3 py-2">{formatIdr(l.baseSalary)}</td>
                        <td className="px-3 py-2">{formatIdr(l.grossPay)}</td>
                        <td className="px-3 py-2">{formatIdr(l.taxAmount)}</td>
                        <td className="px-3 py-2">{formatIdr(l.bpjsAmount)}</td>
                        <td className="px-3 py-2 font-medium">
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
      </QueryBoundary>
    </div>
  );
}
