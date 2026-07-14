"use client";

import { useState } from "react";
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
import {
  useProjectsMutation,
  useProjectsQuery,
} from "@/hooks/use-erp-queries";
import { formToObject } from "@/lib/api-client";
import { formatIdr } from "@/lib/money";

type ProjectsData = {
  projects: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    budgetAmount: string;
    actualCost: string;
    billedAmount: string;
    managerName: string | null;
    tasks: Array<{
      id: string;
      code: string;
      name: string;
      plannedHours: string;
      actualHours: string;
    }>;
    timesheets: Array<{
      id: string;
      hours: string;
      status: string;
      workDate: string;
    }>;
    expenses: Array<{ id: string; description: string; amount: string }>;
  }>;
  employees: Array<{ id: string; name: string; code: string }>;
  customers: Array<{ id: string; name: string }>;
};

export function ProjectsClient() {
  const query = useProjectsQuery();
  const mutation = useProjectsMutation();
  const data = query.data as ProjectsData | undefined;
  const [profit, setProfit] = useState<Record<string, string> | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader title="Projects" description="Fase 13 · budget & profitability" />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card title="Buat project">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate({
                      action: "create",
                      ...formToObject(e.currentTarget),
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="Kode">
                      <Input name="code" required />
                    </Field>
                    <Field label="Nama">
                      <Input name="name" required />
                    </Field>
                    <Field label="Customer">
                      <Select name="customerId" defaultValue="">
                        <option value="">—</option>
                        {data.customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Budget">
                      <Input name="budgetAmount" type="number" step="0.01" defaultValue="0" />
                    </Field>
                    <Field label="Manager">
                      <Input name="managerName" />
                    </Field>
                  </FormGrid>
                  <MutationError error={mutation.error} />
                  <Button type="submit" disabled={mutation.isPending}>
                    Simpan project
                  </Button>
                </form>
              </Card>

              <Card title="Task / timesheet / expense">
                <form
                  className="mb-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = formToObject(e.currentTarget);
                    mutation.mutate({
                      action: "task",
                      projectId: body.projectId,
                      code: body.code,
                      name: body.name,
                      plannedHours: body.plannedHours,
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="Project">
                      <Select name="projectId" required>
                        {data.projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Kode task">
                      <Input name="code" required />
                    </Field>
                    <Field label="Nama task">
                      <Input name="name" required />
                    </Field>
                    <Field label="Planned hours">
                      <Input name="plannedHours" type="number" defaultValue="8" />
                    </Field>
                  </FormGrid>
                  <Button type="submit" variant="secondary" disabled={mutation.isPending}>
                    Tambah task
                  </Button>
                </form>

                <form
                  className="mb-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate({
                      action: "timesheet",
                      ...formToObject(e.currentTarget),
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="Project">
                      <Select name="projectId" required>
                        {data.projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Task">
                      <Select name="taskId" defaultValue="">
                        <option value="">—</option>
                        {data.projects.flatMap((p) =>
                          p.tasks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {p.code}/{t.code}
                            </option>
                          )),
                        )}
                      </Select>
                    </Field>
                    <Field label="Karyawan">
                      <Select name="employeeId" defaultValue="">
                        <option value="">—</option>
                        {data.employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Tanggal">
                      <Input name="workDate" type="date" required />
                    </Field>
                    <Field label="Jam">
                      <Input name="hours" type="number" step="0.25" required />
                    </Field>
                  </FormGrid>
                  <Button type="submit" disabled={mutation.isPending}>
                    Submit timesheet
                  </Button>
                </form>

                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate({
                      action: "expense",
                      ...formToObject(e.currentTarget),
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="Project">
                      <Select name="projectId" required>
                        {data.projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Deskripsi">
                      <Input name="description" required />
                    </Field>
                    <Field label="Jumlah">
                      <Input name="amount" type="number" step="0.01" required />
                    </Field>
                  </FormGrid>
                  <Button type="submit" variant="secondary" disabled={mutation.isPending}>
                    Tambah expense
                  </Button>
                </form>
              </Card>
            </div>

            <Card title="Daftar project">
              {data.projects.length === 0 ? (
                <EmptyState message="Belum ada project" />
              ) : (
                <Table
                  headers={[
                    "Kode",
                    "Nama",
                    "Budget",
                    "Actual",
                    "Status",
                    "Tasks",
                    "Aksi",
                  ]}
                >
                  {data.projects.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2 font-medium">{p.code}</td>
                      <td className="px-3 py-2">{p.name}</td>
                      <td className="px-3 py-2">{formatIdr(p.budgetAmount)}</td>
                      <td className="px-3 py-2">{formatIdr(p.actualCost)}</td>
                      <td className="px-3 py-2">
                        <Badge>{p.status}</Badge>
                      </td>
                      <td className="px-3 py-2">{p.tasks.length}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {p.timesheets
                            .filter((t) => t.status === "PENDING_APPROVAL")
                            .slice(0, 1)
                            .map((t) => (
                              <Button
                                key={t.id}
                                type="button"
                                variant="secondary"
                                onClick={() =>
                                  mutation.mutate({
                                    action: "approve_timesheet",
                                    id: t.id,
                                  })
                                }
                              >
                                Approve TS
                              </Button>
                            ))}
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              mutation.mutate(
                                {
                                  action: "profitability",
                                  projectId: p.id,
                                },
                                {
                                  onSuccess: (res) =>
                                    setProfit(res as Record<string, string>),
                                },
                              );
                            }}
                          >
                            Profit
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>

            {profit ? (
              <Card title="Profitability">
                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  <div>Budget: {formatIdr(String(profit.budget))}</div>
                  <div>Actual: {formatIdr(String(profit.actualCost))}</div>
                  <div>Labor: {formatIdr(String(profit.laborCost))}</div>
                  <div>Expense: {formatIdr(String(profit.expenseCost))}</div>
                  <div>Billed: {formatIdr(String(profit.billedAmount))}</div>
                  <div>Margin: {formatIdr(String(profit.margin))}</div>
                  <div>Variance: {formatIdr(String(profit.variance))}</div>
                  <div>Hours: {String(profit.approvedHours)}</div>
                </div>
              </Card>
            ) : null}
          </>
        ) : null}
      </QueryBoundary>
    </div>
  );
}
