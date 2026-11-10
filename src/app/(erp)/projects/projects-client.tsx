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
  canPost: boolean;
  accounts: Array<{ code: string; name: string; type: string }>;
  allocations: Array<{ id: string; projectId: string; journalLineId: string; kind: string; amount: string; status: string }>;
  sourceLines: Array<{ id: string; kind: "PAYROLL" | "MATERIAL"; label: string; amount: string }>;
  projects: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    budgetAmount: string;
    actualCost: string | null;
    billedAmount: string;
    invoices: Array<{ id: string; number: string; total: string; status: string }>;
    billings: Array<{ sourceType: string; sourceId: string }>;
    customerId: string | null;
    managerName: string | null;
    tasks: Array<{
      id: string;
      code: string;
      name: string;
      plannedHours: string;
      actualHours: string;
      billableAmount: string;
      status: string;
    }>;
    timesheets: Array<{
      id: string;
      hours: string;
      status: string;
      workDate: string;
    }>;
    expenses: Array<{ id: string; description: string; amount: string; status: string; debitAccountCode: string | null; creditAccountCode: string | null }>;
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
  const [profit, setProfit] = useState<{ coverage: string; allocatedLaborCost: string; materialCost: string; invalidAllocationCount: number; recordedMargin: string; budget: string; actualCost: string | null; laborCost: string | null; expenseCost: string; billedAmount: string; margin: string | null; variance: string | null; knownCost: string; costStatus: string; costNote: string; unverifiedExpenseCount: number; approvedHours: string } | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("none");
  const projects = data?.projects ?? [];
  const projectsPage = useClientPage(projects, 20);

  const stats = useMemo(() => {
    let budget = 0;
    let tasks = 0;
    for (const p of projects) {
      budget += Number(p.budgetAmount) || 0;
      tasks += p.tasks.length;
    }
    return { count: projects.length, budget, tasks };
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
                label="Biaya aktual"
                value="Belum diverifikasi"
              />
              <StatCard
                label="Tasks"
                value={stats.tasks}
                icon={FolderKanban}
              />
            </div>

            <MutationError error={mutation.error} />
            {data.canPost ? <Card title="Project accounting — approval, GL, alokasi biaya aktual">
              <p className="text-sm">Alokasi seluruh baris jurnal payroll/material; bukan tarif estimasi. Pembalikan hanya membatalkan atribusi project, tidak membalik GL sumber. Sumber yang dibatalkan tidak dapat dipakai ulang.</p>
              {projects.map((p) => <section key={p.id} className="space-y-3 border-b py-3">
                <h3 className="font-medium">{p.code} — {p.name}</h3>
                {p.expenses.map((expense) => <div key={expense.id} className="space-y-2">
                  <p>{expense.description} · {formatIdr(expense.amount)} · {expense.status} {expense.debitAccountCode ? `(${expense.debitAccountCode} / ${expense.creditAccountCode})` : ""}</p>
                  {expense.status === "DRAFT" ? <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); mutation.mutate({ action: "approve_expense", id: expense.id, ...formToObject(event.currentTarget) }); }}>
                    <Field label="Debit biaya"><Select name="debitAccountCode" required defaultValue=""><option value="">Pilih akun</option>{data.accounts.filter((a) => ["EXPENSE", "COGS", "OTHER_EXPENSE"].includes(a.type)).map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</Select></Field>
                    <Field label="Credit penyelesaian / utang"><Select name="creditAccountCode" required defaultValue=""><option value="">Pilih akun</option>{data.accounts.filter((a) => ["ASSET", "LIABILITY"].includes(a.type)).map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</Select></Field>
                    <Button disabled={mutation.isPending}>Approve expense</Button>
                  </form> : expense.status === "APPROVED" ? <Button disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "post_expense", id: expense.id })}>Post expense ke GL</Button> : null}
                </div>)}
                <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); const values = formToObject(event.currentTarget); const source = data.sourceLines.find((l) => l.id === values.journalLineId); if (source) mutation.mutate({ action: "allocate_cost", projectId: p.id, journalLineId: source.id, kind: source.kind }); }}>
                  <Field label="Sumber biaya POSTED (200 terbaru; validasi ulang saat simpan)"><Select name="journalLineId" required defaultValue=""><option value="">Pilih baris jurnal</option>{data.sourceLines.map((l) => <option key={l.id} value={l.id}>{l.kind} · {l.label} · {formatIdr(l.amount)}</option>)}</Select></Field>
                  <Button disabled={mutation.isPending}>Alokasi biaya aktual</Button>
                </form>
                {data.allocations.filter((a) => a.projectId === p.id).map((a) => <div key={a.id}><p>{a.kind} · {a.journalLineId} · {formatIdr(a.amount)} · {a.status}</p>{a.status === "POSTED" ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); mutation.mutate({ action: "reverse_allocation", id: a.id, ...formToObject(event.currentTarget) }); }}><Field label="Alasan pembalikan"><Input name="reason" required /></Field><Button disabled={mutation.isPending}>Batalkan alokasi</Button></form> : null}</div>)}
              </section>)}
            </Card> : null}
            <Card title="Billing proposal / invoice project">
              {projects.map((p) => <section key={p.id} className="space-y-2 border-b py-3">
                <h3 className="font-medium">{p.code} — {p.name} · Billed {formatIdr(p.billedAmount)}</h3>
                {p.tasks.filter((t) => t.status !== "CLOSED").map((t) => <Button key={t.id} disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "complete_task", projectId: p.id, taskId: t.id })}>Selesaikan milestone/task: {t.name}</Button>)}
                <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); const f = formToObject(e.currentTarget); const [sourceType, sourceId] = f.source.split(":"); mutation.mutate({ action: "bill", projectId: p.id, sourceType, sourceId, hourlyRate: f.hourlyRate, idempotencyKey: `project:${p.id}:${sourceType}:${sourceId}` }); }}>
                  <Field label="Proposal sumber belum ditagih"><Select name="source" required><option value="">Pilih sumber</option>
                    {p.tasks.filter((t) => ["CLOSED", "APPROVED"].includes(t.status) && Number(t.billableAmount) > 0 && !p.billings.some((b) => b.sourceType === "task" && b.sourceId === t.id)).map((t) => <option key={t.id} value={`task:${t.id}`}>{t.name} — {formatIdr(t.billableAmount)}</option>)}
                    {p.timesheets.filter((t) => ["APPROVED", "POSTED"].includes(t.status) && !p.billings.some((b) => b.sourceType === "timesheet" && b.sourceId === t.id)).map((t) => <option key={t.id} value={`timesheet:${t.id}`}>Timesheet {t.workDate.slice(0, 10)} — {t.hours} jam</option>)}
                  </Select></Field>
                  <Field label="Tarif per jam (timesheet)"><Input name="hourlyRate" type="number" min="0" step="0.01" defaultValue="0" /></Field>
                  <Button disabled={mutation.isPending || !p.customerId}>Generate invoice</Button>
                </form>
                <Table headers={["Invoice", "Status", "Nilai"]}><tbody>{p.invoices.map((i) => <tr key={i.id}><td>{i.number}</td><td>{i.status}</td><td>{formatIdr(i.total)}</td></tr>)}</tbody></Table>
              </section>)}
            </Card>

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
                          billableAmount: body.billableAmount,
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
                      <Field label="Nilai milestone/task"><Input name="billableAmount" type="number" min="0" step="0.01" defaultValue="0" /></Field>
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
              <Card title="Tambah expense (draft, belum diposting ke GL)">
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
                      "Biaya aktual",
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
                          Belum diverifikasi
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
                                      setProfit(res as NonNullable<typeof profit>),
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
              <Card title="Profitability — sumber biaya tercatat">
                <p className="mb-3 text-sm">{profit.costNote} Status biaya: {profit.costStatus === "UNKNOWN" ? "Belum lengkap" : "Terverifikasi untuk sumber tercatat"}. Biaya terverifikasi: {formatIdr(profit.knownCost)}. Expense belum terverifikasi: {profit.unverifiedExpenseCount}.</p>
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
                      {profit.actualCost === null ? "Belum diketahui" : formatIdr(profit.actualCost)}
                    </span>
                  </div>
                  <div>Labor: {profit.laborCost === null ? "Belum diketahui (cakupan payroll belum lengkap)" : formatIdr(profit.laborCost)}</div>
                  <div>Payroll dialokasikan: {formatIdr(profit.allocatedLaborCost)}</div>
                  <div>Material dialokasikan: {formatIdr(profit.materialCost)}</div>
                  <div>Alokasi tidak valid: {profit.invalidAllocationCount}</div>
                  <div>Cakupan: {profit.coverage} — belum membuktikan seluruh biaya</div>
                  <div>Margin subtotal sumber tercatat: {formatIdr(profit.recordedMargin)} (bukan laba lengkap)</div>
                  <div>Expense: {formatIdr(String(profit.expenseCost))}</div>
                  <div>Billed: {formatIdr(String(profit.billedAmount))}</div>
                  <div>
                    Margin sumber tercatat:{" "}
                    <span className="font-semibold text-[#0F4C75]">
                      {profit.margin === null ? "Belum dapat dihitung" : formatIdr(profit.margin)}
                    </span>
                  </div>
                  <div>Variance: {profit.variance === null ? "Belum dapat dihitung" : formatIdr(profit.variance)}</div>
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
