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
import {
  useProjectsMutation,
  useProjectsQuery,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formToObject } from "@/lib/api-client";
import { formatIdr } from "@/lib/money";
import {
  Briefcase,
  Clock,
  FolderKanban,
  Plus,
  Receipt,
  Wallet,
} from "lucide-react";

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

type FormMode = "none" | "project" | "task" | "timesheet" | "expense";

function projTone(
  status: string,
): "default" | "success" | "warning" | "danger" {
  const s = status.toUpperCase();
  if (s === "ACTIVE" || s === "COMPLETED" || s === "CLOSED") return "success";
  if (s === "DRAFT" || s === "ON_HOLD") return "warning";
  if (s === "CANCELLED") return "danger";
  return "default";
}

export function ProjectsClient() {
  const query = useProjectsQuery();
  const mutation = useProjectsMutation();
  const data = query.data as ProjectsData | undefined;
  const [profit, setProfit] = useState<Record<string, string> | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("none");
  const projects = data?.projects ?? [];
  const projectsPage = useClientPage(projects, 20);

  const stats = useMemo(() => {
    let budget = 0;
    let actual = 0;
    let tasks = 0;
    for (const p of projects) {
      budget += Number(p.budgetAmount) || 0;
      actual += Number(p.actualCost) || 0;
      tasks += p.tasks.length;
    }
    return {
      count: projects.length,
      budget,
      actual,
      tasks,
    };
  }, [projects]);

  function toggle(mode: FormMode) {
    setFormMode((m) => (m === mode ? "none" : mode));
  }

  return (
    <ListPageShell>
      <PageHeader
        title="Projects"
        description="Budget · task · timesheet · expense · profitability"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={formMode === "expense" ? "primary" : "secondary"}
              onClick={() => toggle("expense")}
            >
              <Receipt className="mr-1.5 size-4" />
              Expense
            </Button>
            <Button
              type="button"
              variant={formMode === "timesheet" ? "primary" : "secondary"}
              onClick={() => toggle("timesheet")}
            >
              <Clock className="mr-1.5 size-4" />
              Timesheet
            </Button>
            <Button
              type="button"
              variant={formMode === "task" ? "primary" : "secondary"}
              onClick={() => toggle("task")}
            >
              <FolderKanban className="mr-1.5 size-4" />
              Task
            </Button>
            <Button
              type="button"
              variant={formMode === "project" ? "secondary" : "primary"}
              onClick={() => toggle("project")}
            >
              <Plus className="mr-1.5 size-4" />
              {formMode === "project" ? "Tutup" : "Project"}
            </Button>
          </div>
        }
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat projects..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Projects"
                value={stats.count}
                icon={Briefcase}
              />
              <StatCard
                label="Budget"
                value={formatIdr(stats.budget)}
                icon={Wallet}
              />
              <StatCard
                label="Actual"
                value={formatIdr(stats.actual)}
              />
              <StatCard
                label="Tasks"
                value={stats.tasks}
                icon={FolderKanban}
              />
            </div>

            <MutationError error={mutation.error} />

            {formMode === "project" ? (
              <Card title="Buat project">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate(
                      {
                        action: "create",
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
                      <Input
                        name="budgetAmount"
                        type="number"
                        step="0.01"
                        defaultValue="0"
                      />
                    </Field>
                    <Field label="Manager">
                      <Input name="managerName" />
                    </Field>
                  </FormGrid>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Simpan project
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

            {formMode === "task" ? (
              <Card title="Tambah task">
                {projects.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Briefcase}
                    title="Belum ada project"
                    message="Buat project dulu."
                  />
                ) : (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const body = formToObject(e.currentTarget);
                      mutation.mutate(
                        {
                          action: "task",
                          projectId: body.projectId,
                          code: body.code,
                          name: body.name,
                          plannedHours: body.plannedHours,
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
                        <Input
                          name="plannedHours"
                          type="number"
                          defaultValue="8"
                        />
                      </Field>
                    </FormGrid>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="submit"
                        variant="secondary"
                        disabled={mutation.isPending}
                      >
                        Tambah task
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

            {formMode === "timesheet" ? (
              <Card title="Submit timesheet">
                {projects.length === 0 ? (
                  <EmptyState
                    compact
                    title="Belum ada project"
                    message="Buat project dulu."
                  />
                ) : (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      mutation.mutate(
                        {
                          action: "timesheet",
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
                        <Input
                          name="hours"
                          type="number"
                          step="0.25"
                          required
                        />
                      </Field>
                    </FormGrid>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={mutation.isPending}>
                        Submit timesheet
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

            {formMode === "expense" ? (
              <Card title="Tambah expense">
                {projects.length === 0 ? (
                  <EmptyState
                    compact
                    title="Belum ada project"
                    message="Buat project dulu."
                  />
                ) : (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      mutation.mutate(
                        {
                          action: "expense",
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
                        <Input
                          name="amount"
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
                        Tambah expense
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

            <Card title={`Daftar project (${projectsPage.total})`}>
              {projectsPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={Briefcase}
                  title="Belum ada project"
                  message="Buat project untuk budget, task, dan profitability."
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setFormMode("project")}
                    >
                      <Plus className="mr-1.5 size-4" />
                      Project
                    </Button>
                  }
                />
              ) : (
                <>
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
                    {projectsPage.items.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {p.code}
                        </td>
                        <td className="px-3 py-2">{p.name}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatIdr(p.budgetAmount)}
                        </td>
                        <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                          {formatIdr(p.actualCost)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={projTone(p.status)}>{p.status}</Badge>
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {p.tasks.length}
                        </td>
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
                                  disabled={mutation.isPending}
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
                              disabled={mutation.isPending}
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
                  <PaginationBar
                    page={projectsPage.page}
                    totalPages={projectsPage.totalPages}
                    total={projectsPage.total}
                    limit={projectsPage.limit}
                    onPageChange={projectsPage.setPage}
                  />
                </>
              )}
            </Card>

            {profit ? (
              <Card title="Profitability">
                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    Budget:{" "}
                    <span className="font-semibold text-[#0F4C75]">
                      {formatIdr(String(profit.budget))}
                    </span>
                  </div>
                  <div>
                    Actual:{" "}
                    <span className="font-semibold text-[#0F4C75]">
                      {formatIdr(String(profit.actualCost))}
                    </span>
                  </div>
                  <div>Labor: {formatIdr(String(profit.laborCost))}</div>
                  <div>Expense: {formatIdr(String(profit.expenseCost))}</div>
                  <div>Billed: {formatIdr(String(profit.billedAmount))}</div>
                  <div>
                    Margin:{" "}
                    <span className="font-semibold text-[#0F4C75]">
                      {formatIdr(String(profit.margin))}
                    </span>
                  </div>
                  <div>Variance: {formatIdr(String(profit.variance))}</div>
                  <div>Hours: {String(profit.approvedHours)}</div>
                </div>
              </Card>
            ) : null}
          </>
        ) : null}
      </QueryBoundary>
    </ListPageShell>
  );
}
